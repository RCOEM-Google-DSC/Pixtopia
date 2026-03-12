# Specification: Round 4 Part A (Visual Puzzle)

## Overview
Implement the first part of Round 4 (Part A) in the Pixtopia dashboard. This round features a visual puzzle where teams must guess an answer based on two images fetched from a Supabase bucket.

## Functional Requirements
- **Dashboard Navigation:** Reuse the existing `DashboardNavbar` to display team name and current score.
- **Visual Puzzle Display:** Show two side-by-side images fetched from the `round4` Supabase bucket.
- **Answer Input:**
  - A segmented input bar with individual blocks for each letter of the target answer.
  - Number of blocks equals the length of the correct answer.
  - Automatic focus progression (auto-focus next) as the user types.
- **Hint System:**
  - A hint button/bar that reveals a random letter in the answer input.
  - Cost: Incrementing point deduction (e.g., 10 for the 1st, 20 for the 2nd, etc.).
  - Strategy: Only reveal letters that haven't been typed correctly or revealed yet.
- **Real-time State:** Fetch correct answer and hint status from the database to ensure consistency.

## Non-Functional Requirements
- **Performance:** Optimized image loading and minimal latency for input interactions.
- **Security:** Ensure hint costs are deducted on the server-side to prevent tampering.
- **UI/UX:** Pixar-themed styling consistent with the rest of the application.

## Acceptance Criteria
- [ ] Round 4 Part A page is accessible at `/dashboard/round/4/part1`.
- [ ] Navbar correctly displays current team data.
- [ ] Two images are visible and correctly sized.
- [ ] Input blocks correctly handle character entry and auto-focus.
- [ ] Hint button reveals a correct letter and deducts the appropriate points.
- [ ] Correct answer submission redirects to Part B (or handles completion).

## Out of Scope
- Implementation of Part B.
- Detailed leaderboard view (handled by existing component).