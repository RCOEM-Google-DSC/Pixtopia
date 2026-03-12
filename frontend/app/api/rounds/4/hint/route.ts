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

    const { currentAnswer } = body; // Optional: can be used to avoid revealing letters they already typed

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

    // Fetch team submission for Round 4
    const { data: submission } = await admin
      .from("submissions")
      .select("round4")
      .eq("team_id", team.id)
      .maybeSingle();

    const r4 = submission?.round4 || { hints_revealed: [], points_spent: 0 };
    const hintsRevealed: number[] = r4.hints_revealed || [];

    if (hintsRevealed.length >= question.answer.length) {
      return NextResponse.json({ error: "All letters revealed" }, { status: 400 });
    }

    // Cost: 10 * (hintsRevealed.length + 1)
    const cost = 10 * (hintsRevealed.length + 1);

    if (team.points < cost) {
      return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
    }

    // Find indices to reveal
    // Strategy: indices NOT in hintsRevealed AND (optionally) NOT correctly typed in currentAnswer
    const allIndices = Array.from({ length: question.answer.length }, (_, i) => i);
    const availableIndices = allIndices.filter(idx => !hintsRevealed.includes(idx));
    
    // Further filter by currentAnswer if provided
    let finalAvailable = availableIndices;
    if (currentAnswer && currentAnswer.length === question.answer.length) {
       finalAvailable = availableIndices.filter(idx => currentAnswer[idx] !== question.answer[idx]);
    }
    
    // If user somehow typed everything correctly but wants a hint? 
    // Just give a random one from availableIndices then.
    if (finalAvailable.length === 0) {
       finalAvailable = availableIndices;
    }

    const revealedIndex = finalAvailable[Math.floor(Math.random() * finalAvailable.length)];
    const revealedChar = question.answer[revealedIndex];

    // Update team points
    const { error: teamUpdateError } = await admin
      .from("teams")
      .update({ points: team.points - cost })
      .eq("id", team.id);

    if (teamUpdateError) {
      return NextResponse.json({ error: teamUpdateError.message }, { status: 500 });
    }

    // Update submission
    const updatedHints = [...hintsRevealed, revealedIndex];
    const updatedRound4 = { 
      ...r4, 
      hints_revealed: updatedHints,
      points_spent: (r4.points_spent || 0) + cost
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
      revealedIndex,
      revealedChar,
      cost,
      newBalance: team.points - cost
    });

  } catch (err: any) {
    console.error("DEBUG ERR:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
