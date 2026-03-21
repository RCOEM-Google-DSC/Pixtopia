import { describe, it, expect, vi } from 'vitest';
import { POST } from '../app/api/rounds/4/submit/route';
import { NextRequest } from 'next/server';

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'mock-user-id' } },
        error: null
      })
    }
  }),
  createAdminClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockImplementation((table) => {
      if (table === 'teams') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
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
      if (table === 'questions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: '1', order: 1, answer: 'GHOST', points: 100 },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'submissions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { team_id: 'mock-team-id', round4: { hints_revealed: [], points_spent: 0 } },
                error: null
              })
            })
          }),
          upsert: vi.fn().mockResolvedValue({ error: null })
        };
      }
      return {};
    })
  })
}));

describe('POST /api/rounds/4/submit', () => {
  it('should return 200 and success if answer is correct', async () => {
    const request = new NextRequest('http://localhost:3000/api/rounds/4/submit', {
      method: 'POST',
      body: JSON.stringify({ answer: 'McQueen', questionOrder: 1 })
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('should return 400 if answer is incorrect', async () => {
    const request = new NextRequest('http://localhost:3000/api/rounds/4/submit', {
      method: 'POST',
      body: JSON.stringify({ answer: 'WRONG', questionOrder: 1 })
    });
    
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Incorrect answer');
  });
});
