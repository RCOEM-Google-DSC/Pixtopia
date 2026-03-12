import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify session
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

    // Fetch Round 4 Part 1 (order=1) puzzle — use limit(1) in case of duplicate rows
    const { data: question, error: questionError } = await admin
      .from("questions")
      .select("*")
      .eq("round_id", "4")
      .eq("order", 1)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (questionError || !question) {
      return NextResponse.json({ error: "Puzzle not found" }, { status: 404 });
    }

    // Fetch team submission for Round 4
    const { data: submission } = await admin
      .from("submissions")
      .select("round4")
      .eq("team_id", team.id)
      .maybeSingle();

    const r4 = submission?.round4 || { hints_revealed: [], is_completed: false, points_spent: 0 };
    const hintsRevealed: number[] = r4.hints_revealed || [];
    
    // Only reveal characters for hints_revealed
    const revealedLetters = hintsRevealed.map(idx => ({
       index: idx,
       char: question.answer ? question.answer[idx] : ""
    }));

    return NextResponse.json({
      roundState: {
        hints_revealed: hintsRevealed,
        is_completed: r4.is_completed || false,
        points_spent: r4.points_spent || 0
      },
      puzzle: {
        image_urls: question.image_urls || [],
        answer_length: question.answer ? question.answer.length : 0,
        // Only provide the full answer if completed
        answer: r4.is_completed ? question.answer : null,
        revealed_letters: revealedLetters
      },
      teamPoints: team.points
    });
  } catch (err: any) {
    console.error("DEBUG ERR:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
