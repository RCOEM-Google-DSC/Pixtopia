"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { subscribeToGameState } from "@/lib/database";
import { createClient } from "@/lib/supabase/client";
import { ExternalLink, Lock, AlertCircle } from "lucide-react";
import SiteNavbar from "@/app/Components/Navigation/DashboardNavbar";

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
    { label: "Easy", count: 3, each: 200, color: "text-[#00FA9A]" },
    { label: "Medium", count: 2, each: 400, color: "text-[#FF5F1F]" },
    { label: "Hard", count: 2, each: 900, color: "text-[#ED1C24]" },
  ];

  const total = scores.reduce((sum, s) => sum + s.each * s.count, 0);

  // ── Locked state ──────────────────────────────────────────────────────────
  if (status === "locked") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <SiteNavbar />
        <div className="text-center">
          <Lock size={36} className="text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold tracking-wide">ROUND 2 LOCKED</h2>
          <p className="text-zinc-500 text-sm mt-2">Waiting for the admin to start this round.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 px-5 py-2.5 border border-zinc-700 hover:border-zinc-500 rounded-lg text-sm tracking-wide transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Completed state ───────────────────────────────────────────────────────
  if (status === "completed") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <SiteNavbar />
        <div className="text-center">
          <AlertCircle size={36} className="text-zinc-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold tracking-wide">ROUND 2 ENDED</h2>
          <p className="text-zinc-500 text-sm mt-2">Submissions are closed.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 px-5 py-2.5 border border-zinc-700 hover:border-zinc-500 rounded-lg text-sm tracking-wide transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Active state ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <SiteNavbar />
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
            Round 2
          </span>
          <h1 className="text-2xl font-bold tracking-wide">COMPETITIVE PROGRAMMING</h1>
          <p className="text-zinc-500 text-sm">
            Solve Pixar-themed coding problems on HackerRank. Scores are tracked automatically.
          </p>
        </div>

        {/* Score breakdown */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4">
            Score Breakdown
          </h2>
          {scores.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between p-4 rounded-lg border border-zinc-800 bg-zinc-900/40"
            >
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

          {/* Total */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-700 bg-zinc-900/60">
            <span className="font-bold text-white">Total</span>
            <span className="font-black text-amber-400 text-lg">{total} GC</span>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center space-y-4">
          <a
            href={contestUrl || "https://www.hackerrank.com"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-zinc-200 text-black px-8 py-3 text-sm tracking-widest font-bold uppercase rounded-lg transition-all"
          >
            Open HackerRank Contest <ExternalLink size={16} />
          </a>
          <p className="text-xs text-zinc-600">
            Scores for this round will be imported automatically after the contest ends.
          </p>
        </div>

        {/* Back button */}
        <div className="text-center">
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-2 mb-8 border border-zinc-700 hover:border-zinc-500 text-white px-8 py-3 text-sm tracking-[0.2em] uppercase rounded-lg transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
