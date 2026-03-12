"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { useTeam } from "@/lib/useTeam";
import {
  getRoundQuestions, scoreQuestion, submitRound1Final, subscribeToGameState,
  Question, GameState,
} from "@/lib/database";
import { Clock, CheckCircle, AlertCircle, Lock } from "lucide-react";

const PER_Q_SECONDS = 80;
const STORAGE_KEY = "pixtopia_r1_answers";

// ─── Seeded deterministic shuffle (Fisher-Yates with LCG PRNG) ───────────────
function strToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  return Math.abs(hash);
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Shuffle questions and their options deterministically per user.
 * correctIndex is remapped so scoring still works after option shuffle.
 */
function shuffleForUser(questions: Question[], uid: string): Question[] {
  const qSeed = strToSeed(uid);
  const shuffledQs = seededShuffle(questions, qSeed);

  return shuffledQs.map((q) => {
    if (!q.options || q.options.length === 0) return q;
    const optSeed = strToSeed(uid + q.id);
    const originalCorrectAnswer = q.options[q.correct_index];
    const shuffledOptions = seededShuffle(q.options, optSeed);
    const newCorrectIndex = shuffledOptions.indexOf(originalCorrectAnswer);
    return { ...q, options: shuffledOptions, correct_index: newCorrectIndex };
  });
}

// ─── Server-time helpers ──────────────────────────────────────────────────────
function computeRoundState(
  startedAtMs: number,
  totalQuestions: number
): { currentQ: number; timeLeft: number; allDone: boolean } {
  const elapsed = (Date.now() - startedAtMs) / 1000;
  const totalSeconds = PER_Q_SECONDS * totalQuestions;

  if (elapsed >= totalSeconds) {
    return { currentQ: totalQuestions, timeLeft: 0, allDone: true };
  }

  const currentQ = Math.floor(elapsed / PER_Q_SECONDS);
  const timeLeft = Math.ceil(PER_Q_SECONDS - (elapsed % PER_Q_SECONDS));
  return { currentQ, timeLeft, allDone: false };
}

