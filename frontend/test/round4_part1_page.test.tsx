import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Round4Part1Page from '../app/(pages)/(protected)/dashboard/round/4/part1/page';
import * as teamHook from '../lib/useTeam';

// Mock the Round 4 State API fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock the useTeam hook
vi.mock('../lib/useTeam');

describe('Round 4 Part 1 Page Component', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        roundState: {
          team_id: "team-1",
          round_id: 4,
          current_part: "part1",
          is_completed: false,
          hints_revealed: [0], // Hint revealed for index 0
          points_spent: 10
        },
        puzzle: {
          image_urls: ["https://mock.supabase.co/storage/v1/object/public/round4/p1.png", "https://mock.supabase.co/storage/v1/object/public/round4/p2.png"],
          answer_length: 5,
          answer: "GHOST",
          revealed_letters: [{ index: 0, char: "G" }]
        }
      })
    });

    vi.mocked(teamHook.useTeam).mockReturnValue({
      team: { team_name: "The Incredibles", points: 500, id: "team-1", leader_id: "leader-1", team_members_ids: [], password: "pw" },
      submission: null,
      loading: false,
      refreshSubmission: vi.fn()
    });
  });

  it('should render the navbar, two images and input blocks', async () => {
    render(<Round4Part1Page />);
    
    // Check for the navbar content
    expect(screen.getByText(/The Incredibles/i)).toBeDefined();
    
    // Check for the images from the mock Supabase URL
    await waitFor(() => {
      const images = screen.getAllByRole('img');
      expect(images.some(img => img.getAttribute('src') === 'https://mock.supabase.co/storage/v1/object/public/round4/p1.png')).toBe(true);
      expect(images.some(img => img.getAttribute('src') === 'https://mock.supabase.co/storage/v1/object/public/round4/p2.png')).toBe(true);
    });

    // Check for the input blocks (length 5)
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBe(5);

    // Check that the first input is pre-filled with revealed hint 'G' and is read-only
    expect((inputs[0] as HTMLInputElement).value).toBe('G');
    expect((inputs[0] as HTMLInputElement).readOnly).toBe(true);
  });
});
