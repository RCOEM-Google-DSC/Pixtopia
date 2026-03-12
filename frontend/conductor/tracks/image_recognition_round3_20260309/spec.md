# Track Specification: Image Recognition Round 3

## Description
This track focuses on implementing the backend logic and minimal frontend structure for the "Image Recognition" round (Round 3) of the competition. The round features Pixar-themed questions where teams must identify characters or scenes from images.

## Core Features
1. **Round 3 Dashboard:**
    - Minimal UI layout: Question (text/image) at the top, four image options at the bottom.
    - Navbar: Display team name, current balance (points), and other team details.
2. **Hint System:**
    - Hint button that reveals a clue.
    - Incremental Point Cost: Each hint costs a set amount of points, with the cost increasing for each subsequent hint used.
3. **Scoring Logic:**
    - Points awarded based on the number of hints used and the time taken to answer.
    - Integration with Supabase to persist team scores and hint usage.
4. **Mock Data:**
    - Custom Pixar-themed questions and image options for testing.

## Technical Details
- **Backend:** Next.js API routes for fetching questions, processing hints, and calculating scores.
- **Database:** Supabase tables for `rounds`, `questions`, `hints`, and `team_progress`.
- **State Management:** React Context or Supabase real-time to sync team balance and round status.
