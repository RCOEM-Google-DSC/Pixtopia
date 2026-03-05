-- ============================================================
-- Pixtopia – Supabase Database Schema
-- Run this entire file in the Supabase SQL Editor once, in order.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. USERS
-- Mirrors auth.users. One row per participant.
-- Leaders share the same id as their Supabase Auth user.
-- Non-leader members get a plain UUID (no Auth account).
-- ──────────────────────────────────────────────────────────────
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  hacker_rank_url text not null default '',
  year          text not null default '',
  phone_no      text not null default '',
  branch        text not null default ''
);

alter table public.users enable row level security;

-- Authenticated users can read all profiles
create policy "users: authenticated can read"
  on public.users for select
  to authenticated
  using (true);

-- Only service role can insert/update (seed script + API routes)
create policy "users: service role full access"
  on public.users for all
  to service_role
  using (true)
  with check (true);


-- ──────────────────────────────────────────────────────────────
-- 2. TEAMS
-- One row per competing team.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.teams (
  id                uuid primary key default gen_random_uuid(),
  team_name         text not null,
  points            integer not null default 0,
  leader_id         uuid references public.users(id),
  team_members_ids  uuid[] not null default '{}',
  password          text not null  -- stored plain-text by design (for distribution)
);

alter table public.teams enable row level security;

-- All authenticated users can read teams (needed for leaderboard + team lookup)
create policy "teams: authenticated can read"
  on public.teams for select
  to authenticated
  using (true);

-- Service role has full write access (API routes handle all mutations)
create policy "teams: service role full access"
  on public.teams for all
  to service_role
  using (true)
  with check (true);


-- ──────────────────────────────────────────────────────────────
-- 3. GAME_STATE
-- Singleton row (id = 'current') controlling round progression.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.game_state (
  id              text primary key default 'current',
  round_statuses  jsonb not null default '{
    "1": {"status": "locked", "startedAt": null},
    "2": {"status": "locked", "startedAt": null},
    "3": {"status": "locked", "startedAt": null},
    "4": {"status": "locked", "startedAt": null},
    "5": {"status": "locked", "startedAt": null}
  }',
  hackerrank_url  text not null default ''
);

alter table public.game_state enable row level security;

-- All authenticated users can read game state
create policy "game_state: authenticated can read"
  on public.game_state for select
  to authenticated
  using (true);

-- Service role has full write access (admin operations via API routes)
create policy "game_state: service role full access"
  on public.game_state for all
  to service_role
  using (true)
  with check (true);

-- Seed the singleton row (safe to run multiple times)
insert into public.game_state (id)
values ('current')
on conflict (id) do nothing;


-- ──────────────────────────────────────────────────────────────
-- 4. QUESTIONS
-- Replaces rounds/{roundId}/questions subcollection.
-- round_id is a string ("1" through "5").
-- ──────────────────────────────────────────────────────────────
create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  round_id      text not null,
  "order"       integer not null,
  question      text,                   -- Round 1: MCQ question text
  options       text[],                 -- Round 1: answer choices
  correct_index integer not null default 0,
  image_urls    text[],                 -- Rounds 3 & 4: Cloudinary URLs
  letters       text[],                 -- Round 4: scrambled letter tiles
  answer        text,                   -- Round 4: correct word
  points        integer not null default 0
);

create index if not exists questions_round_id_order_idx
  on public.questions (round_id, "order" asc);

alter table public.questions enable row level security;

-- Authenticated users can read questions (needed to play rounds)
create policy "questions: authenticated can read"
  on public.questions for select
  to authenticated
  using (true);

-- Service role has full write access (seed script)
create policy "questions: service role full access"
  on public.questions for all
  to service_role
  using (true)
  with check (true);


-- ──────────────────────────────────────────────────────────────
-- 5. SUBMISSIONS
-- One row per team. Round answers stored as JSONB columns.
-- Replaces submissions/{teamId} Firestore document.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.submissions (
  team_id   uuid primary key references public.teams(id) on delete cascade,
  round1    jsonb,   -- { answers: {qId: answerIndex}, score: number, submitted_at: timestamp }
  round3    jsonb,
  round4    jsonb
);

alter table public.submissions enable row level security;

-- Authenticated users can read (needed for checking if already submitted)
create policy "submissions: authenticated can read"
  on public.submissions for select
  to authenticated
  using (true);

-- Service role has full write access (API routes handle all submission writes)
create policy "submissions: service role full access"
  on public.submissions for all
  to service_role
  using (true)
  with check (true);


-- ──────────────────────────────────────────────────────────────
-- 6. REALTIME
-- Enable Supabase Realtime for tables that need live updates.
-- game_state → round progression broadcast to all clients
-- teams      → leaderboard live scoring
-- ──────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.game_state;
alter publication supabase_realtime add table public.teams;
