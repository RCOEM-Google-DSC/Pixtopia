"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { useTeam } from "@/lib/useTeam";
import {
  subscribeToGameState, startRound, endRound,
  GameState, RoundStatus,
} from "@/lib/database";
import {
  Lock, CheckCircle, Play, Trophy, Zap, Image,
  LetterText, Gamepad2, ExternalLink, RefreshCw
} from "lucide-react";

const ROUNDS = [
  {
    id: "1",
    title: "Aptitude Round",
    subtitle: "15 Pixar MCQ Questions",
    value: "1500 GC",
    time: "30 min",
    icon: Zap,
    color: "indigo",
  },
  {
    id: "2",
    title: "Competitive Programming",
    subtitle: "HackerRank Contest",
    value: "2300 GC",
    time: "Open",
    icon: ExternalLink,
    color: "cyan",
  },
  {
    id: "3",
    title: "Pick the Image",
    subtitle: "10 Questions · 30 sec each",
    value: "2000 GC",
    time: "30 sec/Q",
    icon: Image,
    color: "emerald",
  },
  {
    id: "4",
    title: "4 Images, 1 Word",
    subtitle: "10 Questions · 1 min each",
    value: "2000 GC",
    time: "1 min/Q",
    icon: LetterText,
    color: "amber",
  },
  {
    id: "5",
    title: "Final Game",
    subtitle: "Coming soon…",
    value: "TBD",
    time: "TBD",
    icon: Gamepad2,
    color: "rose",
  },
];

const COLOR_MAP: Record<string, { border: string; glow: string; badge: string; btn: string }> = {
  indigo: {
    border: "border-indigo-500/40",
    glow: "shadow-indigo-500/20",
    badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
    btn: "from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400",
  },
  cyan: {
    border: "border-cyan-500/40",
    glow: "shadow-cyan-500/20",
    badge: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    btn: "from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400",
  },
  emerald: {
    border: "border-emerald-500/40",
    glow: "shadow-emerald-500/20",
    badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    btn: "from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400",
  },
  amber: {
    border: "border-amber-500/40",
    glow: "shadow-amber-500/20",
    badge: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    btn: "from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400",
  },
  rose: {
    border: "border-rose-500/40",
    glow: "shadow-rose-500/20",
    badge: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    btn: "from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400",
  },
};

