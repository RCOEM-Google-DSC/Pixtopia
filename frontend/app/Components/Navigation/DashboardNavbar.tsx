"use client";

import React from "react";
import Link from "next/link";
import { useTeam } from "@/lib/useTeam";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const DashboardNavbar = () => {
  const { team, loading } = useTeam();
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <nav className="w-full h-20 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 text-white flex items-center justify-between px-8 sticky top-0 z-50">
      <div className="flex items-center gap-8">
        <Link href="/dashboard">
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            Pixtopia
          </h1>
        </Link>
        
        {loading ? (
          <div className="flex flex-col gap-1">
            <Skeleton className="h-4 w-24 bg-zinc-800" />
            <Skeleton className="h-3 w-32 bg-zinc-800" />
          </div>
        ) : team ? (
          <div className="hidden sm:block">
            <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              {team.team_name}
            </h2>
            <p className="text-xs text-zinc-500">GDG Pixar Competition</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end mr-2">
          <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-tighter">Current Balance</span>
          {loading ? (
            <Skeleton className="h-6 w-16 bg-zinc-800" />
          ) : (
            <span className="text-xl font-black text-indigo-400 tabular-nums">
              {team?.points ?? 0}
            </span>
          )}
        </div>

        <div className="h-8 w-[1px] bg-zinc-800 hidden sm:block" />

        <div className="flex items-center gap-4">
          <Link
            href="/leaderboard"
            className="text-sm text-zinc-400 hover:text-white transition-colors hidden md:block"
          >
            Leaderboard
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            Logout
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default DashboardNavbar;
