import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/teams
 *
 * Public (no leaderId): Returns all teams with only public fields
 *   (id, team_name, points) — used by the leaderboard. No auth required.
 *   Uses admin client to bypass RLS.
 *
 * Private (?leaderId=<uuid>): Returns full team data for the matching team.
 *   Requires authentication.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const leaderId = searchParams.get("leaderId");

  // If leaderId is provided, require authentication and return full data
  if (leaderId) {
    const { getSessionUser, createAdminClient } = await import("@/lib/supabase/server");
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use admin client to bypass RLS for faster query; also check team_members_ids
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("teams")
      .select("id, team_name, points, leader_id, team_members_ids, password")
      .or(`leader_id.eq.${leaderId},team_members_ids.cs.{${leaderId}}`);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? [], {
      headers: {
        "Cache-Control": "private, no-cache",
      },
    });
  }

  // Public: use admin client to bypass RLS, return only safe fields
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id, team_name, points");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? [], {
    headers: {
      // Allow CDN / edge to cache for 2s, serve stale for up to 10s while revalidating
      "Cache-Control": "public, s-maxage=2, stale-while-revalidate=10",
    },
  });
}

