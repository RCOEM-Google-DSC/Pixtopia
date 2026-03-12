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

    const { answer } = body;
    if (!answer) {
      return NextResponse.json({ error: "Answer is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
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

    // Fetch Round 4 Part 1 puzzle
    const { data: question, error: questionError } = await admin
      .from("questions")
      .select("*")
      .eq("round_id", "4")
      .eq("order", 1)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (questionError || !question || !question.answer) {
      return NextResponse.json({ error: "Puzzle not found" }, { status: 404 });
    }

    // Validate answer (case insensitive, trimmed)
    if (answer.trim().toUpperCase() !== question.answer.toUpperCase()) {
      return NextResponse.json({ error: "Incorrect answer" }, { status: 400 });
    }

    // Correct! 
    // 1. Update team points
    const { error: teamUpdateError } = await admin
      .from("teams")
      .update({ points: team.points + (question.points || 0) })
      .eq("id", team.id);

    if (teamUpdateError) {
      return NextResponse.json({ error: teamUpdateError.message }, { status: 500 });
    }

    // 2. Update submission to completed
    const { data: submission } = await admin
      .from("submissions")
      .select("round4")
      .eq("team_id", team.id)
      .maybeSingle();

    const r4 = submission?.round4 || { hints_revealed: [], points_spent: 0 };
    const updatedRound4 = { 
      ...r4, 
      is_completed: true,
      score: (question.points || 0) - (r4.points_spent || 0),
      submitted_at: new Date().toISOString()
    };

    const { error: upsertErr } = await admin
      .from("submissions")
      .upsert({
        team_id: team.id,
        ...(submission ?? {}),
        round4: updatedRound4
      }, { onConflict: "team_id" });

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pointsAdded: question.points || 0,
      newBalance: team.points + (question.points || 0)
    });

  } catch (err: any) {
    console.error("DEBUG ERR:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
