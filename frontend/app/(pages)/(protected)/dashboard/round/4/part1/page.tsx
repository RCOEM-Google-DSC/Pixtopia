"use client";

import React, { useEffect, useState } from "react";
import DashboardNavbar from "@/app/Components/Navigation/DashboardNavbar";
import { useTeam } from "@/lib/useTeam";
import { Skeleton } from "@/components/ui/skeleton";
import SegmentedInput from "@/app/Components/Game/SegmentedInput";
import { motion } from "framer-motion";

export default function Round4Part1Page() {
  const { team, loading: teamLoading } = useTeam();
  const [loading, setLoading] = useState(true);
  const [puzzle, setPuzzle] = useState<{ image_urls: string[]; answer_length: number; answer?: string | null; revealed_letters?: { index: number, char: string }[] } | null>(null);
  const [answer, setAnswer] = useState("");
  const [revealedIndices, setRevealedIndices] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const fetchPuzzle = async () => {
    try {
      const res = await fetch("/api/rounds/4/state");
      const data = await res.json();
      if (res.ok) {
        setPuzzle(data.puzzle);
        setIsCompleted(data.roundState?.is_completed || false);
        
        let initialAnswer = Array(data.puzzle.answer_length || 0).fill(".").join("");

        if (data.roundState?.hints_revealed) {
           setRevealedIndices(data.roundState.hints_revealed);
           
           // Pre-fill answer with revealed characters
           if (data.puzzle.revealed_letters && data.puzzle.answer_length) {
              let newAnswer = Array(data.puzzle.answer_length).fill(".");
              data.puzzle.revealed_letters.forEach((hint: { index: number, char: string }) => {
                 newAnswer[hint.index] = hint.char;
              });
              initialAnswer = newAnswer.join("");
           }
        }
        setAnswer(initialAnswer);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPuzzle();
  }, []);

  const handleSubmit = async (currentAnswer: string) => {
    if (submitting || isCompleted) return;
    
    // Check if fully filled
    if (currentAnswer.includes(".")) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/rounds/4/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: currentAnswer })
      });
      const data = await res.json();
      if (res.ok) {
        setIsCompleted(true);
      } else {
        console.log("Incorrect:", data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnswerChange = (newAnswer: string) => {
    setAnswer(newAnswer);
    if (!newAnswer.includes(".")) {
      handleSubmit(newAnswer);
    }
  };

  const handleHint = async () => {
     if (isCompleted) return;
     try {
       const res = await fetch("/api/rounds/4/hint", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ currentAnswer: answer })
       });
       const data = await res.json();
       if (res.ok) {
         setRevealedIndices(prev => [...prev, data.revealedIndex]);
         
         const newAnswerArr = answer.split("");
         newAnswerArr[data.revealedIndex] = data.revealedChar;
         const updatedAnswer = newAnswerArr.join("");
         setAnswer(updatedAnswer);
         
         if (!updatedAnswer.includes(".")) {
            handleSubmit(updatedAnswer);
         }
       } else {
         alert(data.error || "Failed to get hint");
       }
     } catch (err) {
       console.error(err);
     }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col selection:bg-indigo-500/30">
      <DashboardNavbar />
<main className="flex-1 flex flex-col gap-6 px-8 py-8 max-w-4xl mx-auto w-full">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3"
        >
          <div className="inline-block px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
            <span className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em]">
              Round 4 • Part A
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">
            Visual Puzzle
          </h1>
          <p className="text-zinc-500 text-sm font-medium">
            Connect the images to find the hidden word.
          </p>
        </motion.div>

        {/* Images Row: [Left Image] [+] [Right Image] */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-6 w-full"
        >
          {/* Left Image */}
          <div className="h-56 md:h-72 bg-zinc-800/60 rounded-2xl border border-zinc-700/50 overflow-hidden shadow-xl">
            {puzzle?.image_urls?.[0] ? (
              <img
                src={puzzle.image_urls[0]}
                alt="Puzzle part 1"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-zinc-800/60" />
            )}
          </div>

          {/* Center connector */}
          <div className="flex items-center justify-center px-3">
            <span className="text-zinc-500 text-2xl font-black">+</span>
          </div>

          {/* Right Image */}
          <div className="h-56 md:h-72 bg-zinc-800/60 rounded-2xl border border-zinc-700/50 overflow-hidden shadow-xl">
            {puzzle?.image_urls?.[1] ? (
              <img
                src={puzzle.image_urls[1]}
                alt="Puzzle part 2"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-zinc-800/60" />
            )}
          </div>
        </motion.div>

        {/* Answer length indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-1"
        >
          {puzzle ? (
            <>
              <span className="text-zinc-400 font-mono text-sm mr-2">{puzzle.answer_length}×</span>
              {Array.from({ length: puzzle.answer_length }).map((_, i) => (
                <span
                  key={i}
                  className="w-5 h-0.5 bg-zinc-600 inline-block mx-0.5 rounded"
                />
              ))}
            </>
          ) : (
            <span className="text-zinc-700 text-sm font-mono">— ×  —</span>
          )}
        </motion.div>

        {/* Hint + Input Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-4 w-full"
        >
          {/* Hint Button */}
          {!isCompleted && (
            <button
              onClick={handleHint}
              disabled={submitting}
              className="shrink-0 px-6 py-3 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold rounded-xl hover:bg-zinc-800 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest whitespace-nowrap"
            >
              Unlock Hint
              <span className="ml-2 text-indigo-400">
                ({10 * (revealedIndices.length + 1)} pts)
              </span>
            </button>
          )}

          {/* Segmented Input */}
          <div className="flex-1 min-w-0 bg-zinc-900/50 rounded-xl border border-zinc-800 px-4 py-3 flex items-center overflow-x-auto">
            {puzzle ? (
              <SegmentedInput
                length={puzzle.answer_length}
                value={answer}
                onChange={handleAnswerChange}
                revealedIndices={revealedIndices}
              />
            ) : (
              <div className="w-full h-8 animate-pulse" />
            )}
          </div>
        </motion.div>

        {/* Solved state */}
        {isCompleted && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-6 pt-4"
          >
            <div className="flex items-center gap-2 text-emerald-400 font-black uppercase tracking-[0.2em] text-sm">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Puzzle Solved
            </div>
            <button
              onClick={() => window.location.href = "/dashboard/round/4/part2"}
              className="px-10 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-500 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(79,70,229,0.4)] uppercase tracking-widest text-sm"
            >
              Enter Round 4 Part B
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
