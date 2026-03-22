"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { useTeam } from "@/lib/useTeam";
import {
  subscribeToGameState,
  Question, GameState,
} from "@/lib/database";
import { Clock, CheckCircle, AlertCircle, Lock } from "lucide-react";

const PER_Q_SECONDS = 80;

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

// ─── Types ────────────────────────────────────────────────────────────────────
interface TeamProgress {
  questions_answered: number;
  question_start_times: Record<string, string>;
  is_completed: boolean;
}

export default function Round1Page() {
  const { user } = useAuth();
  const { team, loading: teamLoading } = useTeam();
  const router = useRouter();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [progress, setProgress] = useState<TeamProgress | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [startTimestamp, setStartTimestamp] = useState<number | null>(null);
  const timerDoneRef = useRef(false);

  const [roundScore, setRoundScore] = useState(0);
  const [savedAnswers, setSavedAnswers] = useState<Record<string, number>>({});

  const selectedOptionRef = useRef<number | null>(null);
  const answerLockedRef = useRef(false);
  const currentQuestionIndexRef = useRef(0);

  const TOTAL_QUESTIONS = questions.length;

  // ── Fetch state from per-team API ──
  const fetchState = async () => {
    try {
      const res = await fetch("/api/rounds/1/state");
      const data = await res.json();
      if (!res.ok) {
        console.error("API error:", data);
        throw new Error(data.error || "Failed to fetch state");
      }
      const shuffled = user ? shuffleForUser(data.questions || [], user.id) : (data.questions || []);
      setQuestions(shuffled);
      setProgress(data.teamProgress);
      setRoundScore(data.roundScore ?? 0);
      setSavedAnswers(data.answers ?? {});
      setCurrentQuestionIndex(data.teamProgress?.questions_answered ?? 0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    fetchState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Subscribe to gameState (for locked/active/completed status) ──
  useEffect(() => {
    const unsub = subscribeToGameState(setGameState);
    return () => unsub();
  }, []);

  // ── Keep refs in sync ──
  useEffect(() => { selectedOptionRef.current = selectedOption; }, [selectedOption]);
  useEffect(() => { answerLockedRef.current = answerLocked; }, [answerLocked]);
  useEffect(() => { currentQuestionIndexRef.current = currentQuestionIndex; }, [currentQuestionIndex]);

  const currentQuestion = questions[currentQuestionIndex] ?? null;

  // ── Restore locked answer from localStorage on load/question change ──
  useEffect(() => {
    if (!currentQuestion) return;
    try {
      const stored = JSON.parse(localStorage.getItem("pixtopia_r1_locked") || "{}");
      if (stored[currentQuestion.id] !== undefined) {
        setSelectedOption(stored[currentQuestion.id]);
        setAnswerLocked(true);
      }
    } catch { /* ignore */ }
  }, [currentQuestion?.id]);

  // ── Set startTimestamp when question changes ──
  useEffect(() => {
    if (!currentQuestion || !progress?.question_start_times) return;
    // question_start_times uses 1-indexed order
    const startTimeStr = progress.question_start_times[currentQuestionIndex + 1];
    if (!startTimeStr) return;
    const ts = new Date(startTimeStr).getTime();
    if (ts !== startTimestamp) {
      setStartTimestamp(ts);
      timerDoneRef.current = false;
    }
  }, [currentQuestionIndex, progress?.question_start_times]);

  // ── Timer tick ──
  useEffect(() => {
    if (startTimestamp === null) return;

    const tick = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTimestamp) / 1000);
      const remaining = Math.max(0, PER_Q_SECONDS - elapsed);
      setTimeLeft(remaining);

      if (remaining === 0 && !timerDoneRef.current) {
        timerDoneRef.current = true;
        handleTimerExpired();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTimestamp]);

  // ── Timer expired: submit answer and advance ──
  const handleTimerExpired = async () => {
    const qIndex = currentQuestionIndexRef.current;
    const question = questions[qIndex];
    if (!question) return;

    // Get the locked-in answer from localStorage or current selection
    let selectedIdx = selectedOptionRef.current;
    if (selectedIdx === null) {
      try {
        const stored = JSON.parse(localStorage.getItem("pixtopia_r1_locked") || "{}");
        if (stored[question.id] !== undefined) {
          selectedIdx = stored[question.id];
        }
      } catch { /* ignore */ }
    }

    // Submit the answer to the server
    try {
      await fetch("/api/rounds/1/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          selectedIndex: selectedIdx,
          setNextStartTime: true,
        }),
      });
    } catch {
      // ignore
    }

    // Clear this question from localStorage
    try {
      const stored = JSON.parse(localStorage.getItem("pixtopia_r1_locked") || "{}");
      delete stored[question.id];
      localStorage.setItem("pixtopia_r1_locked", JSON.stringify(stored));
    } catch { /* ignore */ }

    // Check if this was the last question
    if (qIndex + 1 >= TOTAL_QUESTIONS) {
      fetchState();
      setProgress((prev) =>
        prev ? { ...prev, is_completed: true } : null
      );
      return;
    }

    // Advance to next question
    const freshStart = Date.now();
    setStartTimestamp(freshStart);
    timerDoneRef.current = false;
    setCurrentQuestionIndex((i) => i + 1);
    setSelectedOption(null);
    setAnswerLocked(false);
  };

  // ── Manual answer selection (local only — submitted when timer expires) ──
  const handleSelect = (optionIdx: number) => {
    if (selectedOption !== null || answerLocked) return;
    if (timeLeft !== null && timeLeft <= 0) return;
    const q = currentQuestion;
    if (!q) return;

    // Also check localStorage in case useEffect hasn't restored yet
    try {
      const stored = JSON.parse(localStorage.getItem("pixtopia_r1_locked") || "{}");
      if (stored[q.id] !== undefined) return; // already answered
    } catch { /* ignore */ }

    setSelectedOption(optionIdx);
    setAnswerLocked(true);

    // Save to localStorage so answer survives reload
    try {
      const stored = JSON.parse(localStorage.getItem("pixtopia_r1_locked") || "{}");
      stored[q.id] = optionIdx;
      localStorage.setItem("pixtopia_r1_locked", JSON.stringify(stored));
    } catch { /* ignore */ }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  // ─── Render states ──────────────────────────────────────────────────────────

  const roundStatus = gameState?.round_statuses?.["1"]?.status ?? "locked";

  if (loading || teamLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

  // ── Completed state ──
  if (progress?.is_completed) {
    const correct = questions.filter((q) => savedAnswers[q.id] === q.correct_index).length;
    const wrong = questions.length - correct;

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
                <p className="text-3xl font-black text-white">{wrong}</p>
                <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Wrong</p>
              </div>
              <div className="w-px bg-zinc-800" />
              <div className="text-center">
                <p className="text-3xl font-black text-amber-400">+{roundScore}</p>
                <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Points</p>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-6 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4">Summary</h2>
            {questions.map((q, i) => {
              const userChoice = savedAnswers[q.id];
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

  // ── Question view ──
  const q = currentQuestion;
  if (!q) return null;

  const timerPercent = timeLeft !== null ? (timeLeft / PER_Q_SECONDS) * 100 : 100;
  const timerColor = (timeLeft ?? PER_Q_SECONDS) <= 20 ? "bg-red-500" : (timeLeft ?? PER_Q_SECONDS) <= 40 ? "bg-amber-400" : "bg-white";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Sticky progress header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-sm border-b border-zinc-800/50 px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">
              Q <span className="text-white font-bold">{currentQuestionIndex + 1}</span> / {TOTAL_QUESTIONS}
            </span>
            <div className="hidden sm:flex gap-1">
              {questions.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    i < currentQuestionIndex ? "bg-zinc-500" :
                    i === currentQuestionIndex ? "bg-white scale-125" : "bg-zinc-800"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className={`flex items-center gap-1.5 font-mono font-bold text-lg ${(timeLeft ?? PER_Q_SECONDS) <= 20 ? "text-red-400 animate-pulse" : "text-white"}`}>
            <Clock size={16} />
            {formatTime(timeLeft ?? PER_Q_SECONDS)}
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
                {currentQuestionIndex + 1}
              </span>
              <p className="text-white text-[15px] leading-relaxed">{q.question}</p>
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(q.options ?? []).map((opt, idx) => {
              const isSelected = selectedOption === idx;

              let cls = "text-left px-5 py-4 rounded-lg text-sm border transition-all ";
              if (!answerLocked) {
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
                  disabled={answerLocked}
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

          {/* Locked in indicator */}
          {answerLocked && (
            <div className="flex items-center justify-center gap-2 px-4 py-2">
              <CheckCircle size={16} className="text-white" />
              <span className="text-zinc-300 font-medium uppercase tracking-widest text-xs">Locked In — waiting for timer</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