export default function Round1Page() {
  const { user } = useAuth();
  const { team, submission, refreshSubmission } = useTeam();
  const router = useRouter();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);

  // Derived from server time
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(PER_Q_SECONDS);

  // Answers — persisted in localStorage
  const [answers, setAnswers] = useState<Record<string, number>>({});

  // Which option user just picked (for brief visual feedback)
  const [justSelected, setJustSelected] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const submitCalledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load + shuffle questions (seed = user UID for unique consistent order) ──
  useEffect(() => {
    if (!user?.id) return;
    getRoundQuestions("1").then((qs) => {
      setQuestions(shuffleForUser(qs, user.id));
      setLoading(false);
    });
  }, [user?.id]);

  // ── Subscribe to gameState ──
  useEffect(() => {
    const unsub = subscribeToGameState(setGameState);
    return () => unsub();
  }, []);

  // ── Restore saved answers from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setAnswers(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  // ── Check if already submitted ──
  useEffect(() => {
    if (submission?.round1) {
      setSubmitted(true);
      setScore(submission.round1.score);
      submitCalledRef.current = true;
    }
  }, [submission]);

  // ── Server-time tick (runs every second, derives currentQ + timeLeft) ──
  const doSubmit = useCallback(async (finalAnswers: Record<string, number>) => {
    if (!team || submitCalledRef.current) return;
    submitCalledRef.current = true;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    // Calculate total score from all answers
    let calc = 0;
    questions.forEach((q) => {
      if (finalAnswers[q.id] === q.correct_index) calc += q.points;
    });

    // Save metadata only — points already incremented per-question via scoreQuestion
    await submitRound1Final(team.id, finalAnswers, calc);
    localStorage.removeItem(STORAGE_KEY);
    setScore(calc);
    setSubmitted(true);
    setSubmitting(false);
    await refreshSubmission();
  }, [team, questions, refreshSubmission]);

  useEffect(() => {
    if (submitted || submitting || !gameState || questions.length === 0) return;
    const startedAt = gameState.round_statuses?.["1"]?.startedAt;
    if (!startedAt) return;

    const startedAtMs = new Date(startedAt).getTime();

    const tick = () => {
      const state = computeRoundState(startedAtMs, questions.length);

      if (state.allDone) {
        clearInterval(timerRef.current!);
        // Auto-submit with whatever answers we have
        setAnswers((prev) => { doSubmit(prev); return prev; });
        return;
      }

      // If question changed, clear the "just selected" highlight
      setCurrentQ((prev) => {
        if (prev !== state.currentQ) setJustSelected(null);
        return state.currentQ;
      });
      setTimeLeft(state.timeLeft);
    };

    tick(); // immediate first tick
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState, questions.length, submitted, submitting, doSubmit]);

  // ── Handle option selection ──
  const handleSelect = (optionIdx: number) => {
    if (justSelected !== null) return;
    const q = questions[currentQ];
    if (!q) return;

    setJustSelected(optionIdx);
    const newAnswers = { ...answers, [q.id]: optionIdx };
    setAnswers(newAnswers);

    // Persist answer to localStorage immediately
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newAnswers)); } catch { /* ignore */ }

    // If correct — score immediately so leaderboard updates live
    if (optionIdx === q.correct_index && team?.id) {
      scoreQuestion(team.id, q.id, q.points).catch(() => {/* ignore */});
    }

    // If last question — auto-submit after brief feedback delay
    if (currentQ === questions.length - 1) {
      setTimeout(() => doSubmit(newAnswers), 600);
    }
  };



  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  // ─── Render states ──────────────────────────────────────────────────────────

  const roundStatus = gameState?.round_statuses?.["1"]?.status ?? "locked";

  if (loading || (!gameState && roundStatus !== "locked")) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-400">Submitting your answers…</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    const correct = questions.filter((q) => answers[q.id] === q.correct_index).length;
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col py-10 px-4">
        <div className="max-w-3xl w-full mx-auto space-y-8">
          <div className="text-center space-y-4">
            <CheckCircle size={64} className="text-green-400 mx-auto" />
            <h1 className="text-3xl font-bold">Round 1 Complete!</h1>
            
            <div className="flex justify-center gap-6 mt-2 mb-4 w-full max-w-lg mx-auto">
              <div className="flex-1 bg-green-500/10 border border-green-500/20 px-6 py-4 rounded-xl flex flex-col items-center justify-center">
                <p className="text-green-500 font-black text-4xl mb-1">{correct}</p>
                <p className="text-zinc-400 text-[10px] uppercase font-bold tracking-widest">Correct</p>
              </div>
              <div className="flex-1 bg-red-500/10 border border-red-500/20 px-6 py-4 rounded-xl flex flex-col items-center justify-center">
                <p className="text-red-500 font-black text-4xl mb-1">{questions.length - correct}</p>
                <p className="text-zinc-400 text-[10px] uppercase font-bold tracking-widest">Wrong</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full max-w-lg mx-auto mt-2">
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl flex flex-col items-center relative overflow-hidden">
                <div className="absolute inset-0 bg-yellow-500/5" />
                <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1 relative z-10">Round Points</p>
                <p className="text-3xl font-black text-yellow-500 relative z-10">+{score}</p>
              </div>
              <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl flex flex-col items-center relative overflow-hidden">
                <div className="absolute inset-0 bg-indigo-500/5" />
                <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1 relative z-10">Total Points</p>
                <p className="text-3xl font-black text-indigo-400 relative z-10">{team?.points !== undefined ? team.points : score}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800">
            <h2 className="text-xl font-bold border-b border-zinc-800 pb-4 mb-4">Summary</h2>
            <div className="space-y-4">
              {questions.map((q, i) => {
                const userChoice = answers[q.id];
                const isCorrect = userChoice === q.correct_index;
                
                return (
                  <div key={q.id} className={`p-4 rounded-xl border ${isCorrect ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <p className="text-sm font-semibold mb-3 leading-relaxed text-zinc-200">
                      {i + 1}. {q.question}
                    </p>
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-zinc-500 mr-2">Your Answer:</span>
                        <span className={isCorrect ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                          {userChoice !== undefined ? q.options?.[userChoice] : "No answer"}
                        </span>
                      </p>
                      {!isCorrect && (
                        <p>
                          <span className="text-zinc-500 mr-2">Correct Answer:</span>
                          <span className="text-green-400 font-medium">
                            {q.options?.[q.correct_index]}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-center pt-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 mb-8 bg-zinc-800 hover:bg-zinc-700 text-white px-10 py-6 text-lg tracking-widest font-black uppercase rounded-xl transition-all hover:scale-105 inline-flex items-center gap-2"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (roundStatus === "locked") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="text-center">
          <Lock size={48} className="text-zinc-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold">Round 1 is Locked</h2>
          <p className="text-zinc-400 mt-2">Wait for the admin to start this round.</p>
          <button onClick={() => router.push("/dashboard")} className="mt-6 px-5 py-2.5 bg-zinc-800 rounded-xl text-sm">← Back</button>
        </div>
      </div>
    );
  }

  if (roundStatus === "completed") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold">Round 1 has ended</h2>
          <p className="text-zinc-400 mt-2">Submissions are now closed.</p>
          <button onClick={() => router.push("/dashboard")} className="mt-6 px-5 py-2.5 bg-zinc-800 rounded-xl text-sm">← Back</button>
        </div>
      </div>
    );
  }

  const q = questions[currentQ];
  if (!q) return null;

  const timerPercent = (timeLeft / PER_Q_SECONDS) * 100;
  const timerColor = timeLeft <= 20 ? "bg-red-500" : timeLeft <= 60 ? "bg-amber-400" : "bg-indigo-400";
  const isLastQ = currentQ === questions.length - 1;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Sticky header with server-derived progress */}
      <div className="sticky top-16 z-40 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">
              Q <span className="text-white font-bold">{currentQ + 1}</span> / {questions.length}
            </span>
            {/* Progress dots */}
            <div className="hidden sm:flex gap-1">
              {questions.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i < currentQ ? "bg-indigo-400" :
                    i === currentQ ? "bg-white scale-125" : "bg-zinc-700"
                  }`}
                />
              ))}
            </div>
          </div>
          {/* Timer — synced to server startedAt */}
          <div className={`flex items-center gap-1.5 font-mono font-bold text-lg ${timeLeft <= 20 ? "text-red-400 animate-pulse" : "text-indigo-300"}`}>
            <Clock size={18} />
            {formatTime(timeLeft)}
          </div>
        </div>
        {/* Timer bar */}
        <div className="max-w-2xl mx-auto mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${timerColor}`}
            style={{ width: `${timerPercent}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-8">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 text-sm font-bold flex items-center justify-center">
                {currentQ + 1}
              </span>
              <p className="text-white text-base leading-relaxed">{q.question}</p>
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(q.options ?? []).map((opt, idx) => {
              // savedAnswer = previously answered (restored from localStorage)
              const savedAnswer = answers[q.id];
              const effectiveSelected = justSelected ?? (savedAnswer !== undefined ? savedAnswer : null);
              const showResult = effectiveSelected !== null;
              const isSelected = effectiveSelected === idx;
              const isCorrect = idx === q.correct_index;

              let cls = "text-left px-5 py-4 rounded-xl text-sm border transition-all ";
              if (!showResult) {
                cls += "bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-indigo-500 hover:bg-indigo-500/5 cursor-pointer";
              } else if (isSelected) {
                cls += "bg-indigo-500/20 border-indigo-500 text-indigo-300";
              } else {
                cls += "bg-zinc-900 border-zinc-800 text-zinc-500 opacity-50";
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  disabled={showResult}  // locked if answered (either just now OR previously)
                  className={cls}
                >
                  <span className="font-semibold text-zinc-500 mr-2">
                    {["A", "B", "C", "D"][idx]}.
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>

          {/* Already answered indicator (restored from localStorage) */}
          {answers[q.id] !== undefined && justSelected === null && (
            <p className="text-center text-xs text-indigo-400">
              ✓ Already answered — waiting for next question
            </p>
          )}


        </div>
      </div>
    </div>
  );
}
