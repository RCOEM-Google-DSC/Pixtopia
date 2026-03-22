"use client";

import React from "react";
import { usePathname } from "next/navigation";
import SiteNavbar from "@/app/Components/Navigation/DashboardNavbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isRoundPage = pathname?.startsWith("/dashboard/round/");

  return (
    <div className="flex flex-col min-h-screen w-full relative">
      {!isRoundPage && <SiteNavbar />}
      <main className="flex-1 w-full relative flex flex-col">
        {children}
      </main>
    </div>
  );
}
