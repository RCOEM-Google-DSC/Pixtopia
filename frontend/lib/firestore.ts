import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc,
  onSnapshot, query, orderBy, where, increment,
  serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoundStatus = "locked" | "active" | "completed";

export interface RoundState {
  status: RoundStatus;
  startedAt: Timestamp | null;
}

export interface GameState {
  roundStatuses: Record<string, RoundState>;
  hackerrankUrl: string;
}

export interface Question {
  id: string;
  order: number;
  question?: string;      // Round 1
  options?: string[];     // Round 1
  correctIndex: number;   // All rounds
  imageUrls?: string[];   // Round 3, 4
  letters?: string[];     // Round 4
  answer?: string;        // Round 4
  points: number;
}

export interface TeamData {
  teamId: string;
  teamName: string;
  points: number;
  leaderId: string;
  teamMembersId: string[];
  password: string;
}

export interface SubmissionData {
  round1?: { answers: Record<string, number>; score: number; submittedAt: Timestamp };
  round3?: { answers: Record<string, number>; score: number; submittedAt: Timestamp };
  round4?: { answers: Record<string, string>; score: number; submittedAt: Timestamp };
}

// ─── Game State ──────────────────────────────────────────────────────────────

export function subscribeToGameState(callback: (state: GameState | null) => void) {
  return onSnapshot(doc(db, "gameState", "current"), (snap) => {
    callback(snap.exists() ? (snap.data() as GameState) : null);
  });
}

export async function startRound(roundId: string) {
  await updateDoc(doc(db, "gameState", "current"), {
    [`roundStatuses.${roundId}.status`]: "active",
    [`roundStatuses.${roundId}.startedAt`]: serverTimestamp(),
  });
}

export async function endRound(roundId: string) {
  await updateDoc(doc(db, "gameState", "current"), {
    [`roundStatuses.${roundId}.status`]: "completed",
  });
}

export async function updateHackerrankUrl(url: string) {
  await updateDoc(doc(db, "gameState", "current"), { hackerrankUrl: url });
}

// ─── Questions ───────────────────────────────────────────────────────────────

export async function getRoundQuestions(roundId: string): Promise<Question[]> {
  const q = query(collection(db, `rounds/${roundId}/questions`), orderBy("order"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Question));
}

// ─── Submissions ─────────────────────────────────────────────────────────────

/**
 * Score a single Round 1 question immediately → updates leaderboard live.
 * Uses localStorage per teamId to prevent double-counting on reload.
 */
export async function scoreQuestion(
  teamId: string,
  questionId: string,
  points: number
): Promise<void> {
  const key = `pixtopia_r1_scored_${teamId}`;
  let scored: string[] = [];
  try { scored = JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { /* ignore */ }

  if (scored.includes(questionId)) return; // already scored — skip

  // Write to Firestore first, then mark in localStorage
  await updateDoc(doc(db, "teams", teamId), { points: increment(points) });
  try { localStorage.setItem(key, JSON.stringify([...scored, questionId])); } catch { /* ignore */ }
}

/**
 * Final Round 1 submit — saves answers + score metadata ONLY.
 * Points are already incremented per-question via scoreQuestion.
 */
export async function submitRound1Final(
  teamId: string,
  answers: Record<string, number>,
  score: number
) {
  await setDoc(
    doc(db, "submissions", teamId),
    { round1: { answers, score, submittedAt: serverTimestamp() } },
    { merge: true }
  );
  try { localStorage.removeItem(`pixtopia_r1_scored_${teamId}`); } catch { /* ignore */ }
}

/** Generic submit for other rounds (increments points in one go) */
export async function submitRound(
  teamId: string,
  roundId: string,
  answers: Record<string, number | string>,
  score: number
) {
  await setDoc(
    doc(db, "submissions", teamId),
    { [`round${roundId}`]: { answers, score, submittedAt: serverTimestamp() } },
    { merge: true }
  );
  await updateDoc(doc(db, "teams", teamId), { points: increment(score) });
}

export async function getTeamSubmission(teamId: string): Promise<SubmissionData | null> {
  const snap = await getDoc(doc(db, "submissions", teamId));
  return snap.exists() ? (snap.data() as SubmissionData) : null;
}

// ─── Team ────────────────────────────────────────────────────────────────────

export async function getTeamByLeader(leaderId: string): Promise<TeamData | null> {
  const q = query(collection(db, "teams"), where("leaderId", "==", leaderId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { teamId: d.id, ...d.data() } as TeamData;
}

// ─── Leaderboard (real-time) ─────────────────────────────────────────────────

export function subscribeToLeaderboard(
  callback: (data: { name: string; points: number }[]) => void
) {
  return onSnapshot(collection(db, "teams"), (snap) => {
    const data = snap.docs.map((d) => ({
      name: d.data().teamName as string,
      points: d.data().points as number,
    }));
    callback(data);
  });
}
