"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { useTeam } from "@/lib/useTeam";
import {
  subscribeToGameState, startRound, endRound,
  GameState, RoundStatus,
} from "@/lib/database";
import { RefreshCw } from "lucide-react";
import svgPaths from "@/lib/cardSvgPaths";

/* ─── card image paths (from card repo assets) ─── */
const imgPngwingCom4 = "/cards/card-1.png";
const imgPngwingCom142 = "/cards/card-2.png";
const imgPngwingCom23 = "/cards/card-3.png";
const imgPngwingCom20260304T2308007452 = "/cards/card-4.png";
const imgPngwingCom20260304T2316341382 = "/cards/card-5.png";

/* ─── round metadata ─── */
const ROUNDS = [
  { id: "1", color: "#698cc0", textColor: "white", btnBg: "bg-white", btnText: "text-[#698cc0]" },
  { id: "2", color: "#9cd5fd", textColor: "black", btnBg: "bg-black", btnText: "text-white" },
  { id: "3", color: "#f0a152", textColor: "black", btnBg: "bg-black", btnText: "text-white" },
  { id: "4", color: "#912525", textColor: "white", btnBg: "bg-white", btnText: "text-[#912525]" },
  { id: "5", color: "#8c9530", textColor: "black", btnBg: "bg-black", btnText: "text-white" },
];

