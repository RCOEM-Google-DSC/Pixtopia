"use client";

import React, { useEffect, useState, useRef } from "react";
import { useTeam } from "@/lib/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Question {
  id: string;
  question_order: number;
  question: string;
  image_urls: string[];
  hints: string[];
  points: number;
  hint_point: number;
}

const TOTAL_QUESTIONS = 10;
const PER_Q_SECONDS = 60;
const LS_KEY = "pixtopia_r3";

// ─── localStorage helpers ─────────────────────────────────────────────────────
interface R3State {
  currentQ: number;
  answers: Record<number, number>;       // questionOrder → selectedIndex
  startTimes: Record<number, number>;    // currentQ index → Date.now()
  hintsPerQuestion: Record<string, number>;
  completed: boolean;
}

function loadLS(): R3State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { currentQ: 0, answers: {}, startTimes: {}, hintsPerQuestion: {}, completed: false };
}

function saveLS(state: R3State) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════════

export default function Round3Page() {
  const { team, loading: teamLoading } = useTeam();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestingHint, setRequestingHint] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [roundScore, setRoundScore] = useState(0);
  const [hintsPerQuestion, setHintsPerQuestion] = useState<Record<string, number>>({});

  const selectedOptionRef = useRef<number | null>(null);
  const answerLockedRef = useRef(false);
  const currentQuestionIndexRef = useRef(0);
  const timerDoneRef = useRef(false);
  const requestingHintRef = useRef(false);
  const pausedAtRef = useRef<number | null>(null);
  const startTimestampRef = useRef<number | null>(null);
  const lsRef = useRef<R3State>(loadLS());

  // Keep refs in sync
  useEffect(() => { selectedOptionRef.current = selectedOption; }, [selectedOption]);
  useEffect(() => { answerLockedRef.current = answerLocked; }, [answerLocked]);
  useEffect(() => { currentQuestionIndexRef.current = currentQuestionIndex; }, [currentQuestionIndex]);

  // ── Fetch questions + restore from localStorage ──
  useEffect(() => {
    fetch("/api/rounds/3/state")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { console.error(data.error); return; }
        setQuestions(data.questions || []);
        setRoundScore(data.roundScore ?? 0);

        const ls = loadLS();
        lsRef.current = ls;

        if (ls.completed || data.teamProgress?.is_completed) {
          setCompleted(true);
          setRoundScore(data.roundScore ?? 0);

          // If server has is_correct data, we're good. If not, retry.
          const hasCorrectData = (data.questions || []).some((q: any) => q.is_correct !== undefined);
          if (!hasCorrectData) {
            // Server hasn't processed all answers yet — retry
            setTimeout(() => fetchFinalResults(), 1500);
          }
        } else {
          setCurrentQuestionIndex(ls.currentQ);
          setHintsPerQuestion(ls.hintsPerQuestion);

          // Restore locked answer
          const cqOrder = (data.questions || [])[ls.currentQ]?.question_order;
          if (cqOrder !== undefined && ls.answers[cqOrder] !== undefined) {
            setSelectedOption(ls.answers[cqOrder]);
            setAnswerLocked(true);
          }

          // Restore or set timer
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
  }, []);

  const currentQuestion = questions[currentQuestionIndex] ?? null;

  // Hints for current question
  const hintsUnlockedForCurrent = currentQuestion
    ? (hintsPerQuestion[String(currentQuestion.question_order)] ?? 0)
    : 0;
  const unlockedHints = currentQuestion?.hints.slice(0, hintsUnlockedForCurrent) ?? [];
  const nextHintCost = currentQuestion?.hint_point ?? 10;

  // ── Timer tick ──
  useEffect(() => {
    if (completed || !questions.length) return;

    const tick = () => {
      if (requestingHintRef.current) return; // freeze during hint fetch
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
  }, [currentQuestionIndex, completed, questions.length]);

  // ── Helper: fetch final results with retry ──
  const fetchFinalResults = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1000)); // wait 1s between retries
      try {
        const res = await fetch("/api/rounds/3/state");
        const data = await res.json();
        setRoundScore(data.roundScore ?? 0);
        setQuestions(data.questions || []);
        // Check if server has is_correct data
        const hasCorrectData = (data.questions || []).some((q: any) => q.is_correct !== undefined);
        if (hasCorrectData) return;
      } catch { /* retry */ }
    }
  };

  // ── Timer expired ──
  const handleTimerExpired = async () => {
    const alreadyLocked = answerLockedRef.current;
    const qIdx = currentQuestionIndexRef.current;
    const question = questions[qIdx];
    if (!question) return;
    const questionOrder = question.question_order;

    const ls = lsRef.current;

    // Last question? await the submit so server has all answers
    const isLastQ = questionOrder >= TOTAL_QUESTIONS;

    if (!alreadyLocked) {
      const currentSelection = selectedOptionRef.current;
      ls.answers[questionOrder] = currentSelection ?? -1;
      saveLS(ls);

      const submitPromise = fetch("/api/rounds/3/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionOrder, selectedIndex: currentSelection }),
      }).catch(() => {});

      // For last question, wait for submit to finish
      if (isLastQ) await submitPromise;
    }

    if (isLastQ) {
      ls.completed = true;
      saveLS(ls);
      setCompleted(true);
      // Fetch final results (with retry to ensure server has processed)
      await fetchFinalResults();
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
    setCurrentQuestionIndex(nextQ);
    setSelectedOption(null);
    setAnswerLocked(false);
  };

  // ── Manual submit ──
  const handleSubmit = () => {
    if (selectedOption === null || !currentQuestion || submitting || answerLocked) return;
    if (timeLeft !== null && timeLeft <= 0) return;

    const questionOrder = currentQuestion.question_order;
    setAnswerLocked(true);

    // Save to localStorage
    const ls = lsRef.current;
    ls.answers[questionOrder] = selectedOption;
    saveLS(ls);

    // Fire-and-forget server submit for leaderboard
    fetch("/api/rounds/3/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionOrder, selectedIndex: selectedOption }),
    }).catch(() => {});
  };

  // ── Get hint (still needs server since hints come from DB) ──
  const handleGetHint = async () => {
    if (!currentQuestion) return;
    setRequestingHint(true);
    requestingHintRef.current = true;
    pausedAtRef.current = Date.now();
    try {
      const res = await fetch("/api/rounds/3/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionOrder: currentQuestion.question_order }),
      });
      const data = await res.json();
      if (!res.ok) return;

      const key = String(currentQuestion.question_order);
      const newHints = { ...hintsPerQuestion, [key]: data.hintsUsedForQuestion };
      setHintsPerQuestion(newHints);

      // Save to localStorage
      const ls = lsRef.current;
      ls.hintsPerQuestion = newHints;
      saveLS(ls);
    } catch {
      // ignore
    } finally {
      // Give back pause time
      if (pausedAtRef.current && startTimestampRef.current) {
        const pausedMs = Date.now() - pausedAtRef.current;
        startTimestampRef.current = startTimestampRef.current + pausedMs;
        // Also update localStorage
        const ls = lsRef.current;
        ls.startTimes[currentQuestionIndex] = startTimestampRef.current;
        saveLS(ls);
      }
      pausedAtRef.current = null;
      requestingHintRef.current = false;
      setRequestingHint(false);
    }
  };

  // ── Loading ──
  if (loading || teamLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <div className="p-8 space-y-8 max-w-5xl mx-auto w-full" data-testid="loading-state">
          <Skeleton className="h-12 w-3/4 bg-zinc-900" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="aspect-video rounded-xl bg-zinc-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Completed ──
  if (completed) {
    const correctCount = questions.filter(q => (q as any).is_correct).length;
    const wrongCount = questions.length - correctCount;

    const hpq = hintsPerQuestion;
    const totalHintsUsed = Object.values(hpq).reduce((sum, count) => sum + count, 0);
    const totalHintCost = Object.entries(hpq).reduce((sum, [qOrder, count]) => {
      const question = questions.find(q => q.question_order === Number(qOrder));
      return sum + (question?.hint_point ?? 10) * count;
    }, 0);

    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div
          className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center"
          data-testid="completed-state"
        >
          <svg className="w-12 h-12 text-white mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">
            Round 3 Complete
          </h1>

          <div className="flex justify-center gap-8 mt-4">
            <div className="text-center">
              <p className="text-3xl font-black text-white">{correctCount}</p>
              <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Correct</p>
            </div>
            <div className="w-px bg-zinc-800" />
            <div className="text-center">
              <p className="text-3xl font-black text-white">{wrongCount}</p>
              <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Wrong</p>
            </div>
            <div className="w-px bg-zinc-800" />
            <div className="text-center">
              <p className="text-3xl font-black text-amber-400">+{roundScore}</p>
              <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Points</p>
            </div>
          </div>

          {totalHintsUsed > 0 && (
            <div className="flex justify-center gap-8 mt-2 pt-4 border-t border-zinc-800/50">
              <div className="text-center">
                <p className="text-2xl font-black text-white">{totalHintsUsed}</p>
                <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Hints Used</p>
              </div>
              <div className="w-px bg-zinc-800" />
              <div className="text-center">
                <p className="text-2xl font-black text-red-400">-{totalHintCost}</p>
                <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-1">Hint Cost</p>
              </div>
            </div>
          )}

          <button
            className="mt-8 border border-zinc-700 hover:border-zinc-500 text-white px-8 py-3 text-sm tracking-[0.2em] uppercase rounded-lg transition-all"
            onClick={() => (window.location.href = "/dashboard")}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Question view ──
  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      <main className="flex-1 flex flex-col justify-between px-4 py-3 max-w-5xl mx-auto w-full min-h-0">
        {currentQuestion && (
          <div key={currentQuestionIndex} className="flex-1 flex flex-col justify-between min-h-0 animate-[fadeIn_0.3s_ease-in]">
            <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
            {/* Header */}
            <div className="text-center space-y-2 shrink-0">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                Question {currentQuestionIndex + 1} of {TOTAL_QUESTIONS}
              </span>
              <h1 className="text-xl md:text-2xl font-bold text-white leading-tight">
                {currentQuestion.question}
              </h1>

              <div className="w-full max-w-md mx-auto space-y-1">
                {timeLeft !== null && (
                  <>
                    <div className="flex items-center justify-center gap-1.5 font-mono font-bold text-lg">
                      <Clock size={16} className={timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"} />
                      <span className={timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"}>
                        00:{timeLeft.toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div className="w-full h-[2px] bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          timeLeft <= 10 ? "bg-red-500" : timeLeft <= 30 ? "bg-amber-400" : "bg-white"
                        }`}
                        style={{ width: `${(timeLeft / 60) * 100}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Hints */}
            {unlockedHints.length > 0 && (
              <div className="mt-2 shrink-0">
                {unlockedHints.map((hint, i) => (
                  <div
                    key={i}
                    className="p-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs text-zinc-400 italic mb-1"
                  >
                    &ldquo;{hint}&rdquo;
                  </div>
                ))}
              </div>
            )}

            {/* Image grid */}
            <div className="grid grid-cols-2 gap-3 mt-3 flex-1 min-h-0 max-w-3xl mx-auto w-full max-h-[55vh]">
              {currentQuestion.image_urls.map((url, index) => (
                <Card
                  key={index}
                  className={`group overflow-hidden border-[3px] transition-all duration-300 ${
                    answerLocked
                      ? selectedOption === index
                        ? "border-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.3)] cursor-default"
                        : "border-zinc-800 opacity-40 cursor-default"
                      : selectedOption === index
                        ? "border-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.3)] cursor-pointer"
                        : "border-zinc-800 hover:border-zinc-600 cursor-pointer"
                  }`}
                  onClick={() => !answerLocked && setSelectedOption(index)}
                >
                  <CardContent className="p-0 relative h-full overflow-hidden bg-white">
                    <img
                      src={url}
                      alt={`Option ${index + 1}`}
                      className="w-full h-full object-contain"
                    />
                    <div
                      className={`absolute inset-0 transition-opacity duration-300 ${
                        selectedOption === index
                          ? "bg-sky-500/10 opacity-100"
                          : "bg-transparent opacity-0"
                      }`}
                    />
                    <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
                      <span className="text-[10px] font-bold text-zinc-300 uppercase">
                        Option {index + 1}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Bottom action bar */}
            <div className="shrink-0 py-3 flex items-center justify-center gap-4">
              {answerLocked ? (
                <div className="flex items-center gap-2 px-4 py-2 border border-zinc-700 rounded-lg">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-zinc-300 font-medium uppercase tracking-widest text-xs">Locked In</span>
                </div>
              ) : (
                <>
                  <Button
                    className="bg-white hover:bg-zinc-200 text-black px-8 py-5 text-sm tracking-widest font-bold uppercase rounded-lg transition-all disabled:opacity-50"
                    disabled={selectedOption === null || submitting || (timeLeft !== null && timeLeft <= 0)}
                    onClick={handleSubmit}
                  >
                    {submitting ? "Submitting..." : "Submit"}
                  </Button>
                  {hintsUnlockedForCurrent === 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 px-4 py-5 text-xs"
                          disabled={requestingHint}
                        >
                          {requestingHint ? "Unlocking..." : "Get Hint"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Purchase a Hint?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Unlocking a hint will cost{" "}
                            <span className="font-bold text-black">{nextHintCost} points</span>.
                            Your score will be updated immediately.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleGetHint}
                            className="bg-black hover:bg-zinc-800 text-white"
                          >
                            Purchase Hint
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
