import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../app/api/rounds/4/hint/route";
import { NextRequest } from "next/server";

// Mock Supabase
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "mock-user-id" } },
        error: null,
      }),
    },
  }),
  createAdminClient: vi.fn().mockImplementation(() => {
    const teamsTable = {
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "mock-team-id", points: 500 },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };

    const questionsTable = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              { id: 100, order: 1, answer: "GHOST", points: 100 },
              { id: 99, order: 1, answer: "OLD", points: 50 },
            ],
            error: null,
          }),
        }),
      }),
    };

    const submissionsTable = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              team_id: "mock-team-id",
              round4: { q1_hints_revealed: [0], points_spent: 10 },
            },
            error: null,
          }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    return {
      from: vi.fn().mockImplementation((table) => {
        if (table === "teams") return teamsTable;
        if (table === "questions") return questionsTable;
        if (table === "submissions") return submissionsTable;
        return {};
      }),
    };
  }),
}));

describe("POST /api/rounds/4/hint", () => {
  it("should return 200 and a new hint index", async () => {
    const request = new NextRequest("http://localhost:3000/api/rounds/4/hint", {
      method: "POST",
      body: JSON.stringify({ currentAnswer: "M......", questionOrder: 1 }), // 'M' is at index 0
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();

    // Global hints count = 1 ([0]), so next hint is the 2nd hint -> cost 110
    expect(data.cost).toBe(110);
    // Revealed index should be one of [1..6] since 0 is already in hints_revealed (for McQueen)
    expect([1, 2, 3, 4, 5, 6]).toContain(data.revealedIndex);
  });
});