function getRoundScore(submission: Record<string, unknown> | null, roundId: string) {
  if (!submission) return null;
  const r = submission[`round${roundId}`] as { score?: number } | undefined;
  return r?.score ?? null;
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { team, submission } = useTeam();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  const [scraping, setScraping] = useState(false);
  const [cardScale, setCardScale] = useState(1);
  const cardWrapperRef = useRef<HTMLDivElement>(null);
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

  /* ─── Dynamic scale to fit cards in viewport ─── */
  const recalcScale = useCallback(() => {
    if (!cardWrapperRef.current) return;
    const wrapperRect = cardWrapperRef.current.getBoundingClientRect();
    const availableHeight = window.innerHeight - wrapperRect.top - 60;
    const availableWidth = window.innerWidth - 40; // 20px padding each side
    const cardHeight = 713;
    // Max width: when one card is expanded = 4*236 + 1*422 + 4*11(gap) + 183(left overflow) + 113(right overflow)
    const maxCardWidth = 1706;
    const heightScale = availableHeight / cardHeight;
    const widthScale = availableWidth / maxCardWidth;
    const scale = Math.min(1, heightScale, widthScale);
    setCardScale(Math.max(0.35, scale));
  }, []);

  useEffect(() => {
    recalcScale();
    window.addEventListener('resize', recalcScale);
    return () => window.removeEventListener('resize', recalcScale);
  }, [recalcScale]);

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
    } catch {
      setScrapeResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setScraping(false);
    }
  };

  const handleEnterRound = (id: string) => {
    router.push(`/dashboard/round/${id}`);
  };

  const toggleRound = (roundNumber: number) => {
    setExpandedRound((prev) => (prev === roundNumber ? null : roundNumber));
  };

  /* ─── Render individual round card ─── */
  const renderRoundCard = (roundIdx: number) => {
    const round = ROUNDS[roundIdx];
    const roundNum = roundIdx + 1;
    const isExpanded = expandedRound === roundNum;
    const status = getRoundStatus(round.id);
    const roundScore = getRoundScore(submission as Record<string, unknown> | null, round.id);
    const hasSubmitted = roundScore !== null && round.id !== "2" && round.id !== "5";

    return (
      <div
        key={round.id}
        className="relative rounded-[20px] transition-all duration-500 ease-in-out overflow-visible cursor-pointer flex-shrink-0"
        style={{
          backgroundColor: round.color,
          width: isExpanded ? '422px' : '236px',
          height: '713px',
        }}
        onMouseEnter={() => toggleRound(roundNum)}
      >
        {/* ─── SVG labels per round ─── */}
        {roundNum === 1 && (
          <div className="absolute h-[187px] left-[13px] top-[12px] w-[210.582px] pointer-events-none z-20">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 210.582 187">
              <g id="Group 513254">
                <path d={svgPaths.p3471c700} fill="white" id="1" />
                <g id="ONE">
                  <path d={svgPaths.p36bdf200} fill="white" />
                  <path d={svgPaths.p23efa180} fill="white" />
                  <path d={svgPaths.p1e0a0480} fill="white" />
                </g>
                <g id="ROUND 2">
                  <path d={svgPaths.p2dd71b00} fill="white" />
                  <path d={svgPaths.p7b36100} fill="white" />
                  <path d={svgPaths.p14e8fa00} fill="white" />
                  <path d={svgPaths.p82b8800} fill="white" />
                  <path d={svgPaths.p16ee2f0} fill="white" />
                </g>
              </g>
            </svg>
          </div>
        )}

        {roundNum === 2 && (
          <>
            <div className="absolute h-[176px] left-[11px] top-[523px] w-[211px] pointer-events-none z-20">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 211 176">
                <g id="Group 513256">
                  <g id="ROUND 2">
                    <path d={svgPaths.p30120900} fill="black" />
                    <path d={svgPaths.p108b2f70} fill="black" />
                    <path d={svgPaths.p17ff3b80} fill="black" />
                    <path d={svgPaths.p2ff15c00} fill="black" />
                    <path d={svgPaths.p18bdec00} fill="black" />
                  </g>
                  <path d={svgPaths.p284bc280} fill="black" id="2" />
                </g>
              </svg>
            </div>
            <div className="absolute h-[34px] left-[11px] top-[577px] w-[100px] pointer-events-none z-20" data-name="TWO">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 100 34">
                <g id="TWO">
                  <path d={svgPaths.p1ad16e00} fill="black" />
                  <path d={svgPaths.p538d580} fill="black" />
                  <path d={svgPaths.p1a285180} fill="black" />
                </g>
              </svg>
            </div>
          </>
        )}

        {roundNum === 3 && (
          <>
            <div className="absolute h-[165px] left-[11px] top-[11px] w-[210.582px] pointer-events-none z-20">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 210.582 165">
                <g id="Group 513258">
                  <g id="ROUND 3">
                    <path d={svgPaths.p2dd71b00} fill="black" />
                    <path d={svgPaths.p7b36100} fill="black" />
                    <path d={svgPaths.p14e8fa00} fill="black" />
                    <path d={svgPaths.p82b8800} fill="black" />
                    <path d={svgPaths.p16ee2f0} fill="black" />
                  </g>
                  <path d={svgPaths.p6ab000} fill="black" id="3" />
                </g>
              </svg>
            </div>
            <div className="absolute h-[34px] left-[11px] top-[109px] w-[129px] pointer-events-none z-20" data-name="THREE">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 129 34">
                <g id="THREE">
                  <path d={svgPaths.p3a604c00} fill="black" />
                  <path d={svgPaths.p253f4f00} fill="black" />
                  <path d={svgPaths.pb2b3500} fill="black" />
                  <path d={svgPaths.p25e30600} fill="black" />
                  <path d={svgPaths.p37e44f00} fill="black" />
                </g>
              </svg>
            </div>
          </>
        )}

        {roundNum === 4 && (
          <>
            <div className="absolute h-[184px] left-[10px] top-[516px] w-[216px] pointer-events-none z-20">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 216 184">
                <g id="Group 513260">
                  <g id="ROUND 4">
                    <path d={svgPaths.p28575400} fill="white" />
                    <path d={svgPaths.p35b2bc80} fill="white" />
                    <path d={svgPaths.pd7cad00} fill="white" />
                    <path d={svgPaths.p114dfaf0} fill="white" />
                    <path d={svgPaths.p3f828200} fill="white" />
                  </g>
                  <path d={svgPaths.p3f44f400} fill="white" id="4" />
                </g>
              </svg>
            </div>
            <div className="absolute h-[29px] left-[10px] top-[581px] w-[98px] pointer-events-none z-20" data-name="FOUR">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 98 29">
                <g id="FOUR">
                  <path d={svgPaths.p3388c180} fill="white" />
                  <path d={svgPaths.p4b47800} fill="white" />
                  <path d={svgPaths.p15b5f00} fill="white" />
                  <path d={svgPaths.p3cd4d240} fill="white" />
                </g>
              </svg>
            </div>
          </>
        )}

        {roundNum === 5 && (
          <>
            <div className="absolute h-[193.688px] left-[12px] top-[12px] w-[211.438px] pointer-events-none z-20">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 211.438 193.688">
                <g id="Group 513262">
                  <g id="ROUND 5">
                    <path d={svgPaths.p2dd71b00} fill="black" />
                    <path d={svgPaths.p7b36100} fill="black" />
                    <path d={svgPaths.p14e8fa00} fill="black" />
                    <path d={svgPaths.p82b8800} fill="black" />
                    <path d={svgPaths.p16ee2f0} fill="black" />
                  </g>
                  <path d={svgPaths.p1b217600} fill="black" id="5" />
                </g>
              </svg>
            </div>
            <div className="absolute h-[34px] left-[12px] top-[109px] w-[93px] pointer-events-none z-20" data-name="FIVE">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 93 34">
                <g id="FIVE">
                  <path d={svgPaths.p310d100} fill="black" />
                  <path d={svgPaths.p34ed5000} fill="black" />
                  <path d={svgPaths.p4cea800} fill="black" />
                  <path d={svgPaths.p389b3690} fill="black" />
                </g>
              </svg>
            </div>
          </>
        )}

        {/* ─── Buttons (shown on expand) ─── */}
        {isExpanded && (
          <div
            className="absolute z-20 pointer-events-auto opacity-0 flex flex-col items-center gap-3"
            style={{
              animation: 'cardFadeIn 0.3s ease-in-out 0.5s forwards',
              top: '50%',
              right: '60px',
              transform: 'translateY(-50%)',
            }}
          >
            {/* Normal user: only "Start Now" */}
            {!isAdmin && (
              <button
                disabled={status !== "active" || hasSubmitted}
                onClick={(e) => {
                  e.stopPropagation();
                  if (round.id === "4") {
                    router.push(`/dashboard/round/4/part1`);
                  } else {
                    handleEnterRound(round.id);
                  }
                }}
                className={`${round.btnBg} ${round.btnText} px-8 py-3 rounded-full font-bold text-lg hover:bg-opacity-90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap`}
              >
                {hasSubmitted ? "DONE" : status === "active" ? "START" : status === "completed" ? "ENDED" : "LOCKED"}
              </button>
            )}

            {/* Admin: stacked buttons — Start, End, Preview */}
            {isAdmin && (
              <>
                <button
                  disabled={status === "active" || status === "completed"}
                  onClick={(e) => {
                    e.stopPropagation();
                    startRound(round.id);
                  }}
                  className={`${round.btnBg} ${round.btnText} px-8 py-3 rounded-full font-bold text-lg hover:bg-opacity-90 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap min-w-[160px]`}
                >
                  START
                </button>
                <button
                  disabled={status !== "active"}
                  onClick={(e) => {
                    e.stopPropagation();
                    endRound(round.id);
                  }}
                  className={`${round.btnBg} ${round.btnText} px-8 py-3 rounded-full font-bold text-lg hover:bg-opacity-90 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap min-w-[160px]`}
                >
                  END ROUND
                </button>
                {round.id !== "4" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEnterRound(round.id);
                    }}
                    className={`${round.btnBg} ${round.btnText} px-8 py-3 rounded-full font-bold text-lg hover:bg-opacity-90 transition-all duration-300 whitespace-nowrap min-w-[160px]`}
                  >
                    PREVIEW
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/dashboard/round/4/part1`);
                    }}
                    className={`${round.btnBg} ${round.btnText} px-8 py-3 rounded-full font-bold text-lg hover:bg-opacity-90 transition-all duration-300 whitespace-nowrap min-w-[160px]`}
                  >
                    PREVIEW
                  </button>
                )}
                {/* Scrape HackerRank for Round 2 */}
                {round.id === "2" && (
                  <button
                    disabled={scraping}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleScrapeHackerrank();
                    }}
                    className={`${round.btnBg} ${round.btnText} px-6 py-3 rounded-full font-bold text-lg hover:bg-opacity-90 transition-all duration-300 whitespace-nowrap min-w-[160px] flex items-center justify-center gap-2`}
                  >
                    <RefreshCw size={14} className={scraping ? "animate-spin" : ""} />
                    {scraping ? "SCRAPING" : "SCRAPE HR"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── Character images per round ─── */}
        {roundNum === 1 && (
          <div className="absolute flex h-[516.695px] items-center justify-center left-[-183px] top-[199px] w-[422.257px] pointer-events-none">
            <div className="flex-none rotate-[-0.39deg]">
              <div className="h-[513.85px] relative w-[418.761px]">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img alt="" className="absolute h-[115.5%] left-[0.89%] max-w-none top-[-0.03%] w-[158.54%] mix-blend-multiply" src={imgPngwingCom4} />
                </div>
              </div>
            </div>
          </div>
        )}

        {roundNum === 2 && (
          <div className="absolute h-[567px] left-0 top-0 w-[245px] pointer-events-none">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img alt="" className="absolute h-[103.75%] left-[-45.89%] max-w-none top-[-3.74%] w-[145.89%]" src={imgPngwingCom142} />
            </div>
          </div>
        )}

        {roundNum === 3 && (
          <div className="absolute h-[624px] left-0 top-[89px] w-[236px] pointer-events-none">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img alt="" className="absolute h-[138.78%] left-[-47.23%] max-w-none top-0 w-[216.83%]" src={imgPngwingCom23} />
            </div>
          </div>
        )}

        {roundNum === 4 && (
          <div className="absolute h-[487px] left-0 top-0 w-[236px] pointer-events-none">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img alt="" className="absolute h-[100.08%] left-[-13.56%] max-w-none top-[-0.04%] w-[126.69%]" src={imgPngwingCom20260304T2308007452} />
            </div>
          </div>
        )}

        {roundNum === 5 && (
          <div className="absolute flex h-[332px] items-center justify-center left-0 top-[321px] w-[349px] pointer-events-none">
            <div className="-scale-y-100 flex-none rotate-180">
              <div className="h-[332px] relative w-[349px]">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img alt="" className="absolute h-[100.07%] left-[-8.3%] max-w-none top-[-0.04%] w-[126.74%]" src={imgPngwingCom20260304T2316341382} />
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Score badge if submitted */}
        {hasSubmitted && (
          <div className="absolute top-4 right-4 z-20 pointer-events-none">
            <span className="text-xs px-3 py-1.5 rounded-full font-bold bg-green-500/30 text-green-200 border border-green-400/40 backdrop-blur-sm">
              {roundScore} GC
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen relative text-white overflow-hidden bg-black" style={{ fontFamily: "'Brandon Grotesque', sans-serif" }}>
      {/* ─── Content ─── */}
      <div className="relative z-10">
        {/* Team Name */}
        <div className="px-8 md:px-12 pt-16 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1
              className="text-[2rem] md:text-[2.8rem] font-bold uppercase tracking-[0.15em] text-white leading-none"
              style={{ letterSpacing: '0.15em' }}
            >
              {team?.team_name ?? user?.email?.split("@")[0] ?? "Team"}
            </h1>
            {isAdmin && (
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 border border-zinc-700 px-3 py-1 rounded-full">
                Admin
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 block">Score</span>
            <span className="text-2xl font-bold text-white tabular-nums">{team?.points ?? 0}</span>
          </div>
        </div>

        {/* ─── Card Rounds ─── */}
        <div className="w-full px-5 py-10">
          {/* Scrape result toast */}
          {scrapeResult && (
            <div
              className={`mb-6 rounded-xl px-4 py-3 text-sm border backdrop-blur-sm ${
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

          <div ref={cardWrapperRef} className="flex justify-center overflow-visible" style={{ height: `${713 * cardScale + 20}px` }}>
            <div
              className="flex gap-[11px] items-start justify-center"
              style={{
                transform: `scale(${cardScale})`,
                transformOrigin: 'top center',
              }}
              onMouseLeave={() => setExpandedRound(null)}
            >
              {ROUNDS.map((_, idx) => renderRoundCard(idx))}
            </div>
          </div>

        </div>
      </div>

      {/* ─── Keyframe animation for fadeIn ─── */}
      <style jsx>{`
        @keyframes cardFadeIn {
          from {
            opacity: 0;
            transform: translateY(-50%) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(-50%) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
