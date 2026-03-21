"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import VideoPlayer from "@/app/Components/Game/VideoPlayer";
import MCQGrid from "@/app/Components/Game/MCQGrid";

interface Question {
  order: number;
  question: string;
  video_url: string;
  options: string[];
  type: string;
  points: number;
  hint_cost: number;
}

interface RoundState {
  [key: string]: any;
  is_completed: boolean;
  points_spent: number;
}

export default function Round4Part2Client({ initialData }: { initialData?: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>(initialData?.puzzles?.filter((p: any) => p.order >= 4) || []);
  const [roundState, setRoundState] = useState<RoundState | null>(initialData?.roundState || null);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<"correct" | "wrong" | "skipped" | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rounds/4/state");
      const data = await res.json();
      if (!res.ok) { 
        setError(data.error || "Failed to load state"); 
        return null; 
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
    const partB = data.puzzles.filter((q: Question) => q.order >= 4);
    setQuestions(partB);
    setRoundState(data.roundState);
    
    const partBCompleted = partB.length > 0 && partB.every((q: Question) => data.roundState[`q${q.order}_completed`]);
    if (partBCompleted && data.roundState.is_completed) {
      setAllDone(true);
    }

    const startIdx = partB.findIndex(
      (q: Question) => !data.roundState[`q${q.order}_completed`]
    );
    const idx = startIdx === -1 ? partB.length - 1 : startIdx;
    setCurrentQIdx(idx);
    
    setHintText(null);
    setSelectedIndex(undefined);
    setTimeLeft(30); // reset timer
  }, []);

  useEffect(() => {
    if (initialData && initialData.puzzles) {
      setLoading(false);
      initializeState(initialData);
    } else {
      fetchState().then(initializeState);
    }
  }, [initialData, fetchState, initializeState]);

  // Preload video links conceptually
  const allVideoUrls = useMemo(() => {
    return questions.map(q => q.video_url).filter(Boolean);
  }, [questions]);

  const currentQuestion = questions[currentQIdx] ?? null;
  const currentQCompleted = currentQuestion
    ? !!(roundState?.[`q${currentQuestion.order}_completed` as keyof RoundState])
    : false;
  
  const currentHintRevealed = currentQuestion
    ? !!(roundState?.[`q${currentQuestion.order}_hints_revealed` as keyof RoundState])
    : false;

  // Timer logic — auto-submit selected option on expiry, otherwise skip
  const handleTimerExpiry = useCallback(() => {
    if (selectedIndex !== undefined && currentQuestion && !submitting && !currentQCompleted) {
      // Auto-submit the selected answer
      (async () => {
        setSubmitting(true);

        const { round4PartBQuestions } = await import("@/lib/round4PartB");
        const qData = round4PartBQuestions.find((q) => q.order === currentQuestion.order);
        if (!qData) {
          setSubmitting(false);
          return;
        }

        const isCorrect = Number(selectedIndex) === qData.correct_index;

        if (isCorrect) {
          toast.success("Correct!");
          const isAllDone = currentQIdx + 1 === questions.length;
          
          setRoundState(prev => prev ? { 
            ...prev, 
            [`q${currentQuestion.order}_completed`]: true,
            is_completed: isAllDone 
          } : null);

          if (isAllDone) {
            setTimeout(() => setAllDone(true), 1200);
          } else {
            setTimeout(() => {
              const nextIdx = currentQIdx + 1;
              if (nextIdx < questions.length) {
                setCurrentQIdx(nextIdx);
                setSelectedIndex(undefined);
                setHintText(null);
                setTimeLeft(30);
              }
            }, 1400);
          }

          fetch("/api/rounds/4/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answerIndex: selectedIndex, questionOrder: currentQuestion.order }),
          }).catch(console.error);

        } else {
          toast.error("Wrong answer");
        }
        
        setSubmitting(false);
      })();
    } else {
      handleSkip();
    }
  }, [selectedIndex, currentQuestion, submitting, currentQCompleted, currentQIdx, questions]);

  useEffect(() => {
    if (allDone || loading || submitting) return;
    if (timeLeft <= 0) return;

    const cq = questions[currentQIdx];
    if (!cq) return;
    const isCompleted = !!roundState?.[`q${cq.order}_completed` as keyof RoundState];
    if (isCompleted) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimerExpiry();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentQIdx, allDone, loading, submitting, questions, roundState, handleTimerExpiry]);

  const handleSkip = async () => {
    const cq = questions[currentQIdx];
    if (!cq) return;
    setSubmitting(true);

    const isAllDone = currentQIdx + 1 === questions.length;
    const updatedRS = {
      ...roundState!,
      [`q${cq.order}_completed`]: true,
      is_completed: isAllDone,
    } as RoundState;
    setRoundState(updatedRS);

    if (isAllDone) {
      setAllDone(true);
    } else {
      const nextIdx = currentQIdx + 1;
      if (nextIdx < questions.length) {
        setCurrentQIdx(nextIdx);
        setSelectedIndex(undefined);
        setHintText(null);
        setTimeLeft(30);
      }
    }

    fetch("/api/rounds/4/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        answerIndex: -1, 
        questionOrder: cq.order,
        skipped: true 
      }),
    }).catch(console.error);

    setSubmitting(false);
  };
  const optionsDisabled = submitting || loading || currentQCompleted;

  const getNextHintCost = useCallback(() => {
    let count = 0;
    if (roundState) {
      for (const key of Object.keys(roundState)) {
        if (key.endsWith("_hints_revealed")) {
          const qNumMatch = key.match(/^q(\d+)_/);
          if (qNumMatch) {
            const qNum = parseInt(qNumMatch[1], 10);
            if (qNum >= 4) {
              const val = (roundState as any)[key];
              if (val === true) count += 1;
            }
          }
        }
      }
    }
    const costs = [100, 110, 130];
    return count < costs.length ? costs[count] : 130;
  }, [roundState]);

  const handleSubmit = async () => {
    if (selectedIndex === undefined || !currentQuestion || submitting || currentQCompleted) return;
    
    setSubmitting(true);

    const { round4PartBQuestions } = await import("@/lib/round4PartB");
    const qData = round4PartBQuestions.find((q) => q.order === currentQuestion.order);
    if (!qData) {
      setSubmitting(false);
      return;
    }

    const isCorrect = Number(selectedIndex) === qData.correct_index;

    if (isCorrect) {
      toast.success("Correct!");
      const isAllDone = currentQIdx + 1 === questions.length;
      
      setRoundState(prev => prev ? { 
        ...prev, 
        [`q${currentQuestion.order}_completed`]: true,
        is_completed: isAllDone 
      } : null);

      if (isAllDone) {
        setTimeout(() => setAllDone(true), 1200);
      } else {
        setTimeout(() => {
          const nextIdx = currentQIdx + 1;
          if (nextIdx < questions.length) {
            setCurrentQIdx(nextIdx);
            setSelectedIndex(undefined);
            setHintText(null);
            setSubmitFeedback(null);
            setTimeLeft(30);
          }
        }, 1400);
      }

      // Background Sync
      fetch("/api/rounds/4/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerIndex: selectedIndex, questionOrder: currentQuestion.order }),
      }).catch(console.error);

    } else {
      toast.error("Wrong answer");
    }
    
    setSubmitting(false);
  };

  const handleHint = async () => {
    if (!currentQuestion || currentQCompleted || submitting || currentHintRevealed) return;
    
    // 1. Instantly get the static answer data
    const { round4PartBQuestions } = await import("@/lib/round4PartB");
    const qData = round4PartBQuestions.find(q => q.order === currentQuestion.order);
    if (!qData) return;

    // 2. Instantly update UI
    setHintText(qData.hint);
    setRoundState(prev => prev ? { 
      ...prev, 
      [`q${currentQuestion.order}_hints_revealed`]: true,
    } : null);

    // 3. Background Sync (no await)
    fetch("/api/rounds/4/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionOrder: currentQuestion.order }),
    }).catch(console.error);
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

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Hidden eager preload tags for videos conceptually, but standard link preload */}
        <div className="hidden" aria-hidden="true">
          {allVideoUrls.map((url, idx) => (
             <link key={idx} rel="preload" as="video" href={url} />
          ))}
        </div>

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 md:px-10 relative z-20">
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
        </header>

        {/* Main Content */}
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8 relative z-20">
          <div className="w-full max-w-5xl space-y-6">
            
            {/* Success State */}
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
                    Round 4 Complete!
                  </div>
                  <Button
                    size="lg"
                    onClick={() => router.push("/dashboard")}
                    className="bg-white/30 border-2 border-white/40 backdrop-blur-md px-10 py-6 text-lg font-black uppercase tracking-widest text-white hover:bg-white/40 shadow-lg pointer-events-auto"
                  >
                    Back to Dashboard →
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Gameplay Area */}
            {!allDone && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentQIdx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-8 relative z-30"
                >
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-black text-white drop-shadow-lg">
                        Q{currentQuestion?.order || 4}/{Math.max(1, questions.length) + 3}
                      </span>
                      <Badge className="bg-white/30 text-white border border-white/40 font-bold uppercase tracking-wider">
                        PHASE B - VIDEO
                      </Badge>
                    </div>
                  </div>

                  {/* Video Player + Timer positioned above top-right of clip (matching Part 1) */}
                  <div className="w-full mx-auto max-w-3xl relative">
                    {!allDone && !currentQCompleted && (
                      <div className="flex justify-end mb-3">
                        <div className="flex items-center gap-2 rounded-full border-2 border-white/40 bg-black/40 px-5 py-2 backdrop-blur-md shadow-lg">
                          <span className="text-sm font-bold uppercase tracking-widest text-zinc-300">Time</span>
                          <span className={`text-2xl font-black tabular-nums transition-colors ${timeLeft <= 10 ? "text-red-400 animate-pulse" : "text-white"}`}>
                            00:{timeLeft.toString().padStart(2, "0")}
                          </span>
                        </div>
                      </div>
                    )}
                    <Card className="relative overflow-hidden border-4 border-white/40 bg-black/50 p-2 backdrop-blur-sm shadow-2xl rounded-2xl flex items-center justify-center min-h-[300px]">
                      {loading ? (
                        <Skeleton className="h-full w-full absolute inset-0" />
                      ) : (
                        <div className="w-full flex justify-center">
                          <VideoPlayer 
                            src={currentQuestion?.video_url || ""} 
                            className="w-full max-h-[400px] rounded-xl object-contain bg-black"
                          />
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* Question Text */}
                  <div className="text-center px-2">
                    <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-wide drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                      {currentQuestion?.question || "Loading..."}
                    </h2>
                  </div>

                  {/* Hint Display */}
                  {(hintText || currentHintRevealed) && (
                    <div className="mx-auto w-full max-w-2xl px-6 py-3 bg-amber-500/20 border-2 border-amber-400/50 rounded-xl text-center backdrop-blur-md shadow-lg">
                      <p className="text-amber-100 font-bold italic drop-shadow-md">
                        {hintText || "Hint revealed" }
                      </p>
                    </div>
                  )}

                  {/* Bottom: Options Grid */}
                  <div className="max-w-4xl mx-auto pointer-events-auto">
                    <MCQGrid 
                      options={currentQuestion?.options || []}
                      onSelect={setSelectedIndex}
                      selectedIndex={selectedIndex}
                      disabled={optionsDisabled}
                    />
                  </div>



                  {/* Action Buttons Row */}
                  <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-6 px-4 mt-8 pb-10 pointer-events-auto">
                    {!currentQCompleted && currentQuestion ? (
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={handleHint}
                        disabled={submitting || loading || currentHintRevealed}
                        className="h-auto shrink-0 border-2 px-5 py-2 font-bold uppercase tracking-wider backdrop-blur-md shadow-lg transition-all duration-300 enabled:bg-white/25 enabled:border-white/40 enabled:text-white enabled:hover:bg-white/35 disabled:bg-black/30 disabled:border-black/20 disabled:text-white/40"
                      >
                        <div className="flex flex-col items-center">
                          <div className="flex items-center">
                            <span>💡 HINT</span>
                            <Badge className="ml-2 bg-white/30 text-white border border-white/40">
                              {currentHintRevealed ? 0 : 1} left
                            </Badge>
                          </div>
                          <span className="text-xs opacity-90 mt-1 font-semibold bg-black/20 px-2 py-0.5 rounded-full">
                            {getNextHintCost()} pts
                          </span>
                        </div>
                      </Button>
                    ) : <div />}

                    {!currentQCompleted && currentQuestion ? (
                      <Button
                        size="lg"
                        onClick={handleSubmit}
                        disabled={selectedIndex === undefined || submitting}
                        className="h-12 shrink-0 backdrop-blur-md border-2 px-8 font-black uppercase tracking-widest shadow-lg transition-all duration-300 enabled:bg-white/30 enabled:border-white/40 enabled:text-white enabled:hover:bg-white/40 disabled:bg-black/30 disabled:border-black/20 disabled:text-white/40"
                      >
                        {submitting ? "..." : "SUBMIT"}
                      </Button>
                    ) : <div />}
                  </div>

                  {error && (
                    <div className="mx-auto w-full max-w-md rounded-xl border-2 border-red-400/50 bg-red-500/20 px-6 py-4 text-center backdrop-blur-md shadow-lg mt-4">
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
