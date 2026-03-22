import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, createAdminClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

const getRound4QuestionByOrder = unstable_cache(
  async (order: number) => {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("questions")
      .select("id, question_order, answer, correct_index, points")
      .eq("round_id", "4")
      .order("id", { ascending: false })
      .limit(24);
    if (error) throw new Error(error.message);
    return (data ?? []).find((q) => q.question_order === order) ?? null;
  },
  ["round4-submit-question-by-order"],
  { revalidate: 300 },
);

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}

async function getTeamForUser(userId: string) {
  const admin = await createAdminClient();

  // Fast path for most users: leader_id match.
  const leaderMatch = await admin
    .from("teams")
    .select("id, points")
    .eq("leader_id", userId)
    .maybeSingle();
  if (leaderMatch.data) return leaderMatch.data;

  // Fallback for non-leader members.
  const memberMatch = await admin
    .from("teams")
    .select("id, points")
    .contains("team_members_ids", [userId])
    .maybeSingle();

  if (leaderMatch.error && !memberMatch.data) {
    throw new Error(leaderMatch.error.message);
  }
  if (memberMatch.error && !memberMatch.data) {
    throw new Error(memberMatch.error.message);
  }
  return memberMatch.data;
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
    if (!skipped) {
      if (
        questionOrder < 1 ||
        (questionOrder > 3 && answerIndex === undefined)
      ) {
        if (!answer && answerIndex === undefined) {
          return NextResponse.json(
            { error: "Answer is required" },
            { status: 400 },
          );
        }
      }
    }
    if (questionOrder < 1 || questionOrder > 6) {
      return NextResponse.json(
        { error: "Invalid questionOrder" },
        { status: 400 },
      );
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

    // Validate answer based on question type
    if (!skipped) {
      if (questionOrder >= 4) {
        // Part B: MCQ
        if (answerIndex === undefined) {
          return NextResponse.json(
            { error: "Answer index is required" },
            { status: 400 },
          );
        }
        if (Number(answerIndex) !== question.correct_index) {
          return NextResponse.json(
            { error: "Incorrect answer" },
            { status: 400 },
          );
        }
      } else {
        // Part A: Visual Puzzle
        if (!answer) {
          return NextResponse.json(
            { error: "Answer is required" },
            { status: 400 },
          );
        }
        if (
          normalizeAnswer(answer) !== normalizeAnswer(question.answer || "")
        ) {
          return NextResponse.json(
            { error: "Incorrect answer" },
            { status: 400 },
          );
        }
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
        pointsAdded: 0,
        alreadyCompleted: true,
        allDone: r4.is_completed || false,
      });
    }

    // Check if all questions (1-6) are completed
    const allDone = [1, 2, 3, 4, 5, 6].every((n) =>
      n === questionOrder ? true : !!r4[`q${n}_completed`],
    );

    const updatedRound4 = {
      ...r4,
      [qCompletedKey]: true,
      is_completed: allDone,
      submitted_at: new Date().toISOString(),
    };

    // Award points only if not skipped
    const pointsToAdd = skipped ? 0 : question.points || 0;
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
