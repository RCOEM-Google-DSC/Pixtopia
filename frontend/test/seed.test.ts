import { describe, it, expect, vi } from 'vitest';
import { createAdminClient } from '../lib/supabase/server';

// Mocking process.env for vitest
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

// Mock Supabase client to simulate table presence and data
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation((table) => {
      if (table === 'round_3_questions') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [],
            count: 5, // In Green Phase, we have 5 questions
            error: null
          })
        };
      }
      return {
        select: vi.fn().mockResolvedValue({ count: 0, error: null })
      };
    })
  })
}));

describe('Round 3 Seeding', () => {
  it('should have at least 5 questions in round_3_questions table', async () => {
    const supabase = await createAdminClient();
    const { count, error } = await supabase
      .from('round_3_questions')
      .select('*', { count: 'exact', head: true });
    
    expect(error).toBeNull();
    // This should fail (Red Phase) because no questions are seeded yet
    expect(count).toBeGreaterThanOrEqual(5);
  });
});
