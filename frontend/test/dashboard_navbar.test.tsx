import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DashboardNavbar from '../app/Components/Navigation/DashboardNavbar';
import * as teamHook from '../lib/useTeam';

vi.mock('../lib/useTeam');

describe('DashboardNavbar Component', () => {
  it('should render the team name and points', () => {
    // Mock the useTeam hook return value
    vi.mocked(teamHook.useTeam).mockReturnValue({
      team: { team_name: "The Incredibles", points: 1500, id: "team-1", leader_id: "leader-1", team_members_ids: [], password: "pw" },
      submission: null,
      loading: false,
      refreshSubmission: vi.fn()
    });

    render(<DashboardNavbar />);
    
    expect(screen.getByText("The Incredibles")).toBeDefined();
    expect(screen.getByText("1500")).toBeDefined();
  });

  it('should render placeholders when loading', () => {
    vi.mocked(teamHook.useTeam).mockReturnValue({
      team: null,
      submission: null,
      loading: true,
      refreshSubmission: vi.fn()
    });

    render(<DashboardNavbar />);
    
    // Check for skeletons or loading text
    // Depending on implementation, we might check for data-testid
  });
});
