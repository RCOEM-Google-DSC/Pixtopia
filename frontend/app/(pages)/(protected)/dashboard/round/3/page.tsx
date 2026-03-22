import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import Round3ClientPage from "./ClientPage";

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

  // Find team
  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("*")
    .or(`leader_id.eq.${user.id},team_members_ids.cs.{${user.id}}`)
    .single();

  if (teamError || !team) {
    return null;
  }

  // Fetch all Round 3 questions and submission in parallel
  const [{ data: questionsRaw, error: questionsError }, { data: submission }, { data: gs }] =
    await Promise.all([
      admin
        .from("round_3_questions")
        .select("id, question_order, question, image_urls, hints, points, hint_point, correct_index")
        .order("question_order", { ascending: true }),
      admin
        .from("submissions")
        .select("round3")
        .eq("team_id", team.id)
        .maybeSingle(),
      admin
        .from("game_state")
        .select("round_statuses")
        .limit(1)
        .single(),
    ]);

  if (questionsError) {
    return null;
  }

  const r3 = submission?.round3 || { answers: {}, hints_per_question: {}, score: 0 };
  const answers = r3.answers || {};
  const hintsPerQ = r3.hints_per_question || {};
  const questionsAnswered = Object.keys(answers).length;
  const isCompleted = questionsAnswered >= 10;

  let startTimes = r3.question_start_times || {};
  let needsUpsert = false;

  const currentQOrder = questionsAnswered + 1;
  if (currentQOrder <= 10 && !startTimes[currentQOrder]) {
    startTimes[currentQOrder] = new Date().toISOString();
    needsUpsert = true;
  }

  if (needsUpsert) {
    r3.question_start_times = startTimes;
    const payload = {
      team_id: team.id,
      ...(submission ?? {}),
      round3: r3,
    };
    await admin.from("submissions").upsert(payload, { onConflict: "team_id" });
  }

  const teamProgress = {
    hints_used: Object.values(hintsPerQ).reduce((a: any, b: any) => a + b, 0),
    hints_per_question: hintsPerQ,
    questions_answered: questionsAnswered,
    points_spent: 0,
    is_completed: isCompleted,
    question_start_times: startTimes,
  };

  // Prepare questions (hide correct_index if not completed)
  const questionsWithHintPoint = (questionsRaw ?? []).map((q: any) => {
    const qObj: any = {
      ...q,
      hint_point: q.hint_point ?? 10,
    };
    if (!isCompleted) {
      delete qObj.correct_index;
    } else {
      qObj.user_answer = answers[String(q.question_order)];
      qObj.is_correct = qObj.user_answer === qObj.correct_index;
    }
    return qObj;
  });

  const roundStartedAt = gs?.round_statuses?.["3"]?.startedAt || null;

  return {
    questions: questionsWithHintPoint,
    teamProgress,
    teamPoints: team.points,
    roundScore: r3.score || 0,
    roundStartedAt,
  };
}

export default async function Page() {
  const initialData = await getInitialState();
  return <Round3ClientPage initialData={initialData} />;
}
