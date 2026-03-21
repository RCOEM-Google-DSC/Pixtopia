"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";

const SiteNavbar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  // Build contextual links based on current page
  const navLinks = useMemo(() => {
    const onDashboard = pathname?.startsWith("/dashboard");
    const onLeaderboard = pathname?.startsWith("/leaderboard");

    if (onDashboard) {
      return [
        { label: "HOME", href: "/" },
        { label: "LEADERBOARD", href: "/leaderboard" },
      ];
    }
    if (onLeaderboard) {
      return [
        { label: "HOME", href: "/" },
        { label: "DASHBOARD", href: "/dashboard" },
      ];
    }
    // Home page (or any other page)
    return [
      { label: "DASHBOARD", href: "/dashboard" },
      { label: "LEADERBOARD", href: "/leaderboard" },
    ];
  }, [pathname]);

  return (
    <nav className="w-full absolute top-0 left-0 z-50">
      <div className="flex items-center justify-end px-8 md:px-12 h-14">
        <div className="flex items-center gap-10">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[13px] font-medium tracking-[0.2em] text-zinc-400 hover:text-white transition-colors duration-300 py-4"
            >
              {link.label}
            </Link>
          ))}

          {/* Login / Logout */}
          {user ? (
            <button
              onClick={handleLogout}
              className="text-[13px] font-medium tracking-[0.2em] text-zinc-400 hover:text-white transition-colors duration-300 py-4 cursor-pointer bg-transparent border-none"
            >
              LOGOUT
            </button>
          ) : (
            <Link
              href="/login"
              className="text-[13px] font-medium tracking-[0.2em] text-zinc-400 hover:text-white transition-colors duration-300 py-4"
            >
              LOGIN
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default SiteNavbar;

