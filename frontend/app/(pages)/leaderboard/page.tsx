"use client";

import { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  EnvelopeClosedIcon,
  InstagramLogoIcon,
  TwitterLogoIcon,
  LinkedInLogoIcon,
  SewingPinIcon,
} from "@radix-ui/react-icons";
import { subscribeToLeaderboard } from "@/lib/database";
import SiteNavbar from "@/app/Components/Navigation/DashboardNavbar";
import Footer from "@/app/Components/Footer";

// ─── Types ────────────────────────────────────────────────────────────────────

type LBEntry = { name: string; points: number };
type Row = { rank: number; name: string; points: number };

// ─── Column definitions (same as LeaderboardX) ───────────────────────────────

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "rank",
    header: () => <div className="w-[2rem] text-center">Rank</div>,
    cell: ({ getValue }) => {
      const rank = getValue<number>();
      const colorClass = rank === 1 ? "blue" : rank === 2 ? "green" : rank === 3 ? "black" : "";
      return (
        <div className={`${colorClass} w-[2rem] flex items-center h-8 text-center font-medium pl-4`}>
          {rank}
        </div>
      );
    },
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ getValue }) => (
      <div className="capitalize font-medium">{getValue<string>()}</div>
    ),
  },
  {
    accessorKey: "points",
    header: () => <div className="text-center">GC Points</div>,
    cell: ({ getValue }) => (
      <div className="text-center font-bold text-yellow-400">{getValue<number>().toLocaleString()}</div>
    ),
  },
];

// ─── Table component (same as LeaderboardX LBTable) ─────────────────────────

function LBTable({ data }: { data: Row[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  return (
    <div>
      <div className="rounded-md border border-zinc-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/80">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-zinc-700">
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-4 py-3 text-left text-zinc-400 font-medium">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="h-12 px-4 capitalize">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="h-24 text-center text-zinc-500">
                  No results found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(table.getCanPreviousPage() || table.getCanNextPage()) && (
        <div className="flex items-center justify-end gap-2 py-4">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all select-none"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-400">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all select-none"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Leaderboard Page ────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [data, setData] = useState<LBEntry[]>([]);
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Live leaderboard: first `/api/teams` response ends loading
  useEffect(() => {
    const unsub = subscribeToLeaderboard((d) => {
      setData(d);
      setLastUpdated(new Date());
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  // Sort by points desc (for rank calculation)
  const sortedData = useMemo(
    () => [...data].sort((a, b) => b.points - a.points),
    [data]
  );

  // Fuse.js fuzzy search (same as LeaderboardX)
  const fuse = useMemo(
    () => new Fuse(sortedData, { keys: ["name"], threshold: 0.4 }),
    [sortedData]
  );

  const displayData: LBEntry[] = useMemo(() => {
    if (!search.trim()) return sortedData;
    return fuse.search(search).map((r) => r.item).sort((a, b) => b.points - a.points);
  }, [search, sortedData, fuse]);

  // Add rank numbers
  const rows: Row[] = displayData.map((entry) => ({
    rank: sortedData.findIndex((e) => e.name === entry.name) + 1,
    name: entry.name,
    points: entry.points,
  }));

  return (
    <>
      <style>{`
        /* LeaderboardX rank color bars */
        #footer {
          background: hsla(223, 84%, 5%, 0.7);
          backdrop-filter: blur(2.5rem);
          -webkit-backdrop-filter: blur(2.5rem);
          box-shadow: 0 0 10px 1px rgba(0,0,0,0.25);
        }
        .footer {
          background: url(/images/footer-bg.svg);
          background-position: bottom;
          background-repeat: repeat-x;
          background-size: 70%;
          animation: bgMove 180s ease-in-out alternate infinite;
        }
        @media not all and (min-width: 768px) {
          .footer { background-size: cover; }
          #footer { backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); }
        }
        @keyframes bgMove {
          0%   { background-position: 0 0; background-size: 50%; }
          25%  { background-position: 60% -10%; background-size: 100%; }
          50%  { background-position: bottom; background-size: 150%; }
          75%  { background-position: 30% 30%; background-size: 60%; }
          100% { background-position: 100% 0; background-size: 80%; }
        }
        .blue, .green, .black { position: relative; }
        .blue::after, .green::after, .black::after {
          content: "";
          left: 0; height: 80%; bottom: 10%; width: 0.5rem;
          border-radius: 0 0.25rem 0.25rem 0;
          position: absolute;
          background: linear-gradient(90deg, #4285f4 1%, transparent);
        }
        .green::after { background: linear-gradient(90deg, #39df65 1%, transparent); }
        .black::after { background: linear-gradient(90deg, #cacaca 1%, transparent); }
      `}</style>

      <div className="min-h-screen flex flex-col bg-zinc-950 text-white">
        <SiteNavbar />
        {/* Header */}
        <div className="flex flex-col items-center py-16 gap-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gdg.svg" alt="GDG" className="mb-2 h-14 w-auto" />
          <h1 className="text-4xl font-extrabold tracking-tight">Pixtopia Leaderboard</h1>
          <p className="text-zinc-400 text-sm">
            {isLoading ? (
              "Loading teams…"
            ) : (
              <>
                Live · {data.length} teams competing
                {lastUpdated && <> · Updated {lastUpdated.toLocaleTimeString()}</>}
              </>
            )}
          </p>
        </div>

        {/* Leaderboard (w-4/5 centred — same as LeaderboardX) */}
        <main className="flex flex-col items-center flex-1 pb-16">
          <div id="leaderboard" className="my-4 flex w-4/5 flex-col gap-4 max-md:w-[92vw]">
            {/* Search box */}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={isLoading}
              className="h-12 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 text-lg text-white placeholder:text-zinc-500 shadow-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              type="text"
              placeholder="Search team…"
            />
            {isLoading ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-md border border-zinc-700 bg-zinc-900/50 py-16 text-zinc-400">
                <div
                  className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500"
                  aria-hidden
                />
                <p className="text-sm">Fetching leaderboard…</p>
              </div>
            ) : (
              <LBTable data={rows} />
            )}
          </div>
        </main>

        {/* Footer — exact LeaderboardX style */}
        <Footer />
      </div>
    </>
  );
}
