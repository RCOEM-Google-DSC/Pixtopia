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

interface TeamProgress {
  hints_used: number;
  hints_per_question: Record<string, number>;
  questions_answered: number;
  points_spent: number;
  is_completed: boolean;
  question_start_times?: Record<string, string>;
}

const TOTAL_QUESTIONS = 10;

export default function Round3Page() {
  const { team, loading: teamLoading } = useTeam();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [progress, setProgress] = useState<TeamProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestingHint, setRequestingHint] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const selectedOptionRef = useRef<number | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);
  const answerLockedRef = useRef(false);
  const currentQuestionIndexRef = useRef(0);
  // currentQuestionIndex is derived from progress.questions_answered on load,
  // then advanced locally on correct answers without re-fetching.
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [startTimestamp, setStartTimestamp] = useState<number | null>(null);
  const timerDoneRef = useRef(false);
  const [roundScore, setRoundScore] = useState(0);
  const [teamPoints, setTeamPoints] = useState(0);

  const fetchState = async () => {
    try {
      const res = await fetch("/api/rounds/3/state");
      const data = await res.json();
      if (!res.ok) {
        console.error("API error:", data);
        throw new Error(data.error || "Failed to fetch state");
      }
      setQuestions(data.questions);
      setProgress(data.teamProgress);
      setRoundScore(data.roundScore ?? 0);
      setTeamPoints(data.teamPoints ?? 0);
      // Resume from where the team left off
      setCurrentQuestionIndex(data.teamProgress?.questions_answered ?? 0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentQuestion = questions[currentQuestionIndex] ?? null;

  // How many hints have been unlocked for the current question
  const hintsUnlockedForCurrent =
    progress && currentQuestion
      ? (progress.hints_per_question?.[String(currentQuestion.question_order)] ?? 0)
      : 0;

  const unlockedHints = currentQuestion?.hints.slice(0, hintsUnlockedForCurrent) ?? [];

  // Deduct based on current question's hint_point
  const nextHintCost = currentQuestion?.hint_point ?? 10;

  const allHintsExhausted =
    currentQuestion ? hintsUnlockedForCurrent >= currentQuestion.hints.length : true;

  // Keep refs in sync so the timer closure always reads the latest values
  useEffect(() => {
    selectedOptionRef.current = selectedOption;
  }, [selectedOption]);
  useEffect(() => {
    answerLockedRef.current = answerLocked;
  }, [answerLocked]);
  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  // Set startTimestamp when question changes and we have a start time from progress
  useEffect(() => {
    if (!currentQuestion || !progress?.question_start_times) return;
    const startTimeStr = progress.question_start_times[currentQuestion.question_order];
    if (!startTimeStr) return;
    const ts = new Date(startTimeStr).getTime();
    if (ts !== startTimestamp) {
      setStartTimestamp(ts);
      timerDoneRef.current = false;
    }
  }, [currentQuestionIndex, progress?.question_start_times]);

  // Timer effect — depends only on startTimestamp, NOT on progress
  useEffect(() => {
    if (startTimestamp === null) return;

    const tick = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTimestamp) / 1000);
      const remaining = Math.max(0, 60 - elapsed);
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

  // When timer expires: if answer not locked yet, auto-submit. Then advance or show summary.
  const handleTimerExpired = async () => {
    const alreadyLocked = answerLockedRef.current;
    const qIndex = currentQuestionIndexRef.current;
    const question = questions[qIndex];
    if (!question) return;
    const questionOrder = question.question_order;

    if (!alreadyLocked) {
      // Auto-submit whatever is selected (could be null)
      const currentSelection = selectedOptionRef.current;
      try {
        await fetch("/api/rounds/3/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionOrder,
            selectedIndex: currentSelection,
          }),
        });
      } catch {
        // ignore — still advance regardless
      }
    }

    // Check if this was the last question
    if (questionOrder >= TOTAL_QUESTIONS) {
      fetchState();
      setProgress((prev) =>
        prev ? { ...prev, is_completed: true } : null
      );
      return;
    }

    // Advance to next question — set start time to NOW so timer starts fresh at 60
    const freshStart = Date.now();
    setStartTimestamp(freshStart);
    timerDoneRef.current = false;
    setCurrentQuestionIndex((i) => i + 1);
    setSelectedOption(null);
    setAnswerLocked(false);
  };

  // Manual submit — locks in the answer but does NOT advance to next question
  const handleSubmit = async () => {
    if (selectedOption === null || !currentQuestion || submitting || answerLocked) return;
    if (timeLeft !== null && timeLeft <= 0) return; // Don't allow submit at 0 seconds
    const submitForIndex = currentQuestionIndex;
    setSubmitting(true);
    try {
      const res = await fetch("/api/rounds/3/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionOrder: currentQuestion.question_order,
          selectedIndex: selectedOption,
        }),
      });
      const data = await res.json();
      if (!res.ok) return;

      // Only apply lock if we're still on the same question (timer hasn't advanced us)
      if (currentQuestionIndexRef.current !== submitForIndex) return;

      setAnswerLocked(true);

      if (!data.isRoundComplete) {
        setProgress((prev) =>
          prev
            ? { ...prev, questions_answered: data.questionsAnswered }
            : null
        );
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleGetHint = async () => {
    if (!currentQuestion) return;
    setRequestingHint(true);
    try {
      const res = await fetch("/api/rounds/3/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionOrder: currentQuestion.question_order,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return;
      }

      // Optimistic update — no re-fetch needed
      setProgress((prev) => {
        if (!prev) return null;
        const key = String(currentQuestion.question_order);
        return {
          ...prev,
          hints_used: prev.hints_used + 1,
          points_spent: prev.points_spent + data.cost,
          hints_per_question: {
            ...prev.hints_per_question,
            [key]: data.hintsUsedForQuestion,
          },
        };
      });
    } catch {
      // ignore
    } finally {
      setRequestingHint(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
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

  // ── Completed ────────────────────────────────────────────────────────────────
  if (progress?.is_completed) {
    const correctCount = questions.filter(q => (q as any).is_correct).length;
    const wrongCount = questions.length - correctCount;
    // We expect teamPoints from state, we'll need to grab it from state logic
    // But since it wasn't saved in local scope variables earlier, I will use team.points from useTeam hook!
    // And actually, I should also extract the fetched round score from the API response to render.

    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <div
          className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center mt-12"
          data-testid="completed-state"
        >
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30 mb-2 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
            <svg
              className="w-10 h-10 text-emerald-500 animate-[bounce_2s_infinite]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter shadow-sm mb-2">
            Round 3 Complete!
          </h1>
          <p className="text-zinc-400 max-w-md pb-4">
            Excellent work! Here&apos;s your summary for this round:
          </p>

          <div className="flex justify-center gap-6 mt-2 mb-4 w-full max-w-lg">
            <div className="flex-1 bg-green-500/10 border border-green-500/20 px-6 py-4 rounded-xl flex flex-col items-center justify-center">
              <p className="text-green-500 font-black text-4xl mb-1">{correctCount}</p>
              <p className="text-zinc-400 text-[10px] uppercase font-bold tracking-widest">Correct</p>
            </div>
            <div className="flex-1 bg-red-500/10 border border-red-500/20 px-6 py-4 rounded-xl flex flex-col items-center justify-center">
              <p className="text-red-500 font-black text-4xl mb-1">{wrongCount}</p>
              <p className="text-zinc-400 text-[10px] uppercase font-bold tracking-widest">Wrong</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full max-w-lg mx-auto mt-2">
            <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl flex flex-col items-center relative overflow-hidden">
              <div className="absolute inset-0 bg-yellow-500/5" />
              <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1 relative z-10">Round Points</p>
              <p className="text-3xl font-black text-yellow-500 relative z-10">+{roundScore}</p>
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-xl flex flex-col items-center relative overflow-hidden">
              <div className="absolute inset-0 bg-indigo-500/5" />
              <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-1 relative z-10">Total Points</p>
              <p className="text-3xl font-black text-indigo-400 relative z-10">{teamPoints}</p>
            </div>
          </div>

          <Button
            className="mt-8 bg-zinc-800 hover:bg-zinc-700 text-white px-10 py-6 text-lg tracking-widest font-black uppercase rounded-xl transition-all hover:scale-105"
            onClick={() => (window.location.href = "/dashboard")}
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ── Question view ────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
      <main className="flex-1 flex flex-col justify-between px-4 py-3 max-w-5xl mx-auto w-full min-h-0">
        {currentQuestion && (
          <div key={currentQuestionIndex} className="flex-1 flex flex-col justify-between min-h-0 animate-[fadeIn_0.3s_ease-in]">
            <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
            {/* Header: badge + question + timer */}
            <div className="text-center space-y-2 shrink-0">
              <div className="inline-block px-3 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                  Question {currentQuestionIndex + 1} of {TOTAL_QUESTIONS}
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black text-white leading-tight tracking-tight">
                {currentQuestion.question}
              </h1>

              <div className="w-full max-w-md mx-auto space-y-1">
                {timeLeft !== null && (
                  <>
                    <div className="flex items-center justify-center gap-1.5 font-mono font-bold text-lg">
                      <Clock size={18} className={timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-indigo-400"} />
                      <span className={timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-yellow-400"}>
                        00:{timeLeft.toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          timeLeft <= 10 ? "bg-red-500" : timeLeft <= 30 ? "bg-amber-400" : "bg-indigo-400"
                        }`}
                        style={{ width: `${(timeLeft / 60) * 100}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Hints (compact) */}
            {unlockedHints.length > 0 && (
              <div className="mt-2 shrink-0">
                {unlockedHints.map((hint, i) => (
                  <div
                    key={i}
                    className="p-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs text-indigo-300 italic mb-1"
                  >
                    &ldquo;{hint}&rdquo;
                  </div>
                ))}
              </div>
            )}

            {/* Image grid — fills remaining space */}
            <div className="grid grid-cols-2 gap-3 mt-3 flex-1 min-h-0 max-w-3xl mx-auto w-full max-h-[55vh]">
              {currentQuestion.image_urls.map((url, index) => (
                <Card
                  key={index}
                  className={`group overflow-hidden border-3 transition-all duration-300 ${
                    answerLocked
                      ? selectedOption === index
                        ? "border-emerald-500 ring-2 ring-emerald-500/50 cursor-default"
                        : "border-zinc-800 opacity-50 cursor-default"
                      : selectedOption === index
                        ? "border-indigo-500 ring-2 ring-indigo-500/50 cursor-pointer"
                        : "border-zinc-800 hover:border-zinc-700 cursor-pointer"
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
                        answerLocked && selectedOption === index
                          ? "bg-emerald-600/20 opacity-100"
                          : selectedOption === index
                            ? "bg-indigo-600/20 opacity-100"
                            : "bg-indigo-600/20 opacity-0"
                      }`}
                    />
                    <div className="absolute bottom-2 right-2 bg-zinc-950/80 backdrop-blur-md px-2 py-0.5 rounded border border-white/10">
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
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-emerald-400 font-bold uppercase tracking-widest text-xs">Answer Locked In</span>
                </div>
              ) : (
                <>
                  <Button
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 text-sm tracking-widest font-black uppercase rounded-xl transition-all hover:scale-105 disabled:opacity-50"
                    disabled={selectedOption === null || submitting || (timeLeft !== null && timeLeft <= 0)}
                    onClick={handleSubmit}
                  >
                    {submitting ? "Submitting..." : "Submit Answer"}
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
                            <span className="font-bold text-indigo-400">{nextHintCost} points</span>.
                            Your score will be updated immediately. Are you sure?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleGetHint}
                            className="bg-indigo-600 hover:bg-indigo-700"
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

