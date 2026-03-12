"use client";

import React, { useEffect, useState, useCallback } from "react";
import DashboardNavbar from "@/app/Components/Navigation/DashboardNavbar";
import SegmentedInput from "@/app/Components/Game/SegmentedInput";
import { motion, AnimatePresence } from "framer-motion";

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

export default function Round4Part1Page() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [roundState, setRoundState] = useState<RoundState | null>(null);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [revealedIndices, setRevealedIndices] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<"correct" | "wrong" | null>(null);
  const [allDone, setAllDone] = useState(false);

  const applyPuzzleState = (puz: Puzzle, rs: RoundState) => {
    const hints: number[] = rs[`q${puz.order}_hints_revealed` as keyof RoundState] as number[] || [];
    setRevealedIndices(hints);
    const ans = Array(puz.answer_length).fill(".");
    (puz.revealed_letters || []).forEach((l) => {
      if (hints.includes(l.index)) ans[l.index] = l.char;
    });
    setAnswer(ans.join(""));
  };

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rounds/4/state");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load puzzle"); return; }

      setPuzzles(data.puzzles);
      setRoundState(data.roundState);
      setAllDone(data.roundState.is_completed);

      // Start at the first uncompleted puzzle
      const startIdx = data.puzzles.findIndex(
        (p: Puzzle) => !data.roundState[`q${p.order}_completed` as keyof RoundState]
      );
      const idx = startIdx === -1 ? data.puzzles.length - 1 : startIdx;
      setCurrentQIdx(idx);
      if (data.puzzles[idx]) applyPuzzleState(data.puzzles[idx], data.roundState);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);

  const currentPuzzle = puzzles[currentQIdx] ?? null;
  const currentQCompleted = currentPuzzle
    ? !!(roundState?.[`q${currentPuzzle.order}_completed` as keyof RoundState])
    : false;
  const currentHints: number[] = currentPuzzle
    ? (roundState?.[`q${currentPuzzle.order}_hints_revealed` as keyof RoundState] as number[] || [])
    : [];
  const canSubmit = !answer.includes(".") && answer.length > 0 && !submitting && !currentQCompleted;

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
    if (!currentPuzzle || currentQCompleted) return;
    try {
      const res = await fetch("/api/rounds/4/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentAnswer: answer, questionOrder: currentPuzzle.order }),
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
          prev ? { ...prev, [`q${currentPuzzle.order}_hints_revealed`]: newRevealed } : prev
        );
      } else {
        alert(data.error || "Failed to get hint");
      }
    } catch {
      alert("Network error");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col selection:bg-indigo-500/30">
      <DashboardNavbar />
      <main className="flex-1 flex flex-col gap-6 px-8 py-8 max-w-4xl mx-auto w-full">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3">
          <div className="inline-block px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
            <span className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em]">
              Round 4 • Part A
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">
            Visual Puzzle
          </h1>
          <p className="text-zinc-500 text-sm font-medium">Connect the images to find the hidden word.</p>

          {/* Question progress dots */}
          {!loading && puzzles.length > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              {puzzles.map((p, i) => {
                const done = !!(roundState?.[`q${p.order}_completed` as keyof RoundState]);
                return (
                  <div key={p.order} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      done ? "bg-emerald-400" : i === currentQIdx ? "bg-indigo-400 scale-125" : "bg-zinc-700"
                    }`} />
                    <span className={`text-xs font-bold ${
                      done ? "text-emerald-400" : i === currentQIdx ? "text-indigo-400" : "text-zinc-600"
                    }`}>Q{i + 1}</span>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* All done */}
        <AnimatePresence>
          {allDone && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6 py-12"
            >
              <div className="text-5xl">🎉</div>
              <div className="flex items-center gap-2 text-emerald-400 font-black uppercase tracking-[0.2em] text-sm">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                All Puzzles Solved!
              </div>
              <button
                onClick={() => (window.location.href = "/dashboard/round/4/part2")}
                className="px-10 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-500 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(79,70,229,0.4)] uppercase tracking-widest text-sm"
              >
                Enter Round 4 Part B →
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Puzzle area */}
        {!allDone && (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQIdx}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.22 }}
              className="flex flex-col gap-6"
            >
              {/* Images Row */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-6 w-full">
                <div className="h-56 md:h-72 bg-zinc-800/60 rounded-2xl border border-zinc-700/50 overflow-hidden shadow-xl">
                  {loading ? (
                    <div className="w-full h-full bg-zinc-800 animate-pulse" />
                  ) : currentPuzzle?.image_urls?.[0] ? (
                    <img src={currentPuzzle.image_urls[0]} alt="Puzzle part 1" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800/60" />
                  )}
                </div>
                <div className="flex items-center justify-center px-3">
                  <span className="text-zinc-500 text-2xl font-black">+</span>
                </div>
                <div className="h-56 md:h-72 bg-zinc-800/60 rounded-2xl border border-zinc-700/50 overflow-hidden shadow-xl">
                  {loading ? (
                    <div className="w-full h-full bg-zinc-800 animate-pulse" />
                  ) : currentPuzzle?.image_urls?.[1] ? (
                    <img src={currentPuzzle.image_urls[1]} alt="Puzzle part 2" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800/60" />
                  )}
                </div>
              </div>

              {/* Load error */}
              {error && (
                <div className="text-center py-4 px-6 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-400 text-sm font-medium">{error}</p>
                  <button onClick={fetchState} className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 underline">Try again</button>
                </div>
              )}

              {/* Answer length indicator */}
              <div className="flex items-center gap-1">
                {loading ? (
                  <div className="h-3 w-32 bg-zinc-800 animate-pulse rounded" />
                ) : currentPuzzle ? (
                  <>
                    <span className="text-zinc-400 font-mono text-sm mr-2">{currentPuzzle.answer_length} letters</span>
                    {Array.from({ length: currentPuzzle.answer_length }).map((_, i) => (
                      <span key={i} className="w-5 h-0.5 bg-zinc-600 inline-block mx-0.5 rounded" />
                    ))}
                  </>
                ) : null}
              </div>

              {/* Feedback banner */}
              <AnimatePresence>
                {submitFeedback === "correct" && (
                  <motion.div
                    key="correct"
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-3 px-5 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl"
                  >
                    <span className="text-emerald-400 text-xl font-black">✓</span>
                    <div>
                      <p className="text-emerald-400 font-bold text-sm">Correct!</p>
                      <p className="text-zinc-500 text-xs">
                        {currentQIdx + 1 < puzzles.length ? "Moving to next puzzle…" : "All puzzles solved!"}
                      </p>
                    </div>
                  </motion.div>
                )}
                {submitFeedback === "wrong" && (
                  <motion.div
                    key="wrong"
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-3 px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                  >
                    <span className="text-red-400 text-xl font-black">✗</span>
                    <div>
                      <p className="text-red-400 font-bold text-sm">Wrong answer — try again</p>
                      <p className="text-zinc-500 text-xs">Look carefully at both images together.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hint + Input + Submit Row */}
              <div className="flex items-center gap-3 w-full">
                {/* Hint button */}
                {!currentQCompleted && currentPuzzle && (
                  <button
                    onClick={handleHint}
                    disabled={submitting || loading}
                    className="shrink-0 px-5 py-3 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold rounded-xl hover:bg-zinc-800 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest whitespace-nowrap"
                  >
                    Unlock Hint
                    <span className="ml-1.5 text-indigo-400">({10 * (currentHints.length + 1)} pts)</span>
                  </button>
                )}

                {/* Segmented input */}
                <div className="flex-1 min-w-0 bg-zinc-900/50 rounded-xl border border-zinc-800 px-4 py-3 flex items-center overflow-x-auto">
                  {loading ? (
                    <div className="w-full h-10 bg-zinc-800 animate-pulse rounded-lg" />
                  ) : currentPuzzle ? (
                    <SegmentedInput
                      length={currentPuzzle.answer_length}
                      value={answer}
                      onChange={handleAnswerChange}
                      revealedIndices={revealedIndices}
                    />
                  ) : (
                    <span className="text-zinc-600 text-sm">{error ? "" : "No puzzle loaded"}</span>
                  )}
                </div>

                {/* Submit button */}
                {!currentQCompleted && currentPuzzle && (
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="shrink-0 px-6 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-500 transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 text-xs uppercase tracking-widest whitespace-nowrap"
                  >
                    {submitting ? "…" : "Submit"}
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
