import React from "react";
import SiteNavbar from "@/app/Components/Navigation/DashboardNavbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen w-full relative">
      <SiteNavbar />
      <main className="flex-1 w-full relative flex flex-col">
        {children}
      </main>
    </div>
  );
}



