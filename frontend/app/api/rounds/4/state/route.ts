import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Optimized: Fetch ONLY necessary columns and limit to round 4
    const { data: allQuestions, error: questionError } = await admin
      .from("questions")
      .select("id, order, question, options, image_urls, video_url, answer, points")
      .eq("round_id", "4")
      .order("order", { ascending: true })
      .order("id", { ascending: false });

    if (questionError) {
      return NextResponse.json(
        { error: "Failed to fetch questions" },
        { status: 500 },
      );
    }

    // Deduplicate in JS (one row per order)
    const seen = new Map<number, any>();
    for (const q of allQuestions ?? []) {
      if (!seen.has(q.order)) seen.set(q.order, q);
    }
    const uniqueQuestions = Array.from(seen.values())
      .sort((a, b) => a.order - b.order)
      .slice(0, 6);

    const { data: submission } = await admin
      .from("submissions")
      .select("round4")
      .eq("team_id", team.id)
      .maybeSingle();

    const r4 = submission?.round4 || {};

    // Build puzzle payload per question, exposing only revealed characters for Part A
    // and video/options for Part B.
    const puzzles = uniqueQuestions.map((q: any) => {
      if (q.order >= 4) {
        // Part B: Video MCQ
        return {
          order: q.order,
          question: q.question || "",
          video_url: q.video_url || "",
          options: q.options || [],
          points: q.points || 0,
          type: "mcq"
        };
      }
      
      // Part A: Visual Puzzle
      const hints: number[] = r4[`q${q.order}_hints_revealed`] || [];
      const revealedLetters = hints.map((idx: number) => ({
        index: idx,
        char: q.answer ? q.answer[idx] : "",
      }));
      return {
        order: q.order,
        image_urls: q.image_urls || [],
        answer_length: q.answer ? q.answer.length : 0,
        revealed_letters: revealedLetters,
        type: "rebus"
      };
    });

    const roundState: any = {
      is_completed: r4.is_completed || false,
      points_spent: r4.points_spent || 0,
    };

    // Dynamically add qN_completed and qN_hints_revealed for all 6 questions
    for (let i = 1; i <= 6; i++) {
      roundState[`q${i}_completed`] = r4[`q${i}_completed`] || false;
      roundState[`q${i}_hints_revealed`] = r4[`q${i}_hints_revealed`] || (i >= 4 ? false : []); // Boolean for Part B, array for Part A
    }

    return NextResponse.json({
      puzzles,
      roundState,
      teamPoints: team.points,
    });
  } catch (err: any) {
    console.error("DEBUG ERR:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 },
    );
  }
}
