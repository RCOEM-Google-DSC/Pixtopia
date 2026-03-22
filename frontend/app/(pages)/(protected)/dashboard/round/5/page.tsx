"use client";

/* ──────────────────────────────────────────────────────────
 *  Change this URL to redirect participants to the game
 * ────────────────────────────────────────────────────────── */
const ROUND_5_URL = "https://game.gdgrbu.tech";

import { useEffect } from "react";

export default function Round5Page() {
  useEffect(() => {
    window.location.href = ROUND_5_URL;
  }, []);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center text-white">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-zinc-500 text-sm tracking-wide">Redirecting…</p>
      </div>
    </div>
  );
}
