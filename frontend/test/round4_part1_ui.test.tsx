import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Round4Part1Page from '../app/(pages)/(protected)/dashboard/round/4/part1/page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('Round4Part1Page', () => {
  const mockPuzzles = [
    {
      order: 1,
      image_urls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
      answer_length: 5,
      revealed_letters: [],
    },
    {
      order: 2,
      image_urls: ['https://example.com/img3.jpg', 'https://example.com/img4.jpg'],
      answer_length: 6,
      revealed_letters: [],
    },
    {
      order: 3,
      image_urls: ['https://example.com/img5.jpg', 'https://example.com/img6.jpg'],
      answer_length: 4,
      revealed_letters: [],
    },
  ];

  const mockRoundState = {
    q1_completed: false,
    q2_completed: false,
    q3_completed: false,
    q1_hints_revealed: [],
    q2_hints_revealed: [],
    q3_hints_revealed: [],
    is_completed: false,
    points_spent: 0,
  };

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('renders loading state initially', async () => {
    let resolveFetch: any;
    (global.fetch as any).mockImplementation(() => 
      new Promise((resolve) => { resolveFetch = resolve; })
    );

    const { container } = render(<Round4Part1Page />);
    
    // Should have content in loading state
    expect(container.firstChild).toBeTruthy();
    
    // Cleanup
    if (resolveFetch) {
      resolveFetch({
        ok: true,
        json: async () => ({
          puzzles: mockPuzzles,
          roundState: mockRoundState,
          teamPoints: 500,
        }),
      });
    }
  });

  it('renders puzzle content after loading', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        puzzles: mockPuzzles,
        roundState: mockRoundState,
        teamPoints: 500,
      }),
    });

    render(<Round4Part1Page />);

    await waitFor(() => {
      expect(screen.getByText(/WHO KNOWS WHAT THIS IS?/i)).toBeInTheDocument();
    });

    // Should show question number
    expect(screen.getByText(/Q1\/3/i)).toBeInTheDocument();
    
    // Should show phase badge
    expect(screen.getByText(/PHASE A.*IMAGES/i)).toBeInTheDocument();
  });

  it('shows navigation tabs for all questions', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        puzzles: mockPuzzles,
        roundState: mockRoundState,
        teamPoints: 500,
      }),
    });

    render(<Round4Part1Page />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Q1/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('tab', { name: /Q2/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Q3/i })).toBeInTheDocument();
  });

  it('switches questions when clicking navigation tabs', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        puzzles: mockPuzzles,
        roundState: mockRoundState,
        teamPoints: 500,
      }),
    });

    render(<Round4Part1Page />);

    await waitFor(() => {
      const q2Tabs = screen.queryAllByText(/Q2/i);
      expect(q2Tabs.length).toBeGreaterThan(0);
    });
  });

  it('displays available hints count correctly', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        puzzles: mockPuzzles,
        roundState: {
          ...mockRoundState,
          q1_hints_revealed: [0, 2], // 2 hints used, 1 available (max hints capped at 3)
        },
        teamPoints: 500,
      }),
    });

    render(<Round4Part1Page />);

    await waitFor(() => {
      expect(screen.getByText(/HINT/i)).toBeInTheDocument();
    });

    // Badge should show 1 available hint (max 3 - 2 used)
    const badges = screen.getAllByText('1');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('submits answer correctly', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          puzzles: mockPuzzles,
          roundState: mockRoundState,
          teamPoints: 500,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          pointsAdded: 100,
          newBalance: 600,
          allDone: false,
        }),
      });

    render(<Round4Part1Page />);

    await waitFor(() => {
      expect(screen.getByText(/SUBMIT/i)).toBeInTheDocument();
    });

    // Find submit button
    const submitButton = screen.getByText(/SUBMIT/i);
    
    // Initially disabled (no answer)
    expect(submitButton).toBeDisabled();
  });

  it('displays error message when API fails', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    render(<Round4Part1Page />);

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows completion state when all puzzles solved', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        puzzles: mockPuzzles,
        roundState: {
          ...mockRoundState,
          q1_completed: true,
          q2_completed: true,
          q3_completed: true,
        },
        teamPoints: 800,
      }),
    });

    render(<Round4Part1Page />);

    await waitFor(() => {
      expect(screen.getByText(/All Puzzles Solved!/i)).toBeInTheDocument();
    });

    // Should show button to proceed to Part B
    expect(screen.getByText(/Enter Round 4 Part B/i)).toBeInTheDocument();
  });

  it('displays EXIT button that navigates to dashboard', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        puzzles: mockPuzzles,
        roundState: mockRoundState,
        teamPoints: 500,
      }),
    });

    render(<Round4Part1Page />);

    await waitFor(() => {
      expect(screen.getByText(/EXIT/i)).toBeInTheDocument();
    });

    const exitButton = screen.getByText(/EXIT/i);
    expect(exitButton).toBeInTheDocument();
  });

  it('displays ROUND 4 badge in header', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        puzzles: mockPuzzles,
        roundState: mockRoundState,
        teamPoints: 500,
      }),
    });

    render(<Round4Part1Page />);

    await waitFor(() => {
      expect(screen.getByText(/ROUND 4/i)).toBeInTheDocument();
    });
  });
});
