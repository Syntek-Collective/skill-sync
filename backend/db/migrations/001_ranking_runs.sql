-- Pairwise ranking runs: durable batch state + append-only event log (see docs/RANKING.md).
-- Idempotent: safe to run more than once (Supabase SQL editor or psql).
--
-- PRIVACY: nothing in these tables holds resume text. A run stores candidate ids, the job's
-- requirement list and the Bradley-Terry result; events hold candidate ids, winners, the model's
-- short reason and requirement ids. Saved runs also keep the resume ROW ids (resume_ids) so a run
-- can be resumed after a server restart - the text itself stays in the user's own resumes rows.
-- Private runs never write resume ids or text (resume_ids is null).
--
-- DELETION: a saved run is linked to its job (job_posting_id); deleting the job deletes the
-- run (foreign key, on delete cascade; the backend's deleteSavedJob also deletes them
-- explicitly). Deleting a user deletes all their runs. Events cascade from their run.
-- Needs public.job_postings (the app's existing table, id uuid) to exist first.
--
-- The backend uses the service-role key (bypasses RLS) and filters every query by user_id.
-- RLS is still enabled so the browser's anon key can only ever read the owner's rows.

create extension if not exists pgcrypto;

create table if not exists public.ranking_runs (
  id uuid primary key default gen_random_uuid(),
  -- deleting a user (or their saved job) deletes their runs, and the events cascade from the run
  user_id uuid not null references auth.users (id) on delete cascade,
  job_posting_id uuid null references public.job_postings (id) on delete cascade,
  mode text not null check (mode in ('saved', 'private')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'interrupted')),
  candidate_ids text[] not null,
  -- saved runs only: resume row id for each entry of candidate_ids (same order); null for private runs
  resume_ids text[] null,
  rounds int not null check (rounds in (1, 2)),
  total_tasks int not null,
  completed_tasks int not null default 0,
  requirements jsonb not null,
  result jsonb null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- for databases created before resume_ids existed
alter table public.ranking_runs add column if not exists resume_ids text[] null;

-- for databases created before the foreign keys existed. Postgres has no "add constraint if not
-- exists", so each one is added only when no constraint of that name is there yet. NOT VALID
-- skips checking rows that already exist (none should break it, but a migration shouldn't fail
-- or delete data over one); the constraint and its ON DELETE CASCADE apply from now on.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ranking_runs_user_id_fkey' and conrelid = 'public.ranking_runs'::regclass
  ) then
    alter table public.ranking_runs
      add constraint ranking_runs_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ranking_runs_job_posting_id_fkey' and conrelid = 'public.ranking_runs'::regclass
  ) then
    alter table public.ranking_runs
      add constraint ranking_runs_job_posting_id_fkey
      foreign key (job_posting_id) references public.job_postings (id) on delete cascade not valid;
  end if;
end
$$;

create index if not exists ranking_runs_job_posting_id_idx on public.ranking_runs (job_posting_id);

create index if not exists ranking_runs_user_id_idx on public.ranking_runs (user_id, created_at desc);
create index if not exists ranking_runs_status_idx on public.ranking_runs (status);

create table if not exists public.ranking_events (
  run_id uuid not null references public.ranking_runs (id) on delete cascade,
  seq int not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, seq)
);

-- keep updated_at current on every update
create or replace function public.ranking_runs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ranking_runs_touch_updated_at on public.ranking_runs;
create trigger ranking_runs_touch_updated_at
  before update on public.ranking_runs
  for each row execute function public.ranking_runs_touch_updated_at();

-- ===== Row-level security: owners can read their own rows; nobody writes through the anon key =====
alter table public.ranking_runs enable row level security;
alter table public.ranking_events enable row level security;

drop policy if exists "ranking_runs_select_own" on public.ranking_runs;
create policy "ranking_runs_select_own" on public.ranking_runs
  for select
  using (auth.uid() = user_id);

drop policy if exists "ranking_events_select_own" on public.ranking_events;
create policy "ranking_events_select_own" on public.ranking_events
  for select
  using (
    exists (
      select 1 from public.ranking_runs r
      where r.id = ranking_events.run_id
        and r.user_id = auth.uid()
    )
  );
