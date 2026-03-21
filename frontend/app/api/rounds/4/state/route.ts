import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

const getRound4Questions = unstable_cache(
  async () => {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("questions")
      .select(
        "id, order, question, options, image_urls, video_url, answer, points",
      )
      .eq("round_id", "4")
      .order("order", { ascending: true })
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  ["round4-questions"],
  { revalidate: 300 },
);

async function getTeamForUser(userId: string) {
  const admin = await createAdminClient();

  // Fast path for most users: leader_id match.
  const leaderMatch = await admin
    .from("teams")
    .select("id, points")
    .eq("leader_id", userId)
    .maybeSingle();
  if (leaderMatch.data) return leaderMatch.data;

  // Fallback for non-leader members.
  const memberMatch = await admin
    .from("teams")
    .select("id, points")
    .contains("team_members_ids", [userId])
    .maybeSingle();

  if (leaderMatch.error && !memberMatch.data) {
    throw new Error(leaderMatch.error.message);
  }
  if (memberMatch.error && !memberMatch.data) {
    throw new Error(memberMatch.error.message);
  }
  return memberMatch.data;
}

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

    const [team, questions] = await Promise.all([
      getTeamForUser(user.id),
      getRound4Questions(),
    ]);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Deduplicate in JS (one row per order)
    const seen = new Map<number, any>();
    for (const q of questions) {
      if (!seen.has(q.order)) seen.set(q.order, q);
    }
    const uniqueQuestions = Array.from(seen.values())
      .sort((a, b) => a.order - b.order)
      .slice(0, 6);

    const admin = await createAdminClient();
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
          type: "mcq",
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
        type: "rebus",
      };
    });

    const roundState: any = {
      is_completed: r4.is_completed || false,
      points_spent: r4.points_spent || 0,
    };

    // Dynamically add qN_completed and qN_hints_revealed for all 6 questions
    for (let i = 1; i <= 6; i++) {
      roundState[`q${i}_completed`] = r4[`q${i}_completed`] || false;
      roundState[`q${i}_hints_revealed`] =
        r4[`q${i}_hints_revealed`] || (i >= 4 ? false : []); // Boolean for Part B, array for Part A
    }

    return NextResponse.json(
      {
        puzzles,
        roundState,
        teamPoints: team.points,
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      },
    );
  } catch (err: any) {
    console.error("DEBUG ERR:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 },
    );
  }
}
