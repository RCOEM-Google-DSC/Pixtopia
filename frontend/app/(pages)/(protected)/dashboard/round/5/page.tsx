"use client";

import { useRouter } from "next/navigation";
import { Gamepad2 } from "lucide-react";

export default function Round5Page() {
  const router = useRouter();

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-zinc-950 flex items-center justify-center text-white px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="w-24 h-24 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto">
          <Gamepad2 size={40} className="text-rose-400" />
        </div>
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">
          Round 5 — Final Game
        </h1>
        <p className="text-zinc-400">
          This round is currently being developed. Stay tuned — it&apos;s going to be epic! 🎬
        </p>
        <div className="inline-block bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm px-4 py-2 rounded-full">
          🚧 Coming Soon
        </div>
        <div>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-all"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
