"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import SegmentedInput from "@/app/Components/Game/SegmentedInput";

interface Puzzle {
  order: number;
  image_urls: string[];
  answer_length: number;
  revealed_letters: { index: number; char: string }[];
}
interface RoundState {
  q1_completed: boolean;
  q2_completed: boolean;
  q3_completed: boolean;
  q1_hints_revealed: number[];
  q2_hints_revealed: number[];
  q3_hints_revealed: number[];
  is_completed: boolean;
  points_spent: number;
}

const MAX_HINTS_PER_QUESTION = 3;

export default function Round4Part1Client({ initialData }: { initialData?: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [puzzles, setPuzzles] = useState<Puzzle[]>(initialData?.puzzles ? initialData.puzzles.filter((p: any) => p.order <= 3) : []);
  const [roundState, setRoundState] = useState<RoundState | null>(initialData?.roundState || null);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [revealedIndices, setRevealedIndices] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<
    "correct" | "wrong" | "skipped" | null
  >(null);
  const [allDone, setAllDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);

  const allPartAImageUrls = useMemo(() => {
    const urls = puzzles
      .flatMap((p) => p.image_urls || [])
      .filter((url): url is string => Boolean(url));
    return Array.from(new Set(urls));
  }, [puzzles]);

  const applyPuzzleState = useCallback((puz: Puzzle, rs: RoundState) => {
    const hints: number[] =
      (rs[`q${puz.order}_hints_revealed` as keyof RoundState] as number[]) ||
      [];
    setRevealedIndices(hints);
    const ans = Array(puz.answer_length).fill(".");
    (puz.revealed_letters || []).forEach((l) => {
      if (hints.includes(l.index)) ans[l.index] = l.char;
    });
    setAnswer(ans.join(""));
    setTimeLeft(30); // reset timer
  }, []);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rounds/4/state");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load puzzle");
        return;
      }
      return data;
    } catch {
      setError("Network error. Please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const initializeState = useCallback((data: any) => {
    if (!data) return;
    const partAPuzzles = data.puzzles.filter((p: any) => p.order <= 3);
    setPuzzles(partAPuzzles);
    setRoundState(data.roundState);

    // Check if all Part A puzzles from DB are completed.
    const partADone =
      partAPuzzles.length > 0 &&
      partAPuzzles.every(
        (p: Puzzle) => !!data.roundState[`q${p.order}_completed`],
      );
    setAllDone(partADone);

    // Start at the first uncompleted puzzle
    const startIdx = partAPuzzles.findIndex(
      (p: Puzzle) => !data.roundState[`q${p.order}_completed` as keyof RoundState],
    );
    const idx = startIdx === -1 ? partAPuzzles.length - 1 : startIdx;
    setCurrentQIdx(idx);
    if (partAPuzzles[idx]) applyPuzzleState(partAPuzzles[idx], data.roundState);
  }, [applyPuzzleState]);

  useEffect(() => {
    if (initialData && initialData.puzzles) {
      setLoading(false);
      initializeState(initialData);
    } else {
      fetchState().then(initializeState);
    }
  }, [initialData, fetchState, initializeState]);

  // Eagerly warm image cache for all Part A clues to avoid delays between questions.
  useEffect(() => {
    if (allPartAImageUrls.length === 0) return;
    const warmers = allPartAImageUrls.map((url) => {
      const img = new window.Image();
      img.decoding = "async";
      img.src = url;
      return img;
    });
    return () => {
      warmers.forEach((img) => {
        img.src = "";
      });
    };
  }, [allPartAImageUrls]);

  // Timer logic
  useEffect(() => {
    if (allDone || loading || submitting) return;
    if (timeLeft <= 0) return;

    const currentPuzzle = puzzles[currentQIdx];
    if (!currentPuzzle) return;
    const isCompleted = !!roundState?.[`q${currentPuzzle.order}_completed` as keyof RoundState];
    if (isCompleted) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSkip();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentQIdx, allDone, loading, submitting, puzzles, roundState]);

  const handleSkip = async () => {
    const currentPuzzle = puzzles[currentQIdx];
    if (!currentPuzzle) return;
    setSubmitting(true);
    setSubmitFeedback(null);
    try {
      const res = await fetch("/api/rounds/4/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          answer: "", 
          questionOrder: currentPuzzle.order,
          skipped: true 
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitFeedback("skipped");
        const updatedRS = {
          ...roundState!,
          [`q${currentPuzzle.order}_completed`]: true,
          is_completed: data.allDone,
        } as RoundState;
        setRoundState(updatedRS);

        if (data.allDone) {
          setTimeout(() => setAllDone(true), 1200);
        } else {
          setTimeout(() => {
            const nextIdx = currentQIdx + 1;
            if (nextIdx < puzzles.length) {
              setCurrentQIdx(nextIdx);
              applyPuzzleState(puzzles[nextIdx], updatedRS);
              setSubmitFeedback(null);
            }
          }, 1400);
        }
      } else {
        setError(data.error || "Auto-skip failed");
      }
    } catch {
      setError("Auto-skip failed");
    } finally {
      setSubmitting(false);
    }
  };

  const currentPuzzle = puzzles[currentQIdx] ?? null;
  const currentQCompleted = currentPuzzle
    ? !!roundState?.[`q${currentPuzzle.order}_completed` as keyof RoundState]
    : false;
  const currentHints: number[] = currentPuzzle
    ? (roundState?.[
        `q${currentPuzzle.order}_hints_revealed` as keyof RoundState
      ] as number[]) || []
    : [];
  const maxHintsForCurrent = currentPuzzle
    ? Math.min(MAX_HINTS_PER_QUESTION, currentPuzzle.answer_length)
    : 0;
  const hintsUsed = Math.min(currentHints.length, maxHintsForCurrent);
  const availableHints = Math.max(0, maxHintsForCurrent - hintsUsed);
  const canSubmit =
    !answer.includes(".") &&
    answer.length > 0 &&
    !submitting &&
    !currentQCompleted;

  const handleSubmit = async () => {
    if (!canSubmit || !currentPuzzle) return;
    setSubmitting(true);
    setSubmitFeedback(null);
    try {
      const res = await fetch("/api/rounds/4/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, questionOrder: currentPuzzle.order }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitFeedback("correct");
        const updatedRS = {
          ...roundState!,
          [`q${currentPuzzle.order}_completed`]: true,
          is_completed: data.allDone,
        } as RoundState;
        setRoundState(updatedRS);
        if (data.allDone) {
          setTimeout(() => setAllDone(true), 1200);
        } else {
          // Advance to the next puzzle after a brief success pause
          setTimeout(() => {
            const nextIdx = currentQIdx + 1;
            if (nextIdx < puzzles.length) {
              setCurrentQIdx(nextIdx);
              applyPuzzleState(puzzles[nextIdx], updatedRS);
              setSubmitFeedback(null);
            }
          }, 1400);
        }
      } else {
        setSubmitFeedback("wrong");
        setTimeout(() => setSubmitFeedback(null), 3000);
      }
    } catch {
      setSubmitFeedback("wrong");
      setTimeout(() => setSubmitFeedback(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnswerChange = (newAnswer: string) => {
    setAnswer(newAnswer);
    if (submitFeedback === "wrong") setSubmitFeedback(null);
  };

  const handleHint = async () => {
    if (!currentPuzzle || currentQCompleted || availableHints === 0) return;
    try {
      const res = await fetch("/api/rounds/4/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentAnswer: answer,
          questionOrder: currentPuzzle.order,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const newRevealed = [...revealedIndices, data.revealedIndex];
        setRevealedIndices(newRevealed);
        const arr = answer.split("");
        while (arr.length < currentPuzzle.answer_length) arr.push(".");
        arr[data.revealedIndex] = data.revealedChar;
        setAnswer(arr.join(""));
        setRoundState((prev) =>
          prev
            ? {
                ...prev,
                [`q${currentPuzzle.order}_hints_revealed`]: newRevealed,
              }
            : prev,
        );
      } else {
        alert(data.error || "Failed to get hint");
      }
    } catch {
      alert("Network error");
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background Image */}
      <div className="fixed inset-0 z-0 bg-[#aed4f4]">
        <Image
          src="/Round4Page.jpg"
          alt="Background"
          fill
          className="object-cover"
          priority
          quality={100}
        />
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Hidden eager preload tags are SSR-rendered, so browser starts fetching all clues immediately. */}
        <div className="hidden" aria-hidden="true">
          {allPartAImageUrls.map((url, idx) => (
            <img
              key={`${url}-${idx}`}
              src={url}
              alt=""
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          ))}
        </div>

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 md:px-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="gap-2 text-white/90 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            <span className="font-bold uppercase tracking-wider">EXIT</span>
          </Button>

          <div className="flex items-center gap-2">
            <Image
              src="/gdg.svg"
              alt="Google Developer Groups"
              width={120}
              height={32}
              className="h-8 w-auto"
            />
          </div>

          {/* <Badge
            variant="outline"
            className="border-purple-400/50 bg-purple-600/30 text-purple-200 font-black uppercase tracking-widest backdrop-blur-sm"
          >
            ROUND 4
          </Badge> */}
        </header>

        {/* Main Content */}
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-5xl space-y-6">
            {/* Question Navigation */}
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-white drop-shadow-lg">
                  Q{currentPuzzle?.order || 1}/{Math.max(1, puzzles.length)}
                </span>
                <Badge className="bg-white/30 text-white border border-white/40 font-bold uppercase tracking-wider">
                  PHASE A - IMAGES
                </Badge>
              </div>

              {/* Timer replacing Tabs */}
              {!allDone && !currentQCompleted && (
                <div className="flex items-center gap-2 rounded-full border-2 border-white/40 bg-black/40 px-5 py-2 backdrop-blur-md shadow-lg">
                  <span className="text-sm font-bold uppercase tracking-widest text-zinc-300">Time</span>
                  <span className={`text-2xl font-black tabular-nums transition-colors ${timeLeft <= 10 ? "text-red-400 animate-pulse" : "text-white"}`}>
                    00:{timeLeft.toString().padStart(2, '0')}
                  </span>
                </div>
              )}
            </div>

            {/* All Done State */}
            <AnimatePresence>
              {allDone && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-6 rounded-2xl bg-white/20 border-2 border-white/40 p-12 backdrop-blur-md shadow-2xl"
                >
                  <div className="text-6xl">🎉</div>
                  <div className="flex items-center gap-2 text-2xl font-black uppercase tracking-wider text-emerald-300">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-300" />
                    All Puzzles Solved!
                  </div>
                  <Button
                    size="lg"
                    onClick={() => router.push("/dashboard/round/4/part2")}
                    className="bg-white/30 border-2 border-white/40 backdrop-blur-md px-10 py-6 text-lg font-black uppercase tracking-widest text-white hover:bg-white/40 shadow-lg"
                  >
                    Enter Round 4 Part B →
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Puzzle Content */}
            {!allDone && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQIdx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-8"
                >
                  {/* Image Clues */}
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    {/* Clue 1 */}
                    <Card className="relative aspect-video overflow-hidden border-4 border-white/40 bg-black/50 p-0 backdrop-blur-sm shadow-2xl rounded-2xl">
                      <Badge className="absolute left-4 top-4 z-10 bg-white/95 text-gray-800 font-bold uppercase tracking-wide shadow-lg">
                        CLUE 1
                      </Badge>
                      {loading ? (
                        <Skeleton className="h-full w-full" />
                      ) : currentPuzzle?.image_urls?.[0] ? (
                        <Image
                          src={currentPuzzle.image_urls[0]}
                          alt="Clue 1"
                          fill                          sizes="(max-width: 768px) 100vw, 50vw"
                          priority                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-white/50">
                          No image
                        </div>
                      )}
                    </Card>

                    {/* Plus Symbol */}
                    <div className="hidden text-center sm:block">
                      <span className="text-5xl font-black text-white/90 drop-shadow-lg">
                        +
                      </span>
                    </div>

                    {/* Clue 2 */}
                    <Card className="relative aspect-video overflow-hidden border-4 border-white/40 bg-black/50 p-0 backdrop-blur-sm shadow-2xl rounded-2xl">
                      <Badge className="absolute left-4 top-4 z-10 bg-white/95 text-gray-800 font-bold uppercase tracking-wide shadow-lg">
                        CLUE 2
                      </Badge>
                      {loading ? (
                        <Skeleton className="h-full w-full" />
                      ) : currentPuzzle?.image_urls?.[1] ? (
                        <Image
                          src={currentPuzzle.image_urls[1]}
                          alt="Clue 2"
                          fill                          sizes="(max-width: 768px) 100vw, 50vw"
                          priority                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-white/50">
                          No image
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* Question Text */}
                  <div className="text-center">
                    <h2 className="text-3xl font-black uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] sm:text-4xl md:text-5xl">
                      WHO KNOWS WHAT THIS IS?
                    </h2>
                  </div>

                  {/* Answer Input (Styled as dashes) */}
                  <div className="flex items-center justify-center gap-3 mt-4">
                    {loading ? (
                      <Skeleton className="h-14 w-64" />
                    ) : currentPuzzle ? (
                      <SegmentedInput
                        length={currentPuzzle.answer_length}
                        value={answer}
                        onChange={handleAnswerChange}
                        revealedIndices={revealedIndices}
                      />
                    ) : (
                      <div className="flex h-14 items-center justify-center text-white/50">
                        No puzzle loaded
                      </div>
                    )}
                  </div>

                  {/* Feedback Banners */}
                  <AnimatePresence>
                    {submitFeedback === "correct" && (
                      <motion.div
                        key="correct"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mx-auto flex w-full max-w-md items-center gap-3 rounded-xl border-2 border-emerald-400/50 bg-emerald-500/20 px-6 py-4 backdrop-blur-md shadow-lg"
                      >
                        <span className="text-2xl">✓</span>
                        <div>
                          <p className="font-bold text-emerald-300">Correct!</p>
                          <p className="text-sm text-emerald-200/80">
                            {currentQIdx + 1 < puzzles.length
                              ? "Moving to next puzzle..."
                              : "All puzzles solved!"}
                          </p>
                        </div>
                      </motion.div>
                    )}
                    {submitFeedback === "wrong" && (
                      <motion.div
                        key="wrong"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mx-auto flex w-full max-w-md items-center gap-3 rounded-xl border-2 border-red-400/50 bg-red-500/20 px-6 py-4 backdrop-blur-md shadow-lg"
                      >
                        <span className="text-2xl">✗</span>
                        <div>
                          <p className="font-bold text-red-300">Wrong answer</p>
                          <p className="text-sm text-red-200/80">
                            Look carefully at both images together.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Action Buttons Row */}
                  <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-6 px-4 mt-8">
                    {/* Hint Button */}
                    {!currentQCompleted && currentPuzzle ? (
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={handleHint}
                        disabled={submitting || loading || availableHints === 0}
                        className="h-12 shrink-0 border-2 border-white/40 bg-white/25 px-5 font-bold uppercase tracking-wider text-white backdrop-blur-md hover:bg-white/35 disabled:opacity-50 shadow-lg cursor-pointer"
                      >
                        <span>💡 HINT</span>
                        <Badge className="ml-2 bg-white/30 text-white border border-white/40">
                          {availableHints}
                        </Badge>
                      </Button>
                    ) : <div />}

                    {/* Submit Button */}
                    {!currentQCompleted && currentPuzzle ? (
                      <Button
                        size="lg"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="h-12 shrink-0 bg-white/30 backdrop-blur-md border-2 border-white/40 px-8 text-white font-black uppercase tracking-widest hover:bg-white/40 disabled:opacity-40 shadow-lg"
                      >
                        {submitting ? "..." : "SUBMIT"}
                      </Button>
                    ) : <div />}
                  </div>

                  {/* Error Display */}
                  {error && (
                    <div className="mx-auto w-full max-w-md rounded-xl border-2 border-red-400/50 bg-red-500/20 px-6 py-4 text-center backdrop-blur-md shadow-lg">
                      <p className="font-medium text-red-300">{error}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchState}
                        className="mt-2 text-xs text-white/90 hover:text-white hover:bg-white/10"
                      >
                        Try again
                      </Button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
