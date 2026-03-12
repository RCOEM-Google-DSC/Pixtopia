import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const TOTAL_QUESTIONS = 5;

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { questionOrder, selectedIndex } = body;
  if (questionOrder === undefined || selectedIndex === undefined) {
    return NextResponse.json({ error: "questionOrder and selectedIndex are required" }, { status: 400 });
  }

  const admin = await createAdminClient();

  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id, points")
    .or(`leader_id.eq.${user.id},team_members_ids.cs.{${user.id}}`)
    .single();

  if (teamError || !team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const { data: submission } = await admin
    .from("submissions")
    .select("*")
    .eq("team_id", team.id)
    .maybeSingle();

  const round3Sub = submission?.round3 || { answers: {}, hints_per_question: {}, score: 0 };
  const answers = round3Sub.answers || {};

  if (Object.keys(answers).length >= TOTAL_QUESTIONS) {
    return NextResponse.json({ error: "Round already completed" }, { status: 400 });
  }

  // Timer check
  const startTimes = round3Sub.question_start_times || {};
  const startTimeStr = startTimes[String(questionOrder)];
  if (!startTimeStr) {
      return NextResponse.json({ error: "Question not started" }, { status: 400 });
  }
  const startTime = new Date(startTimeStr).getTime();
  const now = Date.now();
  const timeElapsed = (now - startTime) / 1000;

  const { data: question, error: questionError } = await admin
    .from("round_3_questions")
    .select("id, question_order, correct_index, points")
    .eq("question_order", questionOrder)
    .single();

  if (questionError || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  let isCorrect = question.correct_index === selectedIndex;

  if (timeElapsed > 65 || selectedIndex === null) {
      isCorrect = false;
  }

  const awardedPoints = isCorrect ? question.points : 0;
  
  answers[String(questionOrder)] = selectedIndex ?? -1;
  const newQuestionsAnswered = Object.keys(answers).length;
  const isRoundComplete = newQuestionsAnswered >= TOTAL_QUESTIONS;

  const { error: teamUpdateError } = await admin
    .from("teams")
    .update({ points: team.points + awardedPoints })
    .eq("id", team.id);

  if (teamUpdateError) {
    return NextResponse.json({ error: teamUpdateError.message }, { status: 500 });
  }

  round3Sub.answers = answers;
  round3Sub.score = (round3Sub.score || 0) + awardedPoints;
  if (isRoundComplete) {
    round3Sub.submitted_at = new Date().toISOString();
  }

  let nextStartTimeStr = undefined;
  if (!isRoundComplete) {
    if (!round3Sub.question_start_times) round3Sub.question_start_times = {};
    nextStartTimeStr = new Date().toISOString();
    round3Sub.question_start_times[String(questionOrder + 1)] = nextStartTimeStr;
  }

  const payload = {
    team_id: team.id,
    ...(submission ?? {}),
    round3: round3Sub,
  };

  const { error: upsertErr } = await admin
    .from("submissions")
    .upsert(payload, { onConflict: "team_id" });

  if (upsertErr) {
    console.warn("⚠️ Could not update submissions record:", upsertErr.message);
  }

  return NextResponse.json({
    isCorrect,
    awardedPoints,
    newBalance: team.points + awardedPoints,
    questionsAnswered: newQuestionsAnswered,
    isRoundComplete,
    nextStartTime: nextStartTimeStr,
    message: isCorrect ? undefined : "Incorrect or timeout.",
  });
}

