import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest) {
  const supabase = await createClient();

  // Verify session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use admin client for all DB reads/writes (bypasses RLS, avoids reserved keyword issues)
  const admin = await createAdminClient();

  // Get team for this user (leader or member)
  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("*")
    .or(`leader_id.eq.${user.id},team_members_ids.cs.{${user.id}}`)
    .single();

  if (teamError || !team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // Fetch all Round 3 questions — omit correct_index so it's never sent to the client
  const { data: questionsRaw, error: questionsError } = await admin
    .from("round_3_questions")
    .select("id, question_order, question, image_urls, hints, points")
    .order("question_order", { ascending: true });

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  // Fetch or create team progress for Round 3
  let { data: teamProgress, error: progressError } = await admin
    .from("team_round_progress")
    .select("*")
    .eq("team_id", team.id)
    .eq("round_id", "3")
    .single();

  if (progressError && progressError.code === 'PGRST116') {
    // Progress doesn't exist yet, create it
    const { data: newProgress, error: createError } = await admin
      .from("team_round_progress")
      .insert({
        team_id: team.id,
        round_id: "3",
        hints_used: 0,
        points_spent: 0,
        start_time: new Date().toISOString(),
        is_completed: false
      })
      .select()
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }
    teamProgress = newProgress;
  } else if (progressError) {
    return NextResponse.json({ error: progressError.message }, { status: 500 });
  }

  return NextResponse.json({
    questions: questionsRaw ?? [],
    teamProgress,
    teamPoints: team.points
  });
}
