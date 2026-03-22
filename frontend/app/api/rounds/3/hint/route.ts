import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { questionOrder } = body;
  if (questionOrder === undefined) {
    return NextResponse.json({ error: "questionOrder is required" }, { status: 400 });
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
  const hintsPerQ = round3Sub.hints_per_question || {};
  const questionKey = String(questionOrder);
  const hintsForThisQ = hintsPerQ[questionKey] || 0;

  const { data: question, error: questionError } = await admin
    .from("round_3_questions")
    .select("id, question_order, hints, hint_point")
    .eq("question_order", questionOrder)
    .single();

  if (questionError || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  if (hintsForThisQ >= (question.hints?.length ?? 0)) {
    return NextResponse.json({ error: "No more hints available for this question" }, { status: 400 });
  }

  const nextHintCost = question.hint_point ?? 10;

  if (team.points < nextHintCost) {
    return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
  }

  const hint = question.hints[hintsForThisQ];

  const { error: teamUpdateError } = await admin
    .from("teams")
    .update({ points: team.points - nextHintCost })
    .eq("id", team.id);

  if (teamUpdateError) {
    return NextResponse.json({ error: teamUpdateError.message }, { status: 500 });
  }

  hintsPerQ[questionKey] = hintsForThisQ + 1;
  const updatedRound3 = { ...round3Sub, hints_per_question: hintsPerQ };

  const payload = {
    team_id: team.id,
    ...(submission ?? {}),
    round3: updatedRound3,
  };

  const { error: upsertErr } = await admin
    .from("submissions")
    .upsert(payload, { onConflict: "team_id" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    hint,
    cost: nextHintCost,
    newBalance: team.points - nextHintCost,
    hintsUsedForQuestion: hintsForThisQ + 1,
  });
}

