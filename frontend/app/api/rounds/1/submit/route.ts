import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/rounds/1/submit
 *
 * Submits an answer for one question at a time.
 * Body: { questionId: string, selectedIndex: number | null, setNextStartTime?: boolean }
 *
 * - Records the answer
 * - If correct, adds points to the team
 * - If setNextStartTime is true, records start time for next question
 * - If all questions answered, marks round as completed
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { questionId, selectedIndex, setNextStartTime } = await request.json();

    const admin = await createAdminClient();

    // Find team
    const { data: team, error: teamError } = await admin
      .from("teams")
      .select("*")
      .or(`leader_id.eq.${user.id},team_members_ids.cs.{${user.id}}`)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Get the question to check correctness
    const { data: question } = await admin
      .from("questions")
      .select("*")
      .eq("id", questionId)
      .single();

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // Get total questions count
    const { count: totalQuestions } = await admin
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("round_id", "1");

    // Read current submission
    const { data: submission } = await admin
      .from("submissions")
      .select("*")
      .eq("team_id", team.id)
      .maybeSingle();

    const r1 = submission?.round1 || {};
    const answers = r1.answers || {};
    const startTimes = r1.question_start_times || {};

    // Don't allow re-answering
    if (answers[questionId] !== undefined) {
      return NextResponse.json({
        alreadyAnswered: true,
        questionsAnswered: Object.keys(answers).length,
      });
    }

    // Record the answer
    answers[questionId] = selectedIndex;
    const questionsAnswered = Object.keys(answers).length;
    const isRoundComplete = questionsAnswered >= (totalQuestions ?? 0);

    // Calculate if correct and add points
    let pointsAwarded = 0;
    if (selectedIndex !== null && selectedIndex === question.correct_index) {
      pointsAwarded = question.points || 0;
      if (pointsAwarded > 0) {
        await admin
          .from("teams")
          .update({ points: team.points + pointsAwarded })
          .eq("id", team.id);
      }
    }

    // Calculate total round score
    let totalScore = 0;
    const { data: allQuestions } = await admin
      .from("questions")
      .select("id, correct_index, points")
      .eq("round_id", "1");

    if (allQuestions) {
      for (const q of allQuestions) {
        if (answers[q.id] === q.correct_index) {
          totalScore += q.points || 0;
        }
      }
    }

    // Only set start time for next question if explicitly requested
    // (i.e., when the timer expires, not when the user manually answers)
    let nextStartTimeStr = undefined;
    if (setNextStartTime && !isRoundComplete) {
      const nextQOrder = questionsAnswered + 1;
      if (!startTimes[nextQOrder]) {
        nextStartTimeStr = new Date().toISOString();
        startTimes[nextQOrder] = nextStartTimeStr;
      }
    }

    // Update submission
    const updatedR1 = {
      ...r1,
      answers,
      score: totalScore,
      question_start_times: startTimes,
      is_completed: isRoundComplete,
      ...(isRoundComplete ? { submitted_at: new Date().toISOString() } : {}),
    };

    const payload = {
      team_id: team.id,
      ...(submission ?? {}),
      round1: updatedR1,
    };

    await admin.from("submissions").upsert(payload, { onConflict: "team_id" });

    return NextResponse.json({
      correct: selectedIndex === question.correct_index,
      pointsAwarded,
      questionsAnswered,
      isRoundComplete,
      totalScore,
      nextStartTime: nextStartTimeStr,
    });
  } catch (err: any) {
    console.error("Round 1 submit error:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
