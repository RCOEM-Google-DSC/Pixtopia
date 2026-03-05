import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/teams
 * Returns all teams (id, team_name, points) — used by the leaderboard.
 * Accessible to all authenticated users.
 *
 * Query params:
 *   ?leaderId=<uuid>  – filter to the single team whose leader_id matches
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const leaderId = searchParams.get("leaderId");

  let query = supabase.from("teams").select("id, team_name, points, leader_id, team_members_ids, password");

  if (leaderId) {
    query = query.eq("leader_id", leaderId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
