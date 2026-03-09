import { describe, it, expect, vi } from 'vitest';
import { POST } from '../app/api/rounds/3/hint/route';
import { NextRequest } from 'next/server';

// Mock process.env
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'mock-user-id' } },
        error: null
      })
    },
    from: vi.fn().mockImplementation((table) => {
      if (table === 'teams') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'mock-team-id', points: 500 },
                error: null
              })
            })
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        };
      }
      if (table === 'team_round_progress') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { team_id: 'mock-team-id', round_id: '3', hints_used: 0, points_spent: 0, is_completed: false },
                  error: null
                })
              })
            })
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null })
            })
          })
        };
      }
      if (table === 'round_3_questions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: '1', order: 1, hints: ['Hint 1', 'Hint 2'] },
                error: null
              })
            })
          })
        };
      }
      return {
        select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })
      };
    })
  })
}));

describe('POST /api/rounds/3/hint', () => {
  it('should return 200 and a hint if team has enough points', async () => {
    // This will fail because the file doesn't exist yet
    const request = new NextRequest('http://localhost:3000/api/rounds/3/hint', {
      method: 'POST',
      body: JSON.stringify({ questionOrder: 1 })
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
