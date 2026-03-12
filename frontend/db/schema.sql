-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.game_state (
  id text NOT NULL DEFAULT 'current'::text,
  round_statuses jsonb NOT NULL DEFAULT '{"1": {"status": "locked", "startedAt": null}, "2": {"status": "locked", "startedAt": null}, "3": {"status": "locked", "startedAt": null}, "4": {"status": "locked", "startedAt": null}, "5": {"status": "locked", "startedAt": null}}'::jsonb,
  hackerrank_url text NOT NULL DEFAULT ''::text,
  CONSTRAINT game_state_pkey PRIMARY KEY (id)
);
CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  round_id text NOT NULL,
  order integer NOT NULL,
  question text,
  options ARRAY,
  correct_index integer NOT NULL DEFAULT 0,
  image_urls ARRAY,
  letters ARRAY,
  answer text,
  points integer NOT NULL DEFAULT 0,
  CONSTRAINT questions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.round_3_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  question_order integer NOT NULL UNIQUE,
  question text NOT NULL,
  image_urls ARRAY NOT NULL,
  correct_index integer NOT NULL,
  hints ARRAY NOT NULL DEFAULT '{}'::text[],
  points integer NOT NULL DEFAULT 100,
  hint_point integer,
  CONSTRAINT round_3_questions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.submissions (
  team_id uuid NOT NULL,
  round1 jsonb,
  round3 jsonb,
  round4 jsonb,
  CONSTRAINT submissions_pkey PRIMARY KEY (team_id),
  CONSTRAINT submissions_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_name text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  leader_id uuid,
  team_members_ids ARRAY NOT NULL DEFAULT '{}'::uuid[],
  password text NOT NULL,
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  hacker_rank_url text DEFAULT ''::text,
  year text NOT NULL DEFAULT ''::text,
  phone_no text NOT NULL DEFAULT ''::text,
  branch text NOT NULL DEFAULT ''::text,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);