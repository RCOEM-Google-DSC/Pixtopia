import { createClient as createSupabaseClient } from "./supabase/client";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

// ─── Singleton browser client ─────────────────────────────────────────────────
// One instance = one WebSocket connection shared across all subscribers.
// Never call createClient() inside subscribe functions — that creates a new
// connection per call and causes the "wss:// connection interrupted" error.
let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (!_client) _client = createSupabaseClient();
  return _client;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoundStatus = "locked" | "active" | "completed";

export interface RoundState {
  status: RoundStatus;
  startedAt: string | null; // ISO timestamp string (was Firestore Timestamp)
}

export interface GameState {
  id: string;
  round_statuses: Record<string, RoundState>;
  hackerrank_url: string;
}

export interface Question {
  id: string;
  round_id: string;
  order: number;
  question?: string;      // Round 1
  options?: string[];     // Round 1
  correct_index: number;  // All rounds
  image_urls?: string[];  // Rounds 3 & 4
  letters?: string[];     // Round 4
  answer?: string;        // Round 4
  points: number;
}

export interface TeamData {
  id: string;
  team_name: string;
  points: number;
  leader_id: string;
  team_members_ids: string[];
  password: string;
}

export interface SubmissionData {
  team_id: string;
  round1?: { answers: Record<string, number>; score: number; submitted_at: string };
  round3?: { answers: Record<string, number>; score: number; submitted_at: string };
  round4?: { answers: Record<string, string>; score: number; submitted_at: string };
}

// ─── Channel counter — ensures each subscription gets a unique channel name ───
// Supabase will reject a second .subscribe() on a channel with the same name
// while the first is still JOINING. Using a counter avoids that race in React
// Strict Mode (which mounts → unmounts → remounts every effect in dev).
let _channelSeq = 0;
function nextChannel(base: string): string {
  return `${base}_${++_channelSeq}`;
}

// ─── Game State ───────────────────────────────────────────────────────────────

/**
 * Fetches the current game state once.
 */
export async function getGameState(): Promise<GameState | null> {
  const res = await fetch("/api/game/state");
  if (!res.ok) return null;
  return res.json();
}

/**
 * Subscribes to real-time game state changes via Supabase Realtime.
 * Returns an unsubscribe function (mirrors Firestore onSnapshot API).
 */
export function subscribeToGameState(
  callback: (state: GameState | null) => void
): () => void {
  const supabase = getClient();

  // Fetch current state immediately
  getGameState().then(callback);

  const channel: RealtimeChannel = supabase
    .channel(nextChannel("game_state"))
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_state",
        filter: "id=eq.current",
      },
      (payload) => {
        callback(payload.new as GameState);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Admin: start a round.
 */
export async function startRound(roundId: string): Promise<void> {
  await fetch("/api/game/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", roundId }),
  });
}

/**
 * Admin: end a round.
 */
export async function endRound(roundId: string): Promise<void> {
  await fetch("/api/game/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "end", roundId }),
  });
}

/**
 * Admin: update the HackerRank contest URL.
 */
export async function updateHackerrankUrl(url: string): Promise<void> {
  await fetch("/api/game/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "updateUrl", url }),
  });
}

// ─── Questions ────────────────────────────────────────────────────────────────

/**
 * Fetches all questions for a round, ordered by `order` ascending.
 */
export async function getRoundQuestions(roundId: string): Promise<Question[]> {
  const res = await fetch(`/api/rounds/${roundId}/questions`);
  if (!res.ok) return [];
  return res.json();
}

// ─── Scoring & Submissions ────────────────────────────────────────────────────

/**
 * Score a single Round 1 question immediately — updates leaderboard live.
 * Uses localStorage per teamId to prevent double-counting on reload.
 */
export async function scoreQuestion(
  teamId: string,
  questionId: string,
  points: number
): Promise<void> {
  const key = `pixtopia_r1_scored_${teamId}`;
  let scored: string[] = [];
  try {
    scored = JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    /* ignore */
  }

  if (scored.includes(questionId)) return; // already scored — skip

  const res = await fetch(`/api/teams/${teamId}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points, questionId }),
  });

  if (res.ok) {
    try {
      localStorage.setItem(key, JSON.stringify([...scored, questionId]));
    } catch {
      /* ignore */
    }
  }
}

/**
 * Final Round 1 submit — saves answers + score metadata only.
 * Points are already incremented per-question via scoreQuestion.
 */
export async function submitRound1Final(
  teamId: string,
  answers: Record<string, number>,
  score: number
): Promise<void> {
  await fetch(`/api/submissions/${teamId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roundId: "1", answers, score }),
  });
  try {
    localStorage.removeItem(`pixtopia_r1_scored_${teamId}`);
  } catch {
    /* ignore */
  }
}

/**
 * Generic submit for rounds 3 & 4 (also increments team points server-side).
 */
export async function submitRound(
  teamId: string,
  roundId: string,
  answers: Record<string, number | string>,
  score: number
): Promise<void> {
  await fetch(`/api/submissions/${teamId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roundId, answers, score }),
  });
}

/**
 * Fetch a team's existing submission record.
 */
export async function getTeamSubmission(
  teamId: string
): Promise<SubmissionData | null> {
  const res = await fetch(`/api/submissions/${teamId}`);
  if (!res.ok) return null;
  return res.json();
}

// ─── Team ─────────────────────────────────────────────────────────────────────

/**
 * Returns the team where leader_id matches the given user ID.
 */
export async function getTeamByLeader(
  leaderId: string
): Promise<TeamData | null> {
  const res = await fetch(`/api/teams?leaderId=${leaderId}`);
  if (!res.ok) return null;
  const teams: TeamData[] = await res.json();
  return teams[0] ?? null;
}

// ─── Leaderboard (real-time) ──────────────────────────────────────────────────

/**
 * Subscribes to real-time leaderboard updates.
 * Initial data is fetched immediately; subsequent updates trigger a re-fetch
 * because Supabase Realtime UPDATE payloads only contain the changed row.
 * Returns an unsubscribe function.
 */
export function subscribeToLeaderboard(
  callback: (data: { name: string; points: number }[]) => void
): () => void {
  const supabase = getClient();

  const fetchAndEmit = async () => {
    const res = await fetch("/api/teams");
    if (!res.ok) return;
    const teams: TeamData[] = await res.json();
    callback(
      teams.map((t) => ({ name: t.team_name, points: t.points }))
    );
  };

  // Fetch initial data immediately
  fetchAndEmit();

  const channel: RealtimeChannel = supabase
    .channel(nextChannel("leaderboard"))
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "teams",
      },
      () => {
        // Re-fetch full sorted leaderboard on any team update
        fetchAndEmit();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
