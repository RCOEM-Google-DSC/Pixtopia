import React from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen w-full relative">
      <main className="flex-1 w-full relative flex flex-col">
        {children}
      </main>
    </div>
  );
}



