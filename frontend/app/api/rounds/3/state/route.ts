import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, createAdminClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await createAdminClient();

    const { data: team, error: teamError } = await admin
      .from("teams")
      .select("*")
      .or(`leader_id.eq.${user.id},team_members_ids.cs.{${user.id}}`)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const { data: questionsRaw, error: questionsError } = await admin
      .from("round_3_questions")
      .select("id, question_order, question, image_urls, hints, points, hint_point, correct_index")
      .order("question_order", { ascending: true });

    if (questionsError) {
      return NextResponse.json({ error: questionsError.message }, { status: 500 });
    }

    // Read progress from submissions table
    const { data: submission } = await admin
      .from("submissions")
      .select("round3")
      .eq("team_id", team.id)
      .maybeSingle();

    const r3 = submission?.round3 || { answers: {}, hints_per_question: {}, score: 0 };
    const answers = r3.answers || {};
    const hintsPerQ = r3.hints_per_question || {};
    const questionsAnswered = Object.keys(answers).length;
    const isCompleted = questionsAnswered >= 10; // 10 total questions

    let startTimes = r3.question_start_times || {};
    let needsUpsert = false;

    const currentQOrder = questionsAnswered + 1;
    if (currentQOrder <= 10 && !startTimes[currentQOrder]) {
      startTimes[currentQOrder] = new Date().toISOString();
      needsUpsert = true;
    }

    if (needsUpsert) {
      r3.question_start_times = startTimes;
      const payload = {
        team_id: team.id,
        ...(submission ?? {}),
        round3: r3
      };
      await admin.from("submissions").upsert(payload, { onConflict: "team_id" });
    }

    const teamProgress = {
      hints_used: Object.values(hintsPerQ).reduce((a: any, b: any) => a + b, 0),
      hints_per_question: hintsPerQ,
      questions_answered: questionsAnswered,
      points_spent: 0, // Legacy, kept for typing compatibility
      is_completed: isCompleted,
      question_start_times: startTimes,
    };

    // Make sure we supply a default for hint_point in case it is null
    const questionsWithHintPoint = questionsRaw?.map(q => {
      const qObj: any = {
        ...q,
        hint_point: q.hint_point ?? 10
      };
      if (!isCompleted) {
        delete qObj.correct_index; // Hide correct index until completed
      } else {
        qObj.user_answer = answers[String(q.question_order)];
        qObj.is_correct = qObj.user_answer === qObj.correct_index;
      }
      return qObj;
    }) ?? [];

    // Get round started time from game_state
    const { data: gs } = await admin
      .from("game_state")
      .select("round_statuses")
      .limit(1)
      .single();
    const roundStartedAt = gs?.round_statuses?.["3"]?.startedAt || null;

    return NextResponse.json({
      questions: questionsWithHintPoint,
      teamProgress,
      teamPoints: team.points,
      roundScore: r3.score || 0,
      roundStartedAt
    });
  } catch (err: any) {
    console.error("DEBUG ERR:", err);
    return NextResponse.json({ error: err.message || "Unknown error", stack: err.stack }, { status: 500 });
  }
}


