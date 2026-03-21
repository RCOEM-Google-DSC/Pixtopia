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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-500 text-sm tracking-wide">Submitting…</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    const correct = questions.filter((q) => answers[q.id] === q.correct_index).length;
    return (
      <div className="min-h-screen bg-black text-white flex flex-col py-12 px-4">
        <div className="max-w-3xl w-full mx-auto space-y-8">
          <div className="text-center space-y-3">
            <CheckCircle size={48} className="text-white mx-auto" />
            <h1 className="text-2xl font-bold tracking-wide">ROUND 1 COMPLETE</h1>
            
            <div className="flex justify-center gap-8 mt-6">
              <div className="text-center">
                <p className="text-3xl font-black text-white">{correct}</p>
                <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Correct</p>
              </div>
              <div className="w-px bg-zinc-800" />
              <div className="text-center">
                <p className="text-3xl font-black text-white">{questions.length - correct}</p>
                <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Wrong</p>
              </div>
              <div className="w-px bg-zinc-800" />
              <div className="text-center">
                <p className="text-3xl font-black text-amber-400">+{score}</p>
                <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Points</p>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-6 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4">Summary</h2>
            {questions.map((q, i) => {
              const userChoice = answers[q.id];
              const isCorrect = userChoice === q.correct_index;
              
              return (
                <div key={q.id} className={`p-4 rounded-lg border ${isCorrect ? 'border-zinc-800' : 'border-zinc-800 bg-zinc-950'}`}>
                  <p className="text-sm mb-2 leading-relaxed text-zinc-300">
                    <span className="text-zinc-500 mr-2">{i + 1}.</span>{q.question}
                  </p>
                  <div className="text-xs space-y-1">
                    <p>
                      <span className="text-zinc-600 mr-2">Your answer:</span>
                      <span className={isCorrect ? "text-green-400" : "text-red-400"}>
                        {userChoice !== undefined ? q.options?.[userChoice] : "No answer"}
                      </span>
                    </p>
                    {!isCorrect && (
                      <p>
                        <span className="text-zinc-600 mr-2">Correct:</span>
                        <span className="text-green-400">{q.options?.[q.correct_index]}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center pt-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-2 mb-8 border border-zinc-700 hover:border-zinc-500 text-white px-8 py-3 text-sm tracking-[0.2em] uppercase rounded-lg transition-all"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (roundStatus === "locked") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <Lock size={36} className="text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold tracking-wide">ROUND 1 LOCKED</h2>
          <p className="text-zinc-500 text-sm mt-2">Waiting for the admin to start this round.</p>
          <button onClick={() => router.push("/dashboard")} className="mt-6 px-5 py-2.5 border border-zinc-700 hover:border-zinc-500 rounded-lg text-sm tracking-wide transition-colors">← Back</button>
        </div>
      </div>
    );
  }

  if (roundStatus === "completed") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <AlertCircle size={36} className="text-zinc-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold tracking-wide">ROUND 1 ENDED</h2>
          <p className="text-zinc-500 text-sm mt-2">Submissions are closed.</p>
          <button onClick={() => router.push("/dashboard")} className="mt-6 px-5 py-2.5 border border-zinc-700 hover:border-zinc-500 rounded-lg text-sm tracking-wide transition-colors">← Back</button>
        </div>
      </div>
    );
  }

  const q = questions[currentQ];
  if (!q) return null;

  const timerPercent = (timeLeft / PER_Q_SECONDS) * 100;
  const timerColor = timeLeft <= 20 ? "bg-red-500" : timeLeft <= 40 ? "bg-amber-400" : "bg-white";
  const isLastQ = currentQ === questions.length - 1;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Sticky progress header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-sm border-b border-zinc-800/50 px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">
              Q <span className="text-white font-bold">{currentQ + 1}</span> / {questions.length}
            </span>
            <div className="hidden sm:flex gap-1">
              {questions.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    i < currentQ ? "bg-zinc-500" :
                    i === currentQ ? "bg-white scale-125" : "bg-zinc-800"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className={`flex items-center gap-1.5 font-mono font-bold text-lg ${timeLeft <= 20 ? "text-red-400 animate-pulse" : "text-white"}`}>
            <Clock size={16} />
            {formatTime(timeLeft)}
          </div>
        </div>
        {/* Timer bar */}
        <div className="max-w-2xl mx-auto mt-2 h-[2px] bg-zinc-900 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${timerColor}`}
            style={{ width: `${timerPercent}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-8">
          <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-white/10 text-white text-xs font-bold flex items-center justify-center">
                {currentQ + 1}
              </span>
              <p className="text-white text-[15px] leading-relaxed">{q.question}</p>
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(q.options ?? []).map((opt, idx) => {
              const savedAnswer = answers[q.id];
              const effectiveSelected = justSelected ?? (savedAnswer !== undefined ? savedAnswer : null);
              const showResult = effectiveSelected !== null;
              const isSelected = effectiveSelected === idx;

              let cls = "text-left px-5 py-4 rounded-lg text-sm border transition-all ";
              if (!showResult) {
                cls += "bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900 cursor-pointer";
              } else if (isSelected) {
                cls += "bg-white/5 border-white/40 text-white";
              } else {
                cls += "bg-zinc-950 border-zinc-900 text-zinc-600 opacity-40";
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  disabled={showResult}
                  className={cls}
                >
                  <span className="font-medium text-zinc-600 mr-2">
                    {["A", "B", "C", "D"][idx]}.
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>

          {/* Already answered indicator */}
          {answers[q.id] !== undefined && justSelected === null && (
            <p className="text-center text-xs text-zinc-500">
              ✓ Already answered — waiting for next question
            </p>
          )}

        </div>
      </div>
    </div>
  );
}

