import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/teams/[teamId]/score
 * Increments a team's points by the given amount.
 * Used by Round 1 per-question scoring and round submission scoring.
 *
 * Body: { points: number; questionId?: string }
 *
 * The questionId is accepted for bookkeeping but deduplication is handled
 * client-side via localStorage (same approach as the original Firebase implementation).
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
  const { points } = body;

  const { teamId } = await params;

  // Verify caller is authenticated (fast local JWT check)
  const { getSessionUser } = await import("@/lib/supabase/server");
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (typeof points !== "number" || points < 0) {
    return NextResponse.json({ error: "Invalid points value" }, { status: 400 });
  }

  // Use admin client to bypass RLS for the update
  const admin = await createAdminClient();

  // Fetch current points first, then increment
  const { data: team, error: fetchErr } = await admin
    .from("teams")
    .select("points")
    .eq("id", teamId)
    .single();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 404 });
  }

  const { error } = await admin
    .from("teams")
    .update({ points: team.points + points })
    .eq("id", teamId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, newPoints: team.points + points });
}
