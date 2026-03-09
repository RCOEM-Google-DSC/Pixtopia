import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { questionOrder } = body;
  if (questionOrder === undefined) {
    return NextResponse.json({ error: "questionOrder is required" }, { status: 400 });
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
    .select("hints_used, hints_per_question, points_spent")
    .eq("team_id", team.id)
    .eq("round_id", "3")
    .single();

  if (progressError || !progress) {
    return NextResponse.json({ error: "Progress not found" }, { status: 404 });
  }

  // Per-question hint count
  const hintsPerQ: Record<string, number> = (progress.hints_per_question as Record<string, number>) ?? {};
  const questionKey = String(questionOrder);
  const hintsForThisQ = hintsPerQ[questionKey] ?? 0;

  // Fetch the question to get its hints array
  const { data: question, error: questionError } = await admin
    .from("round_3_questions")
    .select("id, question_order, hints")
    .eq("question_order", questionOrder)
    .single();

  if (questionError || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  if (hintsForThisQ >= (question.hints?.length ?? 0)) {
    return NextResponse.json({ error: "No more hints available for this question" }, { status: 400 });
  }

  // Cost based on total hints used across all questions (keeps global pricing fair)
  const nextHintCost = (progress.hints_used + 1) * 10;

  if (team.points < nextHintCost) {
    return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
  }

  const hint = question.hints[hintsForThisQ];

  // Update team points
  const { error: teamUpdateError } = await admin
    .from("teams")
    .update({ points: team.points - nextHintCost })
    .eq("id", team.id);

  if (teamUpdateError) {
    return NextResponse.json({ error: teamUpdateError.message }, { status: 500 });
  }

  // Update progress: increment global hints_used + per-question count
  const updatedHintsPerQ = { ...hintsPerQ, [questionKey]: hintsForThisQ + 1 };

  const { error: progressUpdateError } = await admin
    .from("team_round_progress")
    .update({
      hints_used: progress.hints_used + 1,
      hints_per_question: updatedHintsPerQ,
      points_spent: progress.points_spent + nextHintCost,
    })
    .eq("team_id", team.id)
    .eq("round_id", "3");

  if (progressUpdateError) {
    return NextResponse.json({ error: progressUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({
    hint,
    cost: nextHintCost,
    newBalance: team.points - nextHintCost,
    hintsUsedForQuestion: hintsForThisQ + 1,
  });
}
