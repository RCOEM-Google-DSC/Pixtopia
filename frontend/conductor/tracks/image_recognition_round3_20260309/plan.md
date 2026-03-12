# Implementation Plan: Image Recognition Round 3

## Phase 1: Database Schema & Mock Data [complete]
- [x] **Task: Define Supabase Schema for Round 3**
    - [x] Create `round_3_questions` table with Pixar-themed mock data (question, 4 image URLs, correct answer, hints).
    - [x] Create `team_round_progress` table to track hint usage, time started, and points spent.
- [x] **Task: Seed Mock Pixar Questions**
    - [x] Add at least 5 easy Pixar-themed questions with 4 image options and 2-3 hints each.
- [x] **Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)**

## Phase 2: Backend API Development [complete]
- [x] **Task: Implement Round State API**
    - [x] Create `app/api/rounds/3/state/route.ts` to fetch current question and team balance.
- [x] **Task: Implement Hint Logic API**
    - [x] Create `app/api/rounds/3/hint/route.ts` to process hint requests, calculate incremental costs, and update team points in Supabase.
- [x] **Task: Implement Submission & Scoring API**
    - [x] Create `app/api/rounds/3/submit/route.ts` to validate answers and calculate final points based on hints and time.
- [x] **Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)**

## Phase 3: Minimal Frontend Structure [complete]
- [x] **Task: Create Round 3 Page Component**
    - [x] Setup `app/(pages)/dashboard/round/3/page.tsx` with a minimal layout (Question, 4 Options).
- [x] **Task: Implement Navbar with Team Stats**
    - [x] Add a navbar component to display team details and real-time point balance.
- [x] **Task: Connect Frontend to Backend APIs**
    - [x] Integrate the hint button and answer selection with the newly created API routes.
- [x] **Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)**
