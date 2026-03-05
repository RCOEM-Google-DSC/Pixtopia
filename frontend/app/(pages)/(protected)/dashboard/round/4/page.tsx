"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/lib/useTeam";
import {
  getRoundQuestions, submitRound, subscribeToGameState,
  Question,
} from "@/lib/database";
import { Clock, CheckCircle, Delete, Lock } from "lucide-react";
import Image from "next/image";

const PER_Q_TIME = 60; // 1 minute per question

export default function Round4Page() {
  const { team, submission } = useTeam();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentWord, setCurrentWord] = useState<string[]>([]);
  const [usedIndices, setUsedIndices] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(PER_Q_TIME);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [roundStatus, setRoundStatus] = useState("locked");
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (submission?.round4) {
      setSubmitted(true);
      setScore(submission.round4.score);
    }
  }, [submission]);

  useEffect(() => {
    const unsub = subscribeToGameState((gs) => {
      setRoundStatus(gs?.round_statuses?.["4"]?.status ?? "locked");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    getRoundQuestions("4").then((qs) => {
      setQuestions(qs);
      setLoading(false);
    });
  }, []);

  // Reset on question change
  useEffect(() => {
    setImagesLoaded(false);
    setLoadedCount(0);
    setTimeLeft(PER_Q_TIME);
    setCurrentWord([]);
    setUsedIndices([]);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [current]);

  // Start timer when images loaded
  useEffect(() => {
    if (!imagesLoaded) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          advanceQuestion();
          return PER_Q_TIME;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesLoaded, current]);

  const handleImageLoad = useCallback(() => {
    setLoadedCount((c) => {
      const next = c + 1;
      if (next >= 4) setImagesLoaded(true);
      return next;
    });
  }, []);

  const advanceQuestion = useCallback(() => {
    setCurrent((prev) => prev + 1);
  }, []);

  const handleLetterClick = (letter: string, idx: number) => {
    if (usedIndices.includes(idx)) return;
    setCurrentWord((w) => [...w, letter]);
    setUsedIndices((u) => [...u, idx]);
  };

  const handleBackspace = () => {
    setCurrentWord((w) => w.slice(0, -1));
    setUsedIndices((u) => u.slice(0, -1));
  };

  const handleSubmitWord = useCallback(async () => {
    if (!questions[current]) return;
    const q = questions[current];
    const word = currentWord.join("");
    const newAnswers = { ...answers, [q.id]: word };
    setAnswers(newAnswers);

    if (timerRef.current) clearInterval(timerRef.current);

    if (current < questions.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      // Final submit
      if (!team || submitted) return;
      let calc = 0;
      questions.forEach((qItem) => {
        const ans = newAnswers[qItem.id] ?? "";
        if (ans.toLowerCase() === (qItem.answer ?? "").toLowerCase()) calc += qItem.points;
      });
      await submitRound(team.id, "4", newAnswers, calc);
      setScore(calc);
      setSubmitted(true);
    }
  }, [questions, current, currentWord, answers, team, submitted]);

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (submitted) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="text-center space-y-4">
          <CheckCircle size={64} className="text-green-400 mx-auto" />
          <h1 className="text-3xl font-bold">Round 4 Complete!</h1>
          <p className="text-5xl font-black text-yellow-400 mt-2">{score} GC</p>
          <button onClick={() => router.push("/dashboard")} className="mt-6 px-6 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl text-sm font-semibold transition-all">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  if (roundStatus === "locked") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="text-center"><Lock size={48} className="text-zinc-600 mx-auto mb-4" /><h2 className="text-2xl font-bold">Round 4 is Locked</h2><button onClick={() => router.push("/dashboard")} className="mt-6 px-5 py-2.5 bg-zinc-800 rounded-xl text-sm">← Back</button></div>
      </div>
    );
  }

  if (current >= questions.length) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const q = questions[current];
  const shuffledLetters = q.letters ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Timer bar */}
      <div className="sticky top-16 z-40 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-zinc-400">Q {current + 1} / {questions.length}</span>
        <div className={`flex items-center gap-2 font-mono font-bold ${timeLeft <= 15 ? "text-red-400" : "text-amber-400"}`}>
          <Clock size={16} />
          {timeLeft}s
          {!imagesLoaded && <span className="text-xs text-zinc-500 font-normal ml-2">Loading…</span>}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 gap-6 max-w-2xl mx-auto w-full">
        <h2 className="text-lg font-bold text-center">What word do these 4 images represent?</h2>

        {/* 4 images grid */}
        <div className="grid grid-cols-2 gap-3 w-full">
          {(q.image_urls ?? []).map((url, idx) => (
            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-zinc-800">
              <Image
                src={url}
                alt={`Image ${idx + 1}`}
                fill
                className="object-cover"
                onLoad={handleImageLoad}
                onError={handleImageLoad}
              />
            </div>
          ))}
        </div>

        {/* Word being built */}
        <div className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-4 flex items-center gap-2 min-h-[60px]">
          {currentWord.length === 0 ? (
            <span className="text-zinc-600">Click letters below to form the word…</span>
          ) : (
            currentWord.map((letter, idx) => (
              <span
                key={idx}
                className="w-9 h-9 bg-amber-500/20 border border-amber-500/40 rounded-lg flex items-center justify-center text-amber-300 font-bold uppercase text-sm"
              >
                {letter}
              </span>
            ))
          )}
        </div>

        {/* Letter tiles */}
        <div className="flex flex-wrap gap-2 justify-center">
          {shuffledLetters.map((letter, idx) => {
            const used = usedIndices.includes(idx);
            return (
              <button
                key={idx}
                disabled={used || !imagesLoaded}
                onClick={() => handleLetterClick(letter, idx)}
                className={`w-10 h-10 rounded-lg text-sm font-bold uppercase border transition-all
                  ${used
                    ? "bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-800 border-zinc-600 text-white hover:bg-amber-500/20 hover:border-amber-500/50"
                  }`}
              >
                {letter}
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex gap-3 w-full">
          <button
            onClick={handleBackspace}
            disabled={currentWord.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Delete size={14} /> Backspace
          </button>
          <button
            onClick={handleSubmitWord}
            disabled={currentWord.length === 0 || !imagesLoaded}
            className="flex-1 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {current < questions.length - 1 ? "Confirm & Next →" : "Submit All →"}
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5">
          {questions.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all ${i < current ? "bg-amber-400" : i === current ? "bg-white" : "bg-zinc-700"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
