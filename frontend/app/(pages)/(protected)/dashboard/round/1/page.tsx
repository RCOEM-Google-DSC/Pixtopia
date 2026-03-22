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
const LS_KEY = "pixtopia_r1";

// ─── Seeded deterministic shuffle ─────────────────────────────────────────────
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

// ─── localStorage helpers ─────────────────────────────────────────────────────
interface R1State {
  currentQ: number;
  answers: Record<string, number>;     // questionId → selected option index
  startTimes: Record<number, number>;  // questionIndex → Date.now() timestamp
  completed: boolean;
}

function loadLS(): R1State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { currentQ: 0, answers: {}, startTimes: {}, completed: false };
}

function saveLS(state: R1State) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function clearLS() {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════════

export default function Round1Page() {
  const { user } = useAuth();
  const { team, loading: teamLoading } = useTeam();
  const router = useRouter();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(PER_Q_SECONDS);
  const [completed, setCompleted] = useState(false);
  const [score, setScore] = useState(0);

  const timerDoneRef = useRef(false);
  const currentQRef = useRef(0);
  const selectedOptionRef = useRef<number | null>(null);
  const answerLockedRef = useRef(false);
  const startTimestampRef = useRef<number | null>(null);
  const lsRef = useRef<R1State>(loadLS());

  const TOTAL = questions.length;

  // Keep refs in sync
  useEffect(() => { currentQRef.current = currentQ; }, [currentQ]);
  useEffect(() => { selectedOptionRef.current = selectedOption; }, [selectedOption]);
  useEffect(() => { answerLockedRef.current = answerLocked; }, [answerLocked]);

  // ── Load questions ──
  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/rounds/1/state")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { console.error(data.error); return; }
        const shuffled = shuffleForUser(data.questions || [], user.id);
        setQuestions(shuffled);

        // Restore from localStorage
        const ls = loadLS();
        lsRef.current = ls;

        if (ls.completed) {
          setCompleted(true);
          // Calculate score from saved answers
          let s = 0;
          shuffled.forEach((q) => {
            if (ls.answers[q.id] === q.correct_index) s += q.points;
          });
          setScore(s);
        } else {
          setCurrentQ(ls.currentQ);
          // Restore locked answer for current question
          const cq = shuffled[ls.currentQ];
          if (cq && ls.answers[cq.id] !== undefined) {
            setSelectedOption(ls.answers[cq.id]);
            setAnswerLocked(true);
          }
          // Restore or set timer start
          if (ls.startTimes[ls.currentQ]) {
            startTimestampRef.current = ls.startTimes[ls.currentQ];
          } else {
            const now = Date.now();
            startTimestampRef.current = now;
            ls.startTimes[ls.currentQ] = now;
            saveLS(ls);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  // ── Subscribe to gameState ──
  useEffect(() => {
    const unsub = subscribeToGameState(setGameState);
    return () => unsub();
  }, []);

  // ── Timer tick ──
  useEffect(() => {
    if (completed || !questions.length) return;

    const tick = () => {
      const start = startTimestampRef.current;
      if (!start) return;
      const elapsed = Math.floor((Date.now() - start) / 1000);
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
  }, [currentQ, completed, questions.length]);

  // ── Timer expired ──
  const handleTimerExpired = () => {
    const qIdx = currentQRef.current;
    const question = questions[qIdx];
    if (!question) return;

    const ls = lsRef.current;

    // If not answered yet, record null answer
    if (ls.answers[question.id] === undefined) {
      ls.answers[question.id] = -1; // no answer
      // Fire-and-forget: submit null answer to server
      submitToServer(question.id, null, question);
    }

    // Check if last question
    if (qIdx + 1 >= TOTAL) {
      ls.completed = true;
      saveLS(ls);
      setCompleted(true);
      // Calculate score
      let s = 0;
      questions.forEach((q) => {
        if (ls.answers[q.id] === q.correct_index) s += q.points;
      });
      setScore(s);
      return;
    }

    // Advance to next question
    const nextQ = qIdx + 1;
    ls.currentQ = nextQ;
    const now = Date.now();
    ls.startTimes[nextQ] = now;
    saveLS(ls);
    lsRef.current = ls;

    startTimestampRef.current = now;
    timerDoneRef.current = false;
    setCurrentQ(nextQ);
    setSelectedOption(null);
    setAnswerLocked(false);
  };

  // ── Submit to server (fire-and-forget, just for leaderboard) ──
  const submitToServer = (questionId: string, optionIdx: number | null, q: Question) => {
    const selectedAnswer = optionIdx !== null ? q.options?.[optionIdx] ?? null : null;
    fetch("/api/rounds/1/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId,
        selectedIndex: optionIdx,
        selectedAnswer,
        setNextStartTime: true,
      }),
    }).catch(() => {});
  };

  // ── User selects an option ──
  const handleSelect = (optionIdx: number) => {
    if (selectedOption !== null || answerLocked) return;
    if (timeLeft <= 0) return;
    const q = questions[currentQ];
    if (!q) return;

    // Lock locally
    setSelectedOption(optionIdx);
    setAnswerLocked(true);

    // Save to localStorage
    const ls = lsRef.current;
    ls.answers[q.id] = optionIdx;
    saveLS(ls);

    // Fire-and-forget: update leaderboard points
    submitToServer(q.id, optionIdx, q);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

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

  // ── Completed ──
  if (completed) {
    const ls = lsRef.current;
    const correct = questions.filter((q) => ls.answers[q.id] === q.correct_index).length;
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
                <p className="text-3xl font-black text-amber-400">+{score}</p>
                <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Points</p>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-6 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4">Summary</h2>
            {questions.map((q, i) => {
              const userChoice = ls.answers[q.id];
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
                        {userChoice >= 0 ? q.options?.[userChoice] : "No answer"}
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
  const q = questions[currentQ];
  if (!q) return null;

  const timerPercent = (timeLeft / PER_Q_SECONDS) * 100;
  const timerColor = timeLeft <= 20 ? "bg-red-500" : timeLeft <= 40 ? "bg-amber-400" : "bg-white";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Sticky progress header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-sm border-b border-zinc-800/50 px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">
              Q <span className="text-white font-bold">{currentQ + 1}</span> / {TOTAL}
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
