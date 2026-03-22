import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/game/state
 * Returns the current game state (round statuses + hackerrank URL).
 * Accessible to all authenticated users.
 */
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("game_state")
    .select("*")
    .eq("id", "current")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=1, stale-while-revalidate=5",
    },
  });
}

/**
 * POST /api/game/state
 * Admin-only: start/end a round or update the HackerRank URL.
 *
 * Body (one of):
 *   { action: "start", roundId: string }
 *   { action: "end",   roundId: string }
 *   { action: "updateUrl", url: string }
 */
export async function POST(request: NextRequest) {
  // Read body immediately to prevent Turbopack 'Lock broken' error
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { action, roundId, url } = body;

  // Verify the caller is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only the admin email may mutate game state
  if (user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = await createAdminClient();

  // Fetch current state so we can merge into roundStatuses JSONB
  const { data: current, error: fetchErr } = await admin
    .from("game_state")
    .select("round_statuses")
    .eq("id", "current")
    .single();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (action === "start") {
    if (!roundId) {
      return NextResponse.json({ error: "roundId is required" }, { status: 400 });
    }
    const updated = {
      ...current.round_statuses,
      [roundId]: { status: "active", startedAt: new Date().toISOString() },
    };
    const { error } = await admin
      .from("game_state")
      .update({ round_statuses: updated })
      .eq("id", "current");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  } else if (action === "end") {
    if (!roundId) {
      return NextResponse.json({ error: "roundId is required" }, { status: 400 });
    }
    const updated = {
      ...current.round_statuses,
      [roundId]: {
        ...current.round_statuses[roundId],
        status: "completed",
      },
    };
    const { error } = await admin
      .from("game_state")
      .update({ round_statuses: updated })
      .eq("id", "current");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  } else if (action === "updateUrl") {
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    const { error } = await admin
      .from("game_state")
      .update({ hackerrank_url: url })
      .eq("id", "current");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
