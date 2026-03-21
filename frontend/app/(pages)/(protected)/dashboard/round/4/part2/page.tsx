import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import ClientPage from "./ClientPage";

export const dynamic = "force-dynamic";

async function getInitialState() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    if (process.env.NEXT_PUBLIC_IS_DEV !== "true") {
      redirect("/login");
    }
    return null;
  }

  const admin = await createAdminClient();

  // Fast path for most users: leader_id match.
  const leaderMatch = await admin
    .from("teams")
    .select("id, points")
    .eq("leader_id", user.id)
    .maybeSingle();

  let team = leaderMatch.data;
  if (!team) {
    const memberMatch = await admin
      .from("teams")
      .select("id, points")
      .contains("team_members_ids", [user.id])
      .maybeSingle();
    team = memberMatch.data;
  }

  if (!team) {
    return null;
  }

  const [{ data: questions, error: questionsError }, { data: submission }] =
    await Promise.all([
      admin
        .from("questions")
        .select(
          "id, order, question, options, image_urls, video_url, answer, points, hint_cost",
        )
        .eq("round_id", "4")
        .order("order", { ascending: true })
        .order("id", { ascending: false }),
      admin
        .from("submissions")
        .select("round4")
        .eq("team_id", team.id)
        .maybeSingle(),
    ]);

  if (questionsError) {
    return null;
  }

  const seen = new Map<number, any>();
  for (const q of questions ?? []) {
    if (!seen.has(q.order)) seen.set(q.order, q);
  }
  const uniqueQuestions = Array.from(seen.values())
    .sort((a, b) => a.order - b.order)
    .slice(0, 6);

  const r4 = submission?.round4 || {};
  const puzzles = uniqueQuestions.map((q: any) => {
    if (q.order >= 4) {
      return {
        order: q.order,
        question: q.question || "",
        video_url: q.video_url || "",
        options: q.options || [],
        points: q.points || 0,
        hint_cost: q.hint_cost || 15,
        type: "mcq",
      };
    }

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

  for (let i = 1; i <= 6; i++) {
    roundState[`q${i}_completed`] = r4[`q${i}_completed`] || false;
    roundState[`q${i}_hints_revealed`] =
      r4[`q${i}_hints_revealed`] || (i >= 4 ? false : []);
  }

  return {
    puzzles,
    roundState,
    teamPoints: team.points,
  };
}

export default async function Page() {
  const initialData = await getInitialState();
  return <ClientPage initialData={initialData} />;
}
