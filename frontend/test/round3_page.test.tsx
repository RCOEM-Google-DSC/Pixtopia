import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Round3Page from '../app/(pages)/(protected)/dashboard/round/3/page';
import * as teamHook from '../lib/useTeam';

// Mock the Round 3 State API fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock the useTeam hook
vi.mock('../lib/useTeam');

describe('Round 3 Page Component', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        questions: [
          { 
            id: 1, 
            order: 1, 
            question: "Who is this Pixar character?", 
            image_urls: ["a.jpg", "b.jpg", "c.jpg", "d.jpg"], 
            correct_index: 0, 
            hints: ["Hint 1"], 
            points: 100 
          }
        ],
        teamProgress: { hints_used: 0, points_spent: 0, is_completed: false },
        teamPoints: 500
      })
    });

    vi.mocked(teamHook.useTeam).mockReturnValue({
      team: { team_name: "The Incredibles", points: 500, id: "team-1", leader_id: "leader-1", team_members_ids: [], password: "pw" },
      submission: null,
      loading: false,
      refreshSubmission: vi.fn()
    });
  });

  it('should render the navbar, question and four image options', async () => {
    render(<Round3Page />);
    
    // Check for the navbar content
    expect(screen.getByText(/The Incredibles/i)).toBeDefined();
    
    // Check for the question text
    await waitFor(() => {
      expect(screen.getByText(/Who is this Pixar character\?/i)).toBeDefined();
    });

    // Check for the four image options (we expect images with src matching mocked URLs)
    const options = screen.getAllByRole('img');
    // We expect at least 4 images (the 4 options)
    expect(options.length).toBeGreaterThanOrEqual(4);
    
    // Check for the hint button
    expect(screen.getByText(/Get Hint/i)).toBeDefined();
    
    // Specific URLs from our mock
    expect(options.some(img => img.getAttribute('src') === 'a.jpg')).toBe(true);
    expect(options.some(img => img.getAttribute('src') === 'b.jpg')).toBe(true);
    expect(options.some(img => img.getAttribute('src') === 'c.jpg')).toBe(true);
    expect(options.some(img => img.getAttribute('src') === 'd.jpg')).toBe(true);
  });
});
