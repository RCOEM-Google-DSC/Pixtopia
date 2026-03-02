"use client";

import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";

const Navbar = () => {
  const { user, isAdmin, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <nav className="w-full h-16 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 text-white flex items-center justify-between px-6 sticky top-0 z-50">
      <Link href={user ? "/dashboard" : "/"}>
        <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
          Pixtopia
        </h1>
      </Link>

      <div className="flex items-center gap-4">
        {/* Leaderboard is always visible */}
        <Link
          href="/leaderboard"
          className="text-sm text-zinc-300 hover:text-white transition-colors"
        >
          Leaderboard
        </Link>

        {user ? (
          <>
            <Link
              href="/dashboard"
              className="text-sm text-zinc-300 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            {isAdmin && (
              <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-full">
                Admin
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-sm bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors"
            >
              Logout
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="text-sm bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg transition-colors"
          >
            Login
          </Link>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
