"use client";

import React, { useEffect, useState, useCallback } from "react";
import DashboardNavbar from "@/app/Components/Navigation/DashboardNavbar";
import VideoPlayer from "@/app/Components/Game/VideoPlayer";
import MCQGrid from "@/app/Components/Game/MCQGrid";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";

interface Question {
  order: number;
  question: string;
  video_url: string;
  options: string[];
  type: string;
  points: number;
  hint: string;
  hint_cost: number;
}

interface RoundState {
  [key: string]: any;
  is_completed: boolean;
  points_spent: number;
}

export default function Round4Part2Page() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [roundState, setRoundState] = useState<RoundState | null>(null);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<"correct" | "wrong" | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rounds/4/state");
      const data = await res.json();
      if (!res.ok) { 
        setError(data.error || "Failed to load state"); 
        return; 
      }

      const partB = data.puzzles.filter((q: Question) => q.order >= 4);
      setQuestions(partB);
      setRoundState(data.roundState);
      
      const partBCompleted = partB.every((q: Question) => data.roundState[`q${q.order}_completed`]);
      if (partBCompleted && data.roundState.is_completed) {
        setAllDone(true);
      }

      const startIdx = partB.findIndex(
        (q: Question) => !data.roundState[`q${q.order}_completed`]
      );
      setCurrentQIdx(startIdx === -1 ? 0 : startIdx);
      
      setHintText(null);
      setSelectedIndex(undefined);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchState(); 
  }, [fetchState]);

  const currentQuestion = questions[currentQIdx] ?? null;
  const currentQCompleted = currentQuestion
    ? !!(roundState?.[`q${currentQuestion.order}_completed` as keyof RoundState])
    : false;
  
  const currentHintRevealed = currentQuestion
    ? !!(roundState?.[`q${currentQuestion.order}_hints_revealed` as keyof RoundState])
    : false;

  const handleSubmit = async () => {
    if (selectedIndex === undefined || !currentQuestion || submitting || currentQCompleted) return;
    
    setSubmitting(true);
    setSubmitFeedback(null);
    try {
      const res = await fetch("/api/rounds/4/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerIndex: selectedIndex, questionOrder: currentQuestion.order }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setSubmitFeedback("correct");
        setRoundState(prev => prev ? { 
          ...prev, 
          [`q${currentQuestion.order}_completed`]: true,
          is_completed: data.allDone 
        } : null);

        if (data.allDone) {
          setTimeout(() => setAllDone(true), 1500);
        } else {
          setTimeout(() => {
            const nextIdx = currentQIdx + 1;
            if (nextIdx < questions.length) {
              setCurrentQIdx(nextIdx);
              setSelectedIndex(undefined);
              setHintText(null);
              setSubmitFeedback(null);
            }
          }, 1800);
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

  const handleHint = async () => {
    if (!currentQuestion || currentQCompleted || submitting) return;
    
    try {
      const res = await fetch("/api/rounds/4/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionOrder: currentQuestion.order }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setHintText(data.hint);
        setRoundState(prev => prev ? { 
          ...prev, 
          [`q${currentQuestion.order}_hints_revealed`]: true,
          points_spent: (prev.points_spent || 0) + (data.cost || 0)
        } : null);
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
      
      <main className="flex-1 flex flex-col gap-6 px-6 py-10 max-w-4xl mx-auto w-full">
        {/* Header Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em]">
              Round 4 • Part B
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">
            Video Challenge
          </h1>
          <p className="text-zinc-500 text-xs md:text-sm font-medium">
            Watch carefully and identify the correct character or scene detail.
          </p>

          {/* Progress Indicator */}
          {!loading && questions.length > 0 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              {questions.map((q, i) => {
                const isDone = roundState?.[`q${q.order}_completed` as keyof RoundState];
                const isActive = i === currentQIdx;
                return (
                  <div key={q.order} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${isDone ? "bg-emerald-500" : isActive ? "bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]" : "bg-zinc-800"}`} />
                );
              })}
            </div>
          )}
        </div>

        {/* Success State */}
        {allDone && (
          <div className="flex flex-col items-center gap-6 py-16 bg-emerald-500/5 border border-emerald-500/10 rounded-[2.5rem] text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">Round 4 Complete!</h2>
              <p className="text-zinc-400 text-sm">All challenges mastered.</p>
            </div>
            <button
              onClick={() => (window.location.href = "/dashboard")}
              className="px-8 py-4 bg-emerald-600 text-white font-black rounded-xl hover:bg-emerald-500 transition-all hover:scale-105 active:scale-95 uppercase tracking-widest text-xs"
            >
              Back to Dashboard
            </button>
          </div>
        )}

        {/* Gameplay Area */}
        {!allDone && (
          <div className="flex flex-col gap-6">
            {/* Top: Video Player */}
            <div className="w-full">
              <VideoPlayer 
                src={currentQuestion?.video_url || ""} 
                className="w-full max-h-[400px]"
              />
            </div>

            {/* Question Text */}
            <div className="px-2">
              <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight leading-tight">
                {currentQuestion?.question}
              </h2>
            </div>

            {/* Middle: Hint Button (Right Aligned) */}
            <div className="flex justify-between items-center px-2">
               <div className="flex items-center gap-2">
                  <h3 className="text-zinc-400 font-black uppercase tracking-widest text-[10px]">Select Answer</h3>
                  <div className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" />
                    <span className="text-indigo-400 font-bold text-[8px] uppercase tracking-widest">Live</span>
                  </div>
               </div>
               
               {!currentQCompleted && (
                 <div className="flex items-center gap-3">
                    {(hintText || currentHintRevealed) && (
                      <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-200/80 font-bold italic">
                        {hintText || "Hint revealed"}
                      </div>
                    )}
                    
                    {!hintText && !currentHintRevealed && (
                      <button
                        onClick={handleHint}
                        disabled={submitting || loading}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-black rounded-lg transition-all border border-zinc-800 text-[10px] uppercase tracking-widest"
                      >
                        <HelpCircle className="w-3 h-3 text-amber-500" />
                        Hint <span className="text-amber-500/80">(-{currentQuestion?.hint_cost || 15} pts)</span>
                      </button>
                    )}
                 </div>
               )}
            </div>

            {/* Bottom: Options Grid */}
            <div>
              <MCQGrid 
                options={currentQuestion?.options || []}
                onSelect={setSelectedIndex}
                selectedIndex={selectedIndex}
                disabled={submitting || currentQCompleted || loading}
              />
            </div>

            {/* Feedback & Submit Button */}
            <div className="flex flex-col gap-4 mt-2">
              <AnimatePresence mode="wait">
                {submitFeedback === "correct" && (
                  <motion.div
                    key="correct"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span className="text-emerald-400 font-black uppercase tracking-widest text-[10px]">Correct Answer!</span>
                  </motion.div>
                )}
                
                {submitFeedback === "wrong" && (
                  <motion.div
                    key="wrong"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                    <span className="text-red-400 font-black uppercase tracking-widest text-[10px]">Incorrect Choice — Watch again</span>
                  </motion.div>
                )}

                {!submitFeedback && !currentQCompleted && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={handleSubmit}
                    disabled={selectedIndex === undefined || submitting}
                    className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-500 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-[0.2em] text-xs shadow-[0_10px_20px_rgba(79,70,229,0.2)]"
                  >
                    {submitting ? "Processing..." : "Submit Answer"}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-6 px-8 bg-red-500/10 border border-red-500/20 rounded-2xl max-w-sm mx-auto">
            <p className="text-red-400 text-xs font-bold">{error}</p>
            <button onClick={fetchState} className="mt-4 text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest underline underline-offset-4">
              Try Again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
