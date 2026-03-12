import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/submissions/[teamId]
 * Returns the submission record for a team (if any).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}

/**
 * POST /api/submissions/[teamId]
 * Upserts a round submission for a team.
 * Also increments team points for rounds 3 & 4 (round 1 uses /score).
 *
 * Body: { roundId: string; answers: Record<string, number | string>; score: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { roundId, answers, score } = body;

  const { teamId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!roundId || answers === undefined || typeof score !== "number") {
    return NextResponse.json({ error: "roundId, answers, and score are required" }, { status: 400 });
  }

  const admin = await createAdminClient();

  // Upsert the submission row, merging the new round data
  const { data: existing } = await admin
    .from("submissions")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();

  const submissionPayload = {
    team_id: teamId,
    ...(existing ?? {}),
    [`round${roundId}`]: {
      answers,
      score,
      submitted_at: new Date().toISOString(),
    },
  };

  const { error: upsertErr } = await admin
    .from("submissions")
    .upsert(submissionPayload, { onConflict: "team_id" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // For rounds 3 & 4, increment team points (round 1 handles its own scoring via /score)
  if (roundId !== "1" && score > 0) {
    const { data: team, error: fetchErr } = await admin
      .from("teams")
      .select("points")
      .eq("id", teamId)
      .single();

    if (!fetchErr && team) {
      await admin
        .from("teams")
        .update({ points: team.points + score })
        .eq("id", teamId);
    }
  }

  return NextResponse.json({ success: true });
}
