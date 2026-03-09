"use client";

import React, { useEffect, useState } from "react";
import { useTeam } from "@/lib/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardNavbar from "@/app/Components/Navigation/DashboardNavbar";
import { toast } from "sonner";
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
}

interface TeamProgress {
  hints_used: number;
  hints_per_question: Record<string, number>;
  questions_answered: number;
  points_spent: number;
  is_completed: boolean;
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
      // Resume from where the team left off
      setCurrentQuestionIndex(data.teamProgress?.questions_answered ?? 0);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load round state");
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

  // Global cost: (total_hints_used + 1) * 10
  const nextHintCost = progress ? (progress.hints_used + 1) * 10 : 10;

  const allHintsExhausted =
    currentQuestion ? hintsUnlockedForCurrent >= currentQuestion.hints.length : true;

  const handleSubmit = async () => {
    if (selectedOption === null || !currentQuestion) return;
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
        toast.error(data.error || "Submission failed");
        return;
      }

      if (data.isCorrect) {
        toast.success(`Correct! +${data.awardedPoints} points.`);

        if (data.isRoundComplete) {
          // Mark round complete in local state — triggers completed screen
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
                }
              : null
          );
          setCurrentQuestionIndex((i) => i + 1);
          setSelectedOption(null);
        }
      } else {
        toast.error(data.message || "Incorrect answer. Try again!");
      }
    } catch {
      toast.error("Submission failed");
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
        toast.error(data.error || "Failed to unlock hint");
        return;
      }

      toast.success(`Hint unlocked! Cost: ${data.cost} points.`);

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
      toast.error("Hint request failed");
    } finally {
      setRequestingHint(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading || teamLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <DashboardNavbar />
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
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <DashboardNavbar />
        <div
          className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center"
          data-testid="completed-state"
        >
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30 mb-2">
            <svg
              className="w-10 h-10 text-emerald-500"
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
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter">
            Round 3 Completed!
          </h1>
          <p className="text-zinc-400 max-w-md">
            Excellent work! You&apos;ve identified all {TOTAL_QUESTIONS} characters. Please wait
            for the next round to be unlocked.
          </p>
          <Button
            className="mt-4 bg-zinc-800 hover:bg-zinc-700 text-white px-8"
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
      <DashboardNavbar />

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full space-y-10">
        {currentQuestion && (
          <>
            <div className="space-y-6 text-center">
              <div className="inline-block px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                  Question {currentQuestionIndex + 1} of {TOTAL_QUESTIONS}
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight tracking-tight">
                {currentQuestion.question}
              </h1>
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
              <div className="flex items-center gap-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 px-6"
                      disabled={requestingHint || allHintsExhausted}
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

                <Button
                  size="lg"
                  className={`px-12 py-6 text-xl font-black uppercase tracking-widest transition-all duration-300 ${
                    selectedOption !== null
                      ? "bg-indigo-600 hover:bg-indigo-500 hover:shadow-[0_0_30px_rgba(79,70,229,0.4)]"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                  disabled={selectedOption === null || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? "Processing..." : "Submit Answer"}
                </Button>
              </div>
              <p className="text-xs text-zinc-500 font-medium">
                Double check your selection before submitting
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
