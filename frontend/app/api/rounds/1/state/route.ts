import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/rounds/1/state
 *
 * Per-team round 1 state (mirrors round 3 approach).
 * Tracks questions_answered, question_start_times, and is_completed.
 * Each team gets their own timer per question.
 */
export async function GET(_request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Fetch questions
    const { data: questions, error: questionsError } = await admin
      .from("questions")
      .select("*")
      .eq("round_id", "1")
      .order("order", { ascending: true });

    if (questionsError) {
      return NextResponse.json(
        { error: questionsError.message },
        { status: 500 }
      );
    }

    const totalQuestions = questions?.length ?? 0;

    // Read existing submission
    const { data: submission } = await admin
      .from("submissions")
      .select("round1")
      .eq("team_id", team.id)
      .maybeSingle();

    const r1 = submission?.round1 || {};
    const answers = r1.answers || {};
    const currentQuestion = r1.current_question ?? 0; // only incremented on timer expiry
    const questionsAnswered = Object.keys(answers).length;
    const isCompleted = r1.is_completed === true;

    let startTimes = r1.question_start_times || {};
    let needsUpsert = false;

    // If not completed, set start time for the current question (1-indexed)
    const currentQOrder = currentQuestion + 1;
    if (!isCompleted && currentQOrder <= totalQuestions && !startTimes[currentQOrder]) {
      startTimes[currentQOrder] = new Date().toISOString();
      needsUpsert = true;
    }

    if (needsUpsert) {
      r1.question_start_times = startTimes;
      const payload = {
        team_id: team.id,
        ...(submission ?? {}),
        round1: r1,
      };
      await admin
        .from("submissions")
        .upsert(payload, { onConflict: "team_id" });
    }

    const teamProgress = {
      current_question: currentQuestion,
      questions_answered: questionsAnswered,
      question_start_times: startTimes,
      is_completed: isCompleted,
    };

    // Get round started time from game_state
    const { data: gs } = await admin
      .from("game_state")
      .select("round_statuses")
      .limit(1)
      .single();
    const roundStartedAt = gs?.round_statuses?.["1"]?.startedAt || null;

    return NextResponse.json({
      questions: questions ?? [],
      teamProgress,
      teamPoints: team.points,
      roundScore: r1.score || 0,
      answers,
      roundStartedAt,
    });
  } catch (err: any) {
    console.error("Round 1 state error:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
