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

async function getRound4Questions() {
  const now = Date.now();
  
  // Use cache if valid
  if (questionsCache.data && now - questionsCache.timestamp < CACHE_TTL) {
    return questionsCache.data;
  }

  // Fetch with retry - error check INSIDE retry wrapper
  const data = await withRetry(async () => {
    const admin = await createAdminClient();
    const result = await admin
      .from("questions")
      .select(
        "id, question_order, question, options, image_urls, video_url, answer, points",
      )
      .eq("round_id", "4")
      .order("question_order", { ascending: true })
      .order("id", { ascending: false });

    // Throw inside retry so network errors get retried
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data;
  });
  
  // Cache successful result
  questionsCache = { data: data ?? [], timestamp: now };
  
  return data ?? [];
}

async function getTeamForUser(userId: string) {
  // Retry wrapper with error check inside
  return withRetry(async () => {
    const admin = await createAdminClient();

    const result = await admin
      .from("teams")
      .select("id, points")
      .or(`leader_id.eq.${userId},team_members_ids.cs.{"${userId}"}`)
      .maybeSingle();

    // Throw inside retry so network errors get retried
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data;
  });
}

export async function GET(_request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [team, questions] = await Promise.all([
      getTeamForUser(user.id),
      getRound4Questions(),
    ]);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Deduplicate in JS (one row per order)
    const seen = new Map<number, any>();
    for (const q of questions) {
      if (!seen.has(q.question_order)) seen.set(q.question_order, q);
    }
    const uniqueQuestions = Array.from(seen.values())
      .sort((a, b) => a.question_order - b.question_order)
      .slice(0, 6);

    const admin = await createAdminClient();
    const { data: submission } = await admin
      .from("submissions")
      .select("round4")
      .eq("team_id", team.id)
      .maybeSingle();

    const r4 = submission?.round4 || {};

    // Build puzzle payload per question, exposing only revealed characters for Part A
    // and video/options for Part B.
    const puzzles = uniqueQuestions.map((q: any) => {
      if (q.question_order >= 4) {
        // Part B: Video MCQ
        return {
          order: q.question_order,
          question: q.question || "",
          video_url: q.video_url || "",
          options: q.options || [],
          points: q.points || 0,
          type: "mcq",
        };
      }

      // Part A: Visual Puzzle
      const hints: number[] = r4[`q${q.question_order}_hints_revealed`] || [];
      const revealedLetters = hints.map((idx: number) => ({
        index: idx,
        char: q.answer ? q.answer[idx] : "",
      }));
      return {
        order: q.question_order,
        image_urls: q.image_urls || [],
        answer_length: q.answer ? q.answer.length : 0,
        revealed_letters: revealedLetters,
        type: "rebus",
      };
    });

    const roundState: any = {
      is_completed: r4.is_completed || false,
      points_spent: r4.points_spent || 0,
    };

    // Dynamically add qN_completed and qN_hints_revealed for all 6 questions
    for (let i = 1; i <= 6; i++) {
      roundState[`q${i}_completed`] = r4[`q${i}_completed`] || false;
      roundState[`q${i}_hints_revealed`] =
        r4[`q${i}_hints_revealed`] || (i >= 4 ? false : []); // Boolean for Part B, array for Part A
    }

    return NextResponse.json(
      {
        puzzles,
        roundState,
        teamPoints: team.points,
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      },
    );
  } catch (err: any) {
    console.error("DEBUG ERR:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 },
    );
  }
}
