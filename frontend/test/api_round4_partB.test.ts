import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getRound4State } from '../app/api/rounds/4/state/route';
import { POST as submitRound4Answer } from '../app/api/rounds/4/submit/route';
import { POST as getRound4Hint } from '../app/api/rounds/4/hint/route';
import { NextRequest } from 'next/server';

// Mock Supabase
const mockUser = { id: 'mock-user-id' };
const mockTeam = { id: 'mock-team-id', points: 500 };
const mockSubmission = { team_id: 'mock-team-id', round4: {} };

const mockQuestionsData = [
  { id: '1', order: 1, round_id: '4', answer: 'CAR', image_urls: ['url1', 'url2'], points: 100 },
  { id: '4', order: 4, round_id: '4', video_url: 'video4', options: ['A', 'B', 'C', 'D'], correct_index: 0, hint: 'Hint 4', hint_cost: 15, points: 100 }
];

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
              single: vi.fn().mockResolvedValue({ data: { id: 'mock-team-id', points: 500 }, error: null }),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'mock-team-id', points: 500 }, error: null })
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
              order: vi.fn().mockResolvedValue({ 
                data: [
                  { id: '1', order: 1, round_id: '4', answer: 'CAR', image_urls: ['url1', 'url2'], points: 100 },
                  { id: '4', order: 4, round_id: '4', video_url: 'video4', options: ['A', 'B', 'C', 'D'], correct_index: 0, hint: 'Hint 4', hint_cost: 15, points: 100 }
                ], 
                error: null 
              })
            })
          })
        };
      }
      if (table === 'submissions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { team_id: 'mock-team-id', round4: {} }, error: null })
            })
          }),
          upsert: vi.fn().mockResolvedValue({ error: null })
        };
      }
      return {};
    })
  })
}));

describe('Round 4 Part B API Logic', () => {
  describe('GET /api/rounds/4/state', () => {
    it('should return Part B questions with video_url and options', async () => {
      const request = new NextRequest('http://localhost:3000/api/rounds/4/state');
      const response = await getRound4State(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      
      const q4 = data.puzzles.find((p: any) => p.order === 4);
      if (q4) {
        expect(q4).toHaveProperty('video_url');
        expect(q4).toHaveProperty('options');
      }
    });
  });

  describe('POST /api/rounds/4/submit (Part B)', () => {
    it('should correctly validate MCQ answer index', async () => {
      const request = new NextRequest('http://localhost:3000/api/rounds/4/submit', {
        method: 'POST',
        body: JSON.stringify({ answerIndex: 0, questionOrder: 4 })
      });
      const response = await submitRound4Answer(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should return error for incorrect MCQ answer index', async () => {
      const request = new NextRequest('http://localhost:3000/api/rounds/4/submit', {
        method: 'POST',
        body: JSON.stringify({ answerIndex: 1, questionOrder: 4 })
      });
      const response = await submitRound4Answer(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Incorrect answer');
    });
  });

  describe('POST /api/rounds/4/hint (Part B)', () => {
    it('should return the text hint for Part B questions', async () => {
      const request = new NextRequest('http://localhost:3000/api/rounds/4/hint', {
        method: 'POST',
        body: JSON.stringify({ questionOrder: 4 })
      });
      const response = await getRound4Hint(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.hint).toBe('Hint 4');
    });
  });
});
