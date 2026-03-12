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

    // Fetch all round-4 questions and filter in JS
    // (PostgREST treats "order" as a reserved sort keyword in filter URLs)
    const { data: allQuestions, error: questionError } = await admin
      .from("questions")
      .select("*")
      .eq("round_id", "4")
      .order("id", { ascending: true });

    if (questionError) {
      return NextResponse.json(
        { error: "Failed to fetch questions" },
        { status: 500 },
      );
    }

    // Deduplicate: if multiple rows share the same `order` (from re-runs of the
    // seed script), keep only the most-recently inserted one (highest id sorts last
    // when UUIDs are time-based; fall back to array position).
    const seen = new Map<number, any>();
    for (const q of allQuestions ?? []) {
      const existing = seen.get(q.order);
      if (!existing || q.id > existing.id) seen.set(q.order, q);
    }
    const uniqueQuestions = Array.from(seen.values())
      .sort((a, b) => a.order - b.order)
      .slice(0, 3); // hard cap at 3 questions max

    const { data: submission } = await admin
      .from("submissions")
      .select("round4")
      .eq("team_id", team.id)
      .maybeSingle();

    const r4 = submission?.round4 || {};

    // Build puzzle payload per question, exposing only revealed characters
    const puzzles = uniqueQuestions.map((q: any) => {
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
      };
    });

    return NextResponse.json({
      puzzles,
      roundState: {
        q1_completed: r4.q1_completed || false,
        q2_completed: r4.q2_completed || false,
        q3_completed: r4.q3_completed || false,
        q1_hints_revealed: r4.q1_hints_revealed || [],
        q2_hints_revealed: r4.q2_hints_revealed || [],
        q3_hints_revealed: r4.q3_hints_revealed || [],
        is_completed: r4.is_completed || false,
        points_spent: r4.points_spent || 0,
      },
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
