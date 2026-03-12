import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { answer, questionOrder = 1 } = body;
    if (!answer) {
      return NextResponse.json(
        { error: "Answer is required" },
        { status: 400 },
      );
    }
    if (questionOrder < 1 || questionOrder > 3) {
      return NextResponse.json(
        { error: "Invalid questionOrder" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Fetch team
    const { data: team, error: teamError } = await admin
      .from("teams")
      .select("id, points")
      .or(`leader_id.eq.${user.id},team_members_ids.cs.{${user.id}}`)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Fetch Round 4 Part 1 puzzle.
    // NOTE: "order" is a reserved PostgREST keyword — filter in JS instead.
    const { data: questions, error: questionError } = await admin
      .from("questions")
      .select("*")
      .eq("round_id", "4")
      .order("id", { ascending: false });

    // Deduplicate questions by order the same way the state route does
    const seen = new Map<number, any>();
    for (const q of questions ?? []) {
      const existing = seen.get(q.order);
      if (!existing || q.id > existing.id) seen.set(q.order, q);
    }

    const question = seen.get(questionOrder) ?? null;

    if (questionError || !question || !question.answer) {
      return NextResponse.json({ error: "Puzzle not found" }, { status: 404 });
    }

    // Validate answer (case insensitive, trimmed)
    if (answer.trim().toUpperCase() !== question.answer.toUpperCase()) {
      return NextResponse.json({ error: "Incorrect answer" }, { status: 400 });
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

    // All done when every seeded question is completed
    const totalQuestions = seen.size;
    const allDone = Array.from(
      { length: totalQuestions },
      (_, i) => i + 1,
    ).every((n) => (n === questionOrder ? true : !!r4[`q${n}_completed`]));

    const updatedRound4 = {
      ...r4,
      [qCompletedKey]: true,
      is_completed: allDone,
      submitted_at: new Date().toISOString(),
    };

    // Award points
    const { error: teamUpdateError } = await admin
      .from("teams")
      .update({ points: team.points + (question.points || 0) })
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
      pointsAdded: question.points || 0,
      newBalance: team.points + (question.points || 0),
      allDone,
    });
  } catch (err: any) {
    console.error("DEBUG ERR:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 },
    );
  }
}
