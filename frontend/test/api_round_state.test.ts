import { describe, it, expect, vi } from 'vitest';
import { GET } from '../app/api/rounds/3/state/route';
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
          })
        };
      }
      if (table === 'round_3_questions') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { id: '1', order: 1, question: 'Q1', image_urls: [], correct_index: 0, hints: [], points: 100 }
              ],
              error: null
            })
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
          })
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })
          })
        })
      };
    })
  })
}));

describe('GET /api/rounds/3/state', () => {
  it('should return 200 with round state and team balance', async () => {
    const request = new NextRequest('http://localhost:3000/api/rounds/3/state');
    const response = await GET(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('questions');
    expect(data).toHaveProperty('teamProgress');
  });
});
