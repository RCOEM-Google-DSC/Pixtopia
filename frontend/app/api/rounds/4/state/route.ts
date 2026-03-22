import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, createAdminClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";

const getRound4Questions = unstable_cache(
  async () => {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("questions")
      .select(
        "id, question_order, question, options, image_urls, video_url, answer, points",
      )
      .eq("round_id", "4")
      .order("question_order", { ascending: true })
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  ["round4-questions"],
  { revalidate: 300 },
);

async function getTeamForUser(userId: string) {
  const admin = await createAdminClient();

  const { data, error } = await admin
    .from("teams")
    .select("id, points")
    .or(`leader_id.eq.${userId},team_members_ids.cs.{"${userId}"}`)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function GET(_request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
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
      if (!seen.has(q.question_order)) seen.set(q.question_order, q);
    }
    const uniqueQuestions = Array.from(seen.values())
      .sort((a, b) => a.question_order - b.question_order)
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
      if (q.question_order >= 4) {
        // Part B: Video MCQ
        return {
          order: q.question_order,
          question: q.question || "",
          video_url: q.video_url || "",
          options: q.options || [],
          points: q.points || 0,
          type: "mcq",
        };
      }

      // Part A: Visual Puzzle
      const hints: number[] = r4[`q${q.question_order}_hints_revealed`] || [];
      const revealedLetters = hints.map((idx: number) => ({
        index: idx,
        char: q.answer ? q.answer[idx] : "",
      }));
      return {
        order: q.question_order,
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
