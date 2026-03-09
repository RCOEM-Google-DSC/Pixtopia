import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const TOTAL_QUESTIONS = 5;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { questionOrder, selectedIndex } = body;
  if (questionOrder === undefined || selectedIndex === undefined) {
    return NextResponse.json({ error: "questionOrder and selectedIndex are required" }, { status: 400 });
  }

  const admin = await createAdminClient();

  // Get team
  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id, points")
    .or(`leader_id.eq.${user.id},team_members_ids.cs.{${user.id}}`)
    .single();

  if (teamError || !team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // Get current progress
  const { data: progress, error: progressError } = await admin
    .from("team_round_progress")
    .select("*")
    .eq("team_id", team.id)
    .eq("round_id", "3")
    .single();

  if (progressError || !progress) {
    return NextResponse.json({ error: "Progress not found" }, { status: 404 });
  }

  if (progress.is_completed) {
    return NextResponse.json({ error: "Round already completed" }, { status: 400 });
  }

  // Fetch the question to validate the answer server-side
  const { data: question, error: questionError } = await admin
    .from("round_3_questions")
    .select("id, question_order, correct_index, points")
    .eq("question_order", questionOrder)
    .single();

  if (questionError || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const isCorrect = question.correct_index === selectedIndex;

  if (!isCorrect) {
    return NextResponse.json({ isCorrect: false, message: "Incorrect answer. Try again!" });
  }

  const awardedPoints = question.points;
  const newQuestionsAnswered = (progress.questions_answered ?? 0) + 1;
  const isRoundComplete = newQuestionsAnswered >= TOTAL_QUESTIONS;

  // 1. Update team points
  const { error: teamUpdateError } = await admin
    .from("teams")
    .update({ points: team.points + awardedPoints })
    .eq("id", team.id);

  if (teamUpdateError) {
    return NextResponse.json({ error: teamUpdateError.message }, { status: 500 });
  }

  // 2. Update progress
  const { error: progressUpdateError } = await admin
    .from("team_round_progress")
    .update({
      questions_answered: newQuestionsAnswered,
      is_completed: isRoundComplete,
    })
    .eq("team_id", team.id)
    .eq("round_id", "3");

  if (progressUpdateError) {
    return NextResponse.json({ error: progressUpdateError.message }, { status: 500 });
  }

  // 3. Upsert into submissions table (only on final completion)
  if (isRoundComplete) {
    const { error: submissionError } = await admin
      .from("submissions")
      .upsert({
        team_id: team.id,
        round3: {
          score: awardedPoints,
          hints_used: progress.hints_used,
          points_spent_on_hints: progress.points_spent,
          submitted_at: new Date().toISOString(),
        },
      });

    if (submissionError) {
      console.warn("⚠️ Could not update submissions record:", submissionError.message);
    }
  }

  return NextResponse.json({
    isCorrect: true,
    awardedPoints,
    newBalance: team.points + awardedPoints,
    questionsAnswered: newQuestionsAnswered,
    isRoundComplete,
  });
}
