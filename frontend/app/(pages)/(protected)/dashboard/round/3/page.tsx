"use client";

import React, { useEffect, useState } from "react";
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

const TOTAL_QUESTIONS = 5;

export default function Round3Page() {
  const { team, loading: teamLoading } = useTeam();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [progress, setProgress] = useState<TeamProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestingHint, setRequestingHint] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  // currentQuestionIndex is derived from progress.questions_answered on load,
  // then advanced locally on correct answers without re-fetching.
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
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

  useEffect(() => {
    if (!currentQuestion || !progress?.question_start_times) return;
    const startTimeStr = progress.question_start_times[currentQuestion.question_order];
    if (!startTimeStr) return;
    
    const startTime = new Date(startTimeStr).getTime();
    
    const tick = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      const remaining = Math.max(0, 60 - elapsed);
      setTimeLeft(remaining);
      
      if (remaining === 0 && !submitting) {
         handleSubmit(true);
      }
    };
    
    tick(); // immediate first tick to prevent UI flash
    const interval = setInterval(tick, 1000);
    
    return () => clearInterval(interval);
  }, [currentQuestion, progress, submitting]);

  const handleSubmit = async (isAuto = false) => {
    if (!isAuto && selectedOption === null) return;
    if (!currentQuestion) return;
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
      if (!res.ok) {
        return;
      }

      if (data.isRoundComplete) {
        // We will just re-fetch state to get the final score, correct answers correctly matched up from backend!
        fetchState();
        setProgress((prev) =>
          prev ? { ...prev, questions_answered: data.questionsAnswered, is_completed: true } : null
        );
      } else {
        // Advance to next question optimistically
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                questions_answered: data.questionsAnswered,
                question_start_times: {
                  ...prev.question_start_times,
                  [currentQuestion.question_order + 1]: data.nextStartTime,
                }
              }
            : null
        );
        setCurrentQuestionIndex((i) => i + 1);
        setSelectedOption(null);
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
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="flex-1 p-8 max-w-5xl mx-auto w-full space-y-10">
        {currentQuestion && (
          <>
            <div className="space-y-6 text-center">
              <div className="inline-block px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                  Question {currentQuestionIndex + 1} of {TOTAL_QUESTIONS}
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight tracking-tight mt-6">
                {currentQuestion.question}
              </h1>
              
              <div className="w-full max-w-2xl mx-auto mt-6 space-y-2 h-[40px]">
                {timeLeft !== null && (
                  <>
                    <div className="flex items-center justify-center gap-2 font-mono font-bold text-2xl">
                      <Clock size={24} className={timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-indigo-400"} />
                      <span className={timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-yellow-400"}>
                        00:{timeLeft.toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-2">
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

            {unlockedHints.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                  Unlocked Hints
                </p>
                <div className="grid gap-3">
                  {unlockedHints.map((hint, i) => (
                    <div
                      key={i}
                      className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm text-indigo-300 italic"
                    >
                      &ldquo;{hint}&rdquo;
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {currentQuestion.image_urls.map((url, index) => (
                <Card
                  key={index}
                  className={`group cursor-pointer overflow-hidden border-4 transition-all duration-300 ring-offset-4 ring-offset-zinc-950 ${
                    selectedOption === index
                      ? "border-indigo-500 ring-4 ring-indigo-500/50 scale-[1.02]"
                      : "border-zinc-800 hover:border-zinc-700 hover:scale-[1.01]"
                  }`}
                  onClick={() => setSelectedOption(index)}
                >
                  <CardContent className="p-0 relative aspect-video overflow-hidden">
                    <img
                      src={url}
                      alt={`Option ${index + 1}`}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div
                      className={`absolute inset-0 bg-indigo-600/20 transition-opacity duration-300 ${
                        selectedOption === index ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <div className="absolute bottom-4 right-4 bg-zinc-950/80 backdrop-blur-md px-3 py-1 rounded-md border border-white/10">
                      <span className="text-xs font-bold text-zinc-300 uppercase">
                        Option {index + 1}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex flex-col items-center gap-6 pt-6">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 px-6"
                    disabled={requestingHint || allHintsExhausted}
                  >
                    {requestingHint ? "Unlocking..." : hintsUnlockedForCurrent === 0 ? "Get Hint" : "Get 2nd Hint"}
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
            </div>
          </>
        )}
      </main>
    </div>
  );
}
