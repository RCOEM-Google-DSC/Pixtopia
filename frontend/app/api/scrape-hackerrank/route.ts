import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * Extracts the contest slug from a full HackerRank URL.
 * Handles multiple formats:
 *   "https://www.hackerrank.com/contests/pixar-test-contest"  → "pixar-test-contest"
 *   "https://www.hackerrank.com/pixar-test-contest"           → "pixar-test-contest"
 *   "pixar-test-contest"                                      → "pixar-test-contest"
 */
function extractContestSlug(url: string): string {
  url = url.trim().replace(/\/+$/, "");
  // Try /contests/{slug} first
  const contestsMatch = url.match(/contests\/([^/?#]+)/);
  if (contestsMatch) return contestsMatch[1];
  // Try hackerrank.com/{slug} (without /contests/)
  const directMatch = url.match(/hackerrank\.com\/([^/?#]+)/i);
  if (directMatch) return directMatch[1];
  // Assume it's already a slug
  return url;
}

/**
 * Extracts the HackerRank username from a profile URL.
 * e.g. "https://www.hackerrank.com/profile/gdg_warlocks" → "gdg_warlocks"
 * Also handles URLs like "https://www.hackerrank.com/gdg_warlocks"
 */
function extractHackerRankUsername(url: string): string {
  if (!url) return "";
  // Remove trailing slashes
  url = url.trim().replace(/\/+$/, "");
  // Match /profile/{username} or just /{username}
  const profileMatch = url.match(/hackerrank\.com\/profile\/([^/?#]+)/i);
  if (profileMatch) return profileMatch[1].toLowerCase();
  const directMatch = url.match(/hackerrank\.com\/([^/?#]+)/i);
  if (directMatch) return directMatch[1].toLowerCase();
  // If it's just a username (no URL), return as-is
  return url.toLowerCase();
}

/**
 * Fetches the full leaderboard from a HackerRank contest.
 * Uses the same API as the Scraper_Hackerrank tool.
 * Supports private contests via HACKERRANK_SESSION_COOKIE env var.
 */
async function fetchContestLeaderboard(
  contestSlug: string
): Promise<{ name: string; score: number }[]> {
  const data: { name: string; score: number }[] = [];
  let offset = 0;
  const limit = 100;

  const headers: Record<string, string> = {
    "User-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
  };

  // Add session cookie for private contests (same approach as Scraper_Hackerrank)
  const sessionCookie = process.env.HACKERRANK_SESSION_COOKIE;
  if (sessionCookie) {
    headers["Cookie"] = sessionCookie;
  }

  while (true) {
    const url = `https://www.hackerrank.com/rest/contests/${contestSlug}/leaderboard?offset=${offset}&limit=${limit}`;
    console.log(`[Scraper] Fetching: ${url}`);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(
        `[Scraper] HackerRank API error for ${contestSlug}: ${response.status} ${response.statusText} — ${errText}`
      );
      if (response.status === 403) {
        console.error(
          `[Scraper] Contest "${contestSlug}" returned 403 Forbidden. ` +
          `If the contest is private, set HACKERRANK_SESSION_COOKIE in your .env file.`
        );
      }
      break;
    }

    const json = await response.json();
    const models = json.models || [];

    if (models.length === 0) break;

    for (const item of models) {
      data.push({
        name: (item.hacker as string).toLowerCase(),
        score: Math.round(Number(item.score || 0)),
      });
    }

    const total = json.total || 0;
    console.log(`[Scraper] Fetched ${data.length}/${total} entries for ${contestSlug}`);
    if (offset + limit >= total) break;
    offset += limit;
  }

  return data;
}

/**
 * POST /api/scrape-hackerrank
 *
 * Admin-only endpoint: Scrapes HackerRank contest leaderboards, maps scores
 * to teams via leader's hacker_rank_url, and updates team points.
 *
 * Flow:
 * 1. Fetch leaderboard from NEXT_PUBLIC_HACKERRANK_CONTEST_URL_1 (1st year)
 * 2. Fetch leaderboard from NEXT_PUBLIC_HACKERRANK_CONTEST_URL_2 (other years)
 * 3. Combine into a single {username → score} map
 * 4. For each team: get leader_id → get user's hacker_rank_url → extract username → match score
 * 5. Add the matched score to the team's existing points
 */
export async function POST() {
  // ── Auth check (fast local JWT — no network call) ──────────────────────
  const { getSessionUser } = await import("@/lib/supabase/server");
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = await createAdminClient();

  // ── Fetch leaderboards from both contest URLs ───────────────────────────
  const contestUrl1 = process.env.NEXT_PUBLIC_HACKERRANK_CONTEST_URL_1 || "";
  const contestUrl2 = process.env.NEXT_PUBLIC_HACKERRANK_CONTEST_URL_2 || "";

  const slug1 = extractContestSlug(contestUrl1);
  const slug2 = extractContestSlug(contestUrl2);

  const [leaderboard1, leaderboard2] = await Promise.all([
    slug1 ? fetchContestLeaderboard(slug1) : Promise.resolve([]),
    slug2 ? fetchContestLeaderboard(slug2) : Promise.resolve([]),
  ]);

  // Build a combined username → score map (take the max score if a user
  // appears in both contests, which shouldn't normally happen)
  const scoreMap = new Map<string, number>();

  for (const entry of [...leaderboard1, ...leaderboard2]) {
    const existing = scoreMap.get(entry.name) || 0;
    scoreMap.set(entry.name, Math.max(existing, entry.score));
  }

  if (scoreMap.size === 0) {
    return NextResponse.json(
      {
        error: "No leaderboard data fetched. Contests may not have started or URLs are invalid.",
        details: { slug1, slug2, leaderboard1Count: 0, leaderboard2Count: 0 },
      },
      { status: 400 }
    );
  }

  // ── Get all teams ───────────────────────────────────────────────────────
  const { data: teams, error: teamsErr } = await admin
    .from("teams")
    .select("id, team_name, points, leader_id");

  if (teamsErr) {
    return NextResponse.json({ error: teamsErr.message }, { status: 500 });
  }

  if (!teams || teams.length === 0) {
    return NextResponse.json({ error: "No teams found" }, { status: 404 });
  }

  // ── Get all leader user records ─────────────────────────────────────────
  const leaderIds = teams.map((t) => t.leader_id).filter(Boolean);

  const { data: users, error: usersErr } = await admin
    .from("users")
    .select("id, hacker_rank_url, year")
    .in("id", leaderIds);

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  // Build leader_id → { username, year } map
  const leaderMap = new Map<
    string,
    { username: string; year: string }
  >();
  for (const u of users || []) {
    leaderMap.set(u.id, {
      username: extractHackerRankUsername(u.hacker_rank_url || ""),
      year: u.year || "",
    });
  }

  // ── Get existing round2 submissions for delta calculation ───────────────
  const teamIds = teams.map((t) => t.id);
  const { data: submissions } = await admin
    .from("submissions")
    .select("team_id, round2")
    .in("team_id", teamIds);

  // Build team_id → previous round2 score map
  const prevScoreMap = new Map<string, number>();
  for (const sub of submissions || []) {
    prevScoreMap.set(sub.team_id, sub.round2?.score ?? 0);
  }

  // ── Match scores and update teams (delta-based) ─────────────────────────
  const results: {
    teamName: string;
    username: string;
    newScore: number;
    prevScore: number;
    delta: number;
    matched: boolean;
  }[] = [];

  for (const team of teams) {
    const leader = leaderMap.get(team.leader_id);
    if (!leader || !leader.username) {
      results.push({
        teamName: team.team_name,
        username: "",
        newScore: 0,
        prevScore: 0,
        delta: 0,
        matched: false,
      });
      continue;
    }

    const newScore = scoreMap.get(leader.username) ?? 0;
    if (newScore === 0) {
      results.push({
        teamName: team.team_name,
        username: leader.username,
        newScore: 0,
        prevScore: prevScoreMap.get(team.id) ?? 0,
        delta: 0,
        matched: false,
      });
      continue;
    }

    const prevScore = prevScoreMap.get(team.id) ?? 0;
    const delta = newScore - prevScore;

    // Update team points only if there's a positive delta
    if (delta > 0) {
      const { error: updateErr } = await admin.rpc("increment_team_points", {
        team_id_input: team.id,
        points_delta: delta,
      });

      if (updateErr) {
        console.error(`Failed to update team ${team.team_name}:`, updateErr);
        results.push({
          teamName: team.team_name,
          username: leader.username,
          newScore,
          prevScore,
          delta: 0,
          matched: false,
        });
        continue;
      }
    }

    // Store/update round2 score in submissions (upsert)
    const round2Data = {
      score: newScore,
      username: leader.username,
      imported_at: new Date().toISOString(),
    };

    const { error: subErr } = await admin
      .from("submissions")
      .upsert(
        { team_id: team.id, round2: round2Data },
        { onConflict: "team_id" }
      );

    if (subErr) {
      console.error(`Failed to save submission for ${team.team_name}:`, subErr);
    }

    results.push({
      teamName: team.team_name,
      username: leader.username,
      newScore,
      prevScore,
      delta: Math.max(0, delta),
      matched: true,
    });
  }

  const matchedCount = results.filter((r) => r.matched).length;
  const totalDelta = results.reduce((acc, r) => acc + r.delta, 0);

  return NextResponse.json({
    success: true,
    summary: {
      totalTeams: teams.length,
      matchedTeams: matchedCount,
      unmatchedTeams: teams.length - matchedCount,
      totalPointsAdded: totalDelta,
      contestsScraped: [slug1, slug2].filter(Boolean),
      leaderboard1Entries: leaderboard1.length,
      leaderboard2Entries: leaderboard2.length,
    },
    details: results,
  });
}
