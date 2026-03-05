"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/lib/useTeam";
import {
  getRoundQuestions, submitRound, subscribeToGameState,
  Question,
} from "@/lib/database";
import { Clock, CheckCircle, Lock } from "lucide-react";
import Image from "next/image";

const PER_Q_TIME = 30; // seconds per question

export default function Round3Page() {
  const { team, submission } = useTeam();
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(PER_Q_TIME);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [roundStatus, setRoundStatus] = useState("locked");
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check already submitted
  useEffect(() => {
    if (submission?.round3) {
      setSubmitted(true);
      setScore(submission.round3.score);
    }
  }, [submission]);

  useEffect(() => {
    const unsub = subscribeToGameState((gs) => {
      setRoundStatus(gs?.round_statuses?.["3"]?.status ?? "locked");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    getRoundQuestions("3").then((qs) => {
      setQuestions(qs);
      setLoading(false);
    });
  }, []);

  // Reset image loading state on question change
  useEffect(() => {
    setImagesLoaded(false);
    setLoadedCount(0);
    setTimeLeft(PER_Q_TIME);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [current]);

  // Start timer only when all images loaded
  useEffect(() => {
    if (!imagesLoaded) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleNext(); // auto-advance
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

  const handleNext = useCallback(() => {
    setCurrent((prev) => {
      const next = prev + 1;
      return next;
    });
  }, []);

  const handleAnswer = useCallback(
    (qId: string, idx: number) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setAnswers((prev) => ({ ...prev, [qId]: idx }));
      setTimeout(() => {
        if (current < questions.length - 1) {
          setCurrent((c) => c + 1);
        } else {
          doSubmit({ ...answers, [qId]: idx });
        }
      }, 400);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, questions.length, answers]
  );

  const doSubmit = useCallback(
    async (finalAnswers: Record<string, number>) => {
      if (!team || submitted) return;
      if (timerRef.current) clearInterval(timerRef.current);
      let calc = 0;
      questions.forEach((q) => {
        if (finalAnswers[q.id] === q.correct_index) calc += q.points;
      });
      await submitRound(team.id, "3", finalAnswers, calc);
      setScore(calc);
      setSubmitted(true);
    },
    [team, submitted, questions]
  );

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (submitted) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="text-center space-y-4">
          <CheckCircle size={64} className="text-green-400 mx-auto" />
          <h1 className="text-3xl font-bold">Round 3 Complete!</h1>
          <p className="text-5xl font-black text-yellow-400 mt-2">{score} GC</p>
          <button onClick={() => router.push("/dashboard")} className="mt-6 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold transition-all">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  if (roundStatus === "locked") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="text-center"><Lock size={48} className="text-zinc-600 mx-auto mb-4" /><h2 className="text-2xl font-bold">Round 3 is Locked</h2><button onClick={() => router.push("/dashboard")} className="mt-6 px-5 py-2.5 bg-zinc-800 rounded-xl text-sm">← Back</button></div>
      </div>
    );
  }

  const q = questions[current];
  if (!q) return null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-16 z-40 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-zinc-400">Q {current + 1} / {questions.length}</span>
        <div className={`flex items-center gap-2 font-mono font-bold ${timeLeft <= 10 ? "text-red-400" : "text-emerald-400"}`}>
          <Clock size={16} />
          {timeLeft}s
          {!imagesLoaded && <span className="text-xs text-zinc-500 font-normal ml-2">Loading images…</span>}
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 max-w-2xl mx-auto w-full">
        <h2 className="text-lg font-bold text-center">Pick the correct image</h2>

        <div className="grid grid-cols-2 gap-4 w-full">
          {(q.image_urls ?? []).map((url, idx) => (
            <button
              key={idx}
              disabled={!imagesLoaded}
              onClick={() => handleAnswer(q.id, idx)}
              className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all
                ${answers[q.id] === idx ? "border-emerald-400 scale-[0.97]" : "border-zinc-700 hover:border-zinc-500"}
                ${!imagesLoaded ? "opacity-50 cursor-wait" : ""}
              `}
            >
              <Image
                src={url}
                alt={`Option ${idx + 1}`}
                fill
                className="object-cover"
                onLoad={handleImageLoad}
                onError={handleImageLoad}
              />
            </button>
          ))}
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i < current ? "bg-emerald-400" : i === current ? "bg-white" : "bg-zinc-700"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
