"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { subscribeToGameState } from "@/lib/database";
import { createClient } from "@/lib/supabase/client";
import { ExternalLink, Code2, Trophy, Lock } from "lucide-react";

export default function Round2Page() {
  const router = useRouter();
  const { user } = useAuth();
  const [status, setStatus] = useState("locked");
  const [contestUrl, setContestUrl] = useState("");

  useEffect(() => {
    const unsub = subscribeToGameState((gs) => {
      setStatus(gs?.round_statuses?.["2"]?.status ?? "locked");
    });
    return () => unsub();
  }, []);

  // Fetch the user's year and pick the right contest URL
  useEffect(() => {
    if (!user?.id) return;

    const supabase = createClient();
    supabase
      .from("users")
      .select("year")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const year = data?.year?.trim() ?? "";
        // 1st year → contest URL 1, everyone else → contest URL 2
        const isFirstYear = year === "1" || year.toLowerCase().startsWith("1st");
        if (isFirstYear) {
          setContestUrl(
            process.env.NEXT_PUBLIC_HACKERRANK_CONTEST_URL_1 ||
              "https://www.hackerrank.com"
          );
        } else {
          setContestUrl(
            process.env.NEXT_PUBLIC_HACKERRANK_CONTEST_URL_2 ||
              "https://www.hackerrank.com"
          );
        }
      });
  }, [user?.id]);

  const scores = [
    { label: "Easy", count: 3, each: 200, color: "text-emerald-400" },
    { label: "Medium", count: 2, each: 400, color: "text-amber-400" },
    { label: "Hard", count: 1, each: 900, color: "text-rose-400" },
  ];

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header card */}
        <div className="relative bg-zinc-900/60 border border-cyan-500/30 rounded-2xl p-8 overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl" />
          <div className="relative space-y-3">
            <div className="flex items-center gap-2 text-cyan-400">
              <Code2 size={20} />
              <span className="text-sm font-semibold uppercase tracking-wider">Round 2</span>
            </div>
            <h1 className="text-3xl font-extrabold">Competitive Programming</h1>
            <p className="text-zinc-400 text-sm">
              Solve Pixar-themed coding problems on HackerRank. Scores are tracked automatically.
            </p>

            {/* Score breakdown */}
            <div className="mt-6 space-y-3">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Score Breakdown</p>
              {scores.map((s) => (
                <div key={s.label} className="flex items-center justify-between bg-zinc-800/50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${s.color}`}>{s.label}</span>
                    <span className="text-zinc-500 text-sm">× {s.count} questions</span>
                  </div>
                  <div className="text-right">
                    <span className={`font-bold ${s.color}`}>{s.each * s.count} GC</span>
                    <span className="text-zinc-600 text-xs ml-1">({s.each} each)</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3 border border-zinc-700">
                <div className="flex items-center gap-2">
                  <Trophy size={16} className="text-yellow-400" />
                  <span className="font-bold text-white">Total</span>
                </div>
                <span className="font-black text-yellow-400 text-lg">2300 GC</span>
              </div>
            </div>

            {/* CTA */}
            <div className="pt-4">
              {status === "locked" ? (
                <div className="flex items-center gap-3 bg-zinc-800/80 rounded-xl px-5 py-4 border border-zinc-700">
                  <Lock size={20} className="text-zinc-500" />
                  <div>
                    <p className="text-sm font-semibold text-zinc-300">Round Not Started</p>
                    <p className="text-xs text-zinc-500">Admin will share the contest link when ready.</p>
                  </div>
                </div>
              ) : (
                <a
                  href={contestUrl || "https://www.hackerrank.com"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 rounded-xl font-bold text-sm transition-all"
                >
                  Open HackerRank Contest <ExternalLink size={16} />
                </a>
              )}
            </div>

            <p className="text-xs text-zinc-600 text-center pt-2">
              Scores for this round will be imported automatically after the contest ends.
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push("/dashboard")}
          className="w-full py-2.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
}