function getRoundScore(submission: Record<string, unknown> | null, roundId: string) {
  if (!submission) return null;
  const r = submission[`round${roundId}`] as { score?: number } | undefined;
  return r?.score ?? null;
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { team, submission } = useTeam();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{
    success?: boolean;
    summary?: { totalTeams: number; matchedTeams: number; unmatchedTeams: number; totalPointsAdded: number };
    error?: string;
  } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsub = subscribeToGameState(setGameState);
    return () => unsub();
  }, []);

  const getRoundStatus = (id: string): RoundStatus => {
    return gameState?.round_statuses?.[id]?.status ?? "locked";
  };

  const handleScrapeHackerrank = async () => {
    if (scraping) return;
    setScraping(true);
    setScrapeResult(null);
    try {
      const res = await fetch("/api/scrape-hackerrank", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setScrapeResult({ success: true, summary: data.summary });
      } else {
        setScrapeResult({ success: false, error: data.error || "Failed to scrape scores" });
      }
    } catch (err) {
      setScrapeResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setScraping(false);
    }
  };

  const handleEnterRound = (id: string) => {
    router.push(`/dashboard/round/${id}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-zinc-800 bg-zinc-900/50">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/50 via-zinc-900 to-purple-950/30" />
        <div className="relative max-w-6xl mx-auto px-6 py-12">
          <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            Welcome, {team?.team_name ?? user?.email?.split("@")[0] ?? "Team"} 👋
          </h1>
          <p className="text-zinc-400 mt-2">
            Total Score:{" "}
            <span className="text-yellow-400 font-bold">{team?.points ?? 0} GC</span>
          </p>
          {isAdmin && (
            <div className="mt-3">
              <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-3 py-1 rounded-full">
                🛡 Admin Mode — You can start and end rounds
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Round Cards */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {ROUNDS.map((round) => {
            const status = getRoundStatus(round.id);
            const colors = COLOR_MAP[round.color];
            const Icon = round.icon;
            const roundScore = getRoundScore(submission as Record<string, unknown> | null, round.id);
            const hasSubmitted = roundScore !== null && round.id !== "2" && round.id !== "5";

            return (
              <div
                key={round.id}
                className={`relative bg-zinc-900/60 backdrop-blur-sm border rounded-2xl p-6 flex flex-col gap-4 transition-all duration-300
                  ${status === "active" ? `${colors.border} shadow-lg ${colors.glow}` : "border-zinc-800"}
                  ${status === "locked" ? "opacity-70" : ""}
                `}
              >
                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-1.5 text-xs font-medium border px-2.5 py-1 rounded-full ${colors.badge}`}>
                    <Icon size={12} />
                    {round.value}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium
                    ${status === "active" ? "bg-green-500/15 text-green-400 border border-green-500/30" : ""}
                    ${status === "locked" ? "bg-zinc-800 text-zinc-500" : ""}
                    ${status === "completed" ? "bg-zinc-700/50 text-zinc-400" : ""}
                  `}>
                    {status === "active" && "● Active"}
                    {status === "locked" && "🔒 Locked"}
                    {status === "completed" && "✓ Ended"}
                  </span>
                </div>

                {/* Content */}
                <div>
                  <h2 className="text-lg font-bold text-white">Round {round.id} — {round.title}</h2>
                  <p className="text-zinc-400 text-sm mt-1">{round.subtitle}</p>
                  <p className="text-zinc-500 text-xs mt-1">⏱ {round.time}</p>
                </div>

                {/* Score if submitted */}
                {hasSubmitted && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-sm text-green-400 flex items-center gap-2">
                    <CheckCircle size={14} />
                    Submitted — {roundScore} GC earned
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-col gap-2 mt-auto">
                  {/* Participant enter button */}
                  {!isAdmin && (
                    <button
                      disabled={status !== "active" || hasSubmitted}
                      onClick={() => handleEnterRound(round.id)}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all
                        ${status === "active" && !hasSubmitted
                          ? `bg-gradient-to-r ${colors.btn} text-white`
                          : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                        }`}
                    >
                      {hasSubmitted ? "✓ Completed" : status === "active" ? "Enter Round →" : status === "completed" ? "Round Over" : "🔒 Locked"}
                    </button>
                  )}

                  {/* Admin controls */}
                  {isAdmin && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          disabled={status === "active" || status === "completed"}
                          onClick={() => startRound(round.id)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white transition-all flex items-center justify-center gap-1"
                        >
                          <Play size={12} /> Start
                        </button>
                        <button
                          disabled={status !== "active"}
                          onClick={() => endRound(round.id)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-red-700 hover:bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white transition-all"
                        >
                          End Round
                        </button>
                        <button
                          onClick={() => handleEnterRound(round.id)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-zinc-700 hover:bg-zinc-600 text-white transition-all"
                        >
                          Preview
                        </button>
                      </div>

                      {/* Scrape HackerRank button — only for Round 2 */}
                      {round.id === "2" && (
                        <div className="space-y-2">
                          <button
                            disabled={scraping}
                            onClick={handleScrapeHackerrank}
                            className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2
                              ${scraping
                                ? "bg-cyan-800 text-cyan-300 cursor-wait"
                                : "bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 text-white"
                              }`}
                          >
                            <RefreshCw size={14} className={scraping ? "animate-spin" : ""} />
                            {scraping ? "Scraping HackerRank…" : "🔄 Scrape HackerRank Scores"}
                          </button>

                          {/* Scrape result feedback */}
                          {scrapeResult && (
                            <div
                              className={`rounded-xl px-4 py-3 text-xs border ${
                                scrapeResult.success
                                  ? "bg-green-500/10 border-green-500/30 text-green-300"
                                  : "bg-red-500/10 border-red-500/30 text-red-300"
                              }`}
                            >
                              {scrapeResult.success && scrapeResult.summary ? (
                                <div className="space-y-1">
                                  <p className="font-semibold">✅ Scores imported successfully!</p>
                                  <p>Teams matched: {scrapeResult.summary.matchedTeams}/{scrapeResult.summary.totalTeams}</p>
                                  <p>Total points added: <span className="text-yellow-400 font-bold">{scrapeResult.summary.totalPointsAdded}</span></p>
                                  {scrapeResult.summary.unmatchedTeams > 0 && (
                                    <p className="text-amber-400">⚠ {scrapeResult.summary.unmatchedTeams} team(s) had no matching HackerRank username</p>
                                  )}
                                </div>
                              ) : (
                                <p>❌ {scrapeResult.error}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Leaderboard teaser */}
        <div className="mt-10 flex justify-center">
          <button
            onClick={() => router.push("/leaderboard")}
            className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-all border border-zinc-700"
          >
            <Trophy size={16} className="text-yellow-400" />
            View Live Leaderboard
          </button>
        </div>
      </div>
    </div>
  );
}
