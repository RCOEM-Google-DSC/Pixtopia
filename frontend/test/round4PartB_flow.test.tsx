import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Round4Part2Page from '../app/(pages)/(protected)/dashboard/round/4/part2/page.tsx';

// Mock DashboardNavbar
vi.mock('@/app/Components/Navigation/DashboardNavbar', () => ({
  default: () => <div data-testid="navbar">Navbar</div>
}));

// Mock fetch
const mockState = {
  puzzles: [
    { order: 4, video_url: 'v4', options: ['A', 'B', 'C', 'D'], points: 100, type: 'mcq', hint: 'H4', hint_cost: 15 },
    { order: 5, video_url: 'v5', options: ['E', 'F', 'G', 'H'], points: 100, type: 'mcq', hint: 'H5', hint_cost: 15 }
  ],
  roundState: {
    q4_completed: false,
    q5_completed: false,
    q4_hints_revealed: false,
    q5_hints_revealed: false,
    is_completed: false,
    points_spent: 0
  },
  teamPoints: 500
};

global.fetch = vi.fn();

describe('Round 4 Part B Question Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockImplementation((url: string) => {
      if (url === '/api/rounds/4/state') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockState)
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('should load initial question and handle correct submission', async () => {
    (global.fetch as any).mockImplementation((url: string, options: any) => {
      if (url === '/api/rounds/4/state') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockState) });
      }
      if (url === '/api/rounds/4/submit') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, allDone: false }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<Round4Part2Page />);
    
    await waitFor(() => expect(screen.queryByText(/Video Challenge/i)).toBeInTheDocument());
    
    // Check first question options
    expect(screen.getByText('A')).toBeInTheDocument();
    
    // Select option and submit
    fireEvent.click(screen.getByText('A'));
    fireEvent.click(screen.getByText(/Submit Answer/i));
    
    await waitFor(() => expect(screen.getByText(/Correct Answer!/i)).toBeInTheDocument());
    
    // Should advance to next question after delay
    await waitFor(() => expect(screen.getByText('E')).toBeInTheDocument(), { timeout: 3000 });
  });

  it('should handle hint reveal', async () => {
    (global.fetch as any).mockImplementation((url: string, options: any) => {
      if (url === '/api/rounds/4/state') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockState) });
      }
      if (url === '/api/rounds/4/hint') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ hint: 'Revealed Hint', cost: 15 }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<Round4Part2Page />);
    
    await waitFor(() => expect(screen.queryByText(/Video Challenge/i)).toBeInTheDocument());
    
    const hintButton = screen.getByText(/Hint/i);
    fireEvent.click(hintButton);
    
    await waitFor(() => expect(screen.getByText(/Revealed Hint/i)).toBeInTheDocument());
  });
});
