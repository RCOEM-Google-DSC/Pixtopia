import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, createAdminClient } from "@/lib/supabase/server";

// Retry helper for transient network failures
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 500
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = err?.message?.toLowerCase() || "";
      const isTransient =
        msg.includes("fetch failed") ||
        msg.includes("timeout") ||
        msg.includes("network") ||
        msg.includes("aborted") ||
        msg.includes("econnrefused");
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      // Exponential backoff
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError;
}

// In-memory cache for questions (avoids caching failures)
let questionsCache: { data: any[] | null; timestamp: number } = {
  data: null,
  timestamp: 0,
};
const CACHE_TTL = 300000; // 5 minutes

async function getRound4QuestionByOrder(order: number) {
  const now = Date.now();
  
  // Use cache if valid
  if (questionsCache.data && now - questionsCache.timestamp < CACHE_TTL) {
    return questionsCache.data.find((q) => q.question_order === order) ?? null;
  }

  // Fetch with retry - error check INSIDE retry wrapper
  const data = await withRetry(async () => {
    const admin = await createAdminClient();
    const result = await admin
      .from("questions")
      .select("id, question_order, answer, correct_index, points")
      .eq("round_id", "4")
      .order("id", { ascending: false })
      .limit(24);

    // Throw inside retry so network errors get retried
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data;
  });
  
  // Cache successful result
  questionsCache = { data: data ?? [], timestamp: now };
  
  return (data ?? []).find((q) => q.question_order === order) ?? null;
}

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}

async function getTeamForUser(userId: string) {
  // Retry wrapper with error check inside
  return withRetry(async () => {
    const admin = await createAdminClient();

    // Fast path for most users: leader_id match.
    const leaderMatch = await admin
      .from("teams")
      .select("id, points")
      .eq("leader_id", userId)
      .maybeSingle();
    
    // Check for network errors first
    if (leaderMatch.error) {
      const msg = leaderMatch.error.message.toLowerCase();
      if (msg.includes("fetch") || msg.includes("network") || msg.includes("timeout")) {
        throw new Error(leaderMatch.error.message);
      }
    }
    
    if (leaderMatch.data) return leaderMatch.data;

    // Fallback for non-leader members.
    const memberMatch = await admin
      .from("teams")
      .select("id, points")
      .contains("team_members_ids", [userId])
      .maybeSingle();

    // Check for network errors
    if (memberMatch.error) {
      const msg = memberMatch.error.message.toLowerCase();
      if (msg.includes("fetch") || msg.includes("network") || msg.includes("timeout")) {
        throw new Error(memberMatch.error.message);
      }
    }

    if (leaderMatch.error && !memberMatch.data) {
      throw new Error(leaderMatch.error.message);
    }
    if (memberMatch.error && !memberMatch.data) {
      throw new Error(memberMatch.error.message);
    }
    return memberMatch.data;
  });
}

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { answer, answerIndex, questionOrder = 1, skipped = false } = body;
    
    // Validate questionOrder range (Part A: 1-7, Part B: 8-10)
    if (questionOrder < 1 || questionOrder > 10) {
      return NextResponse.json(
        { error: "Invalid questionOrder" },
        { status: 400 },
      );
    }

    // Only validate answer/answerIndex when not skipped
    if (!skipped) {
      if (questionOrder >= 8) {
        // Part B: MCQ - requires answerIndex
        if (answerIndex === undefined) {
          return NextResponse.json(
            { error: "Answer index is required" },
            { status: 400 },
          );
        }
      }
      // Part A: answer can be empty (will just be marked wrong)
    }

    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [team, question] = await Promise.all([
      getTeamForUser(user.id),
      getRound4QuestionByOrder(questionOrder),
    ]);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (!question) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 },
      );
    }

    const admin = await createAdminClient();

    // Check if answer is correct (only award points if correct, not case sensitive)
    let isCorrect = false;
    if (!skipped) {
      if (questionOrder >= 8) {
        // Part B: MCQ
        isCorrect = Number(answerIndex) === question.correct_index;
      } else {
        // Part A: Visual Puzzle - case insensitive comparison
        const userAnswer = normalizeAnswer(answer || "");
        const correctAnswer = normalizeAnswer(question.answer || "");
        isCorrect = userAnswer.length > 0 && userAnswer === correctAnswer;
      }
    }

    // Fetch existing submission
    const { data: submission } = await admin
      .from("submissions")
      .select("round4")
      .eq("team_id", team.id)
      .maybeSingle();

    const r4 = submission?.round4 || {};
    const qCompletedKey = `q${questionOrder}_completed`;

    // Don't double-award points if already completed
    if (r4[qCompletedKey]) {
      return NextResponse.json({
        success: true,
        correct: false,
        pointsAdded: 0,
        alreadyCompleted: true,
        allDone: r4.is_completed || false,
      });
    }

    // Check if all questions (1-7 for Part A, 8-10 for Part B) are completed
    // Part A: questions 1-7, Part B: questions 8-10
    const allPartADone = [1, 2, 3, 4, 5, 6, 7].every((n) =>
      n === questionOrder ? true : !!r4[`q${n}_completed`],
    );
    const allPartBDone = [8, 9, 10].every((n) =>
      n === questionOrder ? true : !!r4[`q${n}_completed`],
    );
    const allDone = allPartADone && allPartBDone;

    const updatedRound4 = {
      ...r4,
      [qCompletedKey]: true,
      is_completed: allDone,
      submitted_at: new Date().toISOString(),
    };

    // Award points ONLY if correct (not skipped and answer matches)
    const pointsToAdd = isCorrect ? (question.points || 0) : 0;
    const { error: teamUpdateError } = await admin
      .from("teams")
      .update({ points: team.points + pointsToAdd })
      .eq("id", team.id);

    if (teamUpdateError) {
      return NextResponse.json(
        { error: teamUpdateError.message },
        { status: 500 },
      );
    }

    const { error: upsertErr } = await admin.from("submissions").upsert(
      {
        team_id: team.id,
        ...(submission ?? {}),
        round4: updatedRound4,
      },
      { onConflict: "team_id" },
    );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      correct: isCorrect,
      pointsAdded: pointsToAdd,
      newBalance: team.points + pointsToAdd,
      allDone,
      skipped,
    });
  } catch (err: any) {
    console.error("DEBUG ERR:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 },
    );
  }
}
