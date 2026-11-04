/*

    What is this file for?
    Data access for pairwise ranking runs (docs/RANKING.md, "Durable batch state"):
    - ranking_runs:   one row per run (status, progress, the final Bradley-Terry result)
    - ranking_events: the run's append-only event log; the WebSocket replays it on reconnect

    PRIVACY
    Nothing written here contains resume text. Events hold candidate ids, winners, a short reason
    and requirement ids. Private runs store no resume ids either.

    The backend uses the service-role key (it skips row-level security), so EVERY read that
    serves a user filters by that user's id. Writes only happen from the runner, for runs it
    already loaded for their owner.

*/

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Requirement } from "../types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export type RunMode = "saved" | "private";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "interrupted";

export type RankingRunRow = {
  id: string;
  user_id: string;
  job_posting_id: string | null;
  mode: RunMode;
  status: RunStatus;
  candidate_ids: string[];
  resume_ids: string[] | null;
  rounds: number;
  total_tasks: number;
  completed_tasks: number;
  requirements: Requirement[];
  result: unknown | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type RankingEventType = "run_started" | "run_resumed" | "comparison" | "standings" | "completed" | "failed";

// one persisted event; the wire format is { type, runId, seq, ...payload }
export type StoredEvent = {
  runId: string;
  seq: number;
  type: RankingEventType;
  payload: Record<string, unknown>;
};

export type CreateRunInput = {
  userId: string;
  mode: RunMode;
  candidateIds: string[];
  resumeIds?: string[] | null; // saved runs only
  rounds: number;
  totalTasks: number;
  requirements: Requirement[];
  jobPostingId?: string | null;
};

export type RunPatch = {
  status?: RunStatus;
  completedTasks?: number;
  result?: unknown;
  error?: string | null;
};

// Postgres unique_violation: another writer took this (run_id, seq)
const UNIQUE_VIOLATION = "23505";
const MAX_APPEND_ATTEMPTS = 5;

type EventRow = { run_id: string; seq: number; type: string; payload: Record<string, unknown> };

function toStoredEvent(row: EventRow): StoredEvent {
  return {
    runId: row.run_id,
    seq: row.seq,
    type: row.type as RankingEventType,
    payload: row.payload ?? {},
  };
}

export async function createRun(input: CreateRunInput): Promise<RankingRunRow> {
  const { data, error } = await supabase
    .from("ranking_runs")
    .insert({
      user_id: input.userId,
      job_posting_id: input.jobPostingId ?? null,
      mode: input.mode,
      status: "queued",
      candidate_ids: input.candidateIds,
      resume_ids: input.mode === "saved" ? input.resumeIds ?? null : null,
      rounds: input.rounds,
      total_tasks: input.totalTasks,
      requirements: input.requirements,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Could not create ranking run: ${error.message}`);
  }

  return data as RankingRunRow;
}

// Returns the run only if it belongs to this user; another user's run (or a bad id) is null.
export async function getRunForUser(runId: string, userId: string): Promise<RankingRunRow | null> {
  const { data, error } = await supabase
    .from("ranking_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // an id that isn't a uuid is just "not found", not a server error
    if (error.code === "22P02") return null;
    throw new Error(`Could not fetch ranking run: ${error.message}`);
  }

  return (data as RankingRunRow | null) ?? null;
}

export async function updateRun(runId: string, userId: string, patch: RunPatch): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.completedTasks !== undefined) update.completed_tasks = patch.completedTasks;
  if (patch.result !== undefined) update.result = patch.result;
  if (patch.error !== undefined) update.error = patch.error;
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from("ranking_runs")
    .update(update)
    .eq("id", runId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Could not update ranking run: ${error.message}`);
  }
}

// Highest seq stored for a run (0 when it has no events yet).
export async function getLastSeq(runId: string): Promise<number> {
  const { data, error } = await supabase
    .from("ranking_events")
    .select("seq")
    .eq("run_id", runId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read ranking events: ${error.message}`);
  }

  return (data as { seq: number } | null)?.seq ?? 0;
}

// Appends one event and returns it with its seq. The seq is next = max + 1; the (run_id, seq)
// primary key makes the insert fail if another writer took that number first, and then we
// read the max again and retry. So seqs are unique, gap-free and increasing per run.
export async function appendEvent(
  runId: string,
  type: RankingEventType,
  payload: Record<string, unknown>,
): Promise<StoredEvent> {
  for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt++) {
    const seq = (await getLastSeq(runId)) + 1;

    const { data, error } = await supabase
      .from("ranking_events")
      .insert({ run_id: runId, seq, type, payload })
      .select("run_id, seq, type, payload")
      .single();

    if (!error) {
      return toStoredEvent(data as EventRow);
    }
    if (error.code !== UNIQUE_VIOLATION) {
      throw new Error(`Could not save ranking event: ${error.message}`);
    }
    // someone else took this seq - loop and take the next free one
  }

  throw new Error("Could not save ranking event: too many concurrent writers");
}

// Every event of this user's run with seq > lastSeq, in order. Returns null when the run
// isn't this user's, so callers can't read another user's log by guessing an id.
export async function listEventsAfter(
  runId: string,
  userId: string,
  lastSeq: number,
): Promise<StoredEvent[] | null> {
  const run = await getRunForUser(runId, userId);
  if (!run) return null;

  const { data, error } = await supabase
    .from("ranking_events")
    .select("run_id, seq, type, payload")
    .eq("run_id", runId)
    .gt("seq", lastSeq)
    .order("seq", { ascending: true });

  if (error) {
    throw new Error(`Could not fetch ranking events: ${error.message}`);
  }

  return ((data ?? []) as EventRow[]).map(toStoredEvent);
}

// True when Supabase says the table doesn't exist: PostgREST's "PGRST205" (table not in its
// schema cache) or Postgres's "42P01" (undefined_table). That's the state of a database where
// backend/db/migrations/001_ranking_runs.sql hasn't been run yet.
export function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return /relation .* does not exist|could not find the table/i.test(error.message ?? "");
}

export class RankingTablesMissingError extends Error {
  constructor() {
    super("The ranking tables don't exist yet");
    this.name = "RankingTablesMissingError";
  }
}

// Permanently deletes one of this user's runs; its events go with it (on delete cascade).
// Returns false when the run doesn't exist or isn't this user's.
export async function deleteRunForUser(runId: string, userId: string): Promise<boolean> {
  const run = await getRunForUser(runId, userId);
  if (!run) return false;

  // events first, in case an older database lacks the cascade
  const { error: eventsError } = await supabase.from("ranking_events").delete().eq("run_id", run.id);
  if (eventsError) {
    throw new Error(`Could not delete ranking events: ${eventsError.message}`);
  }

  const { error } = await supabase.from("ranking_runs").delete().eq("id", run.id).eq("user_id", userId);
  if (error) {
    throw new Error(`Could not delete ranking run: ${error.message}`);
  }
  return true;
}

// Deletes every ranking run (and so its events) linked to one of this user's saved jobs. Called
// by deleteSavedJob. The job_posting_id foreign key cascades too; this also covers databases
// where it doesn't exist. A database without the ranking tables has nothing to delete.
export async function deleteRunsForJob(jobPostingId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("ranking_runs")
    .delete()
    .eq("job_posting_id", jobPostingId)
    .eq("user_id", userId);

  if (error && !isMissingTableError(error)) {
    throw new Error(`Could not delete ranking runs: ${error.message}`);
  }
}

// Called once on boot. A private run's resume texts only ever lived in the old process's
// memory, so a private run that was queued or running can never finish: mark it interrupted
// (the user re-runs it). Saved runs are left as they are - they can be resumed, because their
// resumes are stored rows. Returns how many runs were marked.
export async function markInterruptedRuns(): Promise<number> {
  const { data, error } = await supabase
    .from("ranking_runs")
    .update({
      status: "interrupted",
      error: "The server restarted during this private run. Run it again.",
    })
    .eq("mode", "private")
    .in("status", ["queued", "running"])
    .select("id");

  if (error) {
    if (isMissingTableError(error)) throw new RankingTablesMissingError();
    throw new Error(`Could not mark interrupted runs: ${error.message}`);
  }

  return (data ?? []).length;
}

// The boot step server.ts runs. Never rejects: a database without the ranking tables (the
// migration not run yet) or a Supabase hiccup logs ONE line and the server keeps serving, so
// /api/analyze and /api/history work without the new tables.
export async function markInterruptedRunsOnBoot(log: (line: string) => void = console.log): Promise<void> {
  try {
    const count = await markInterruptedRuns();
    if (count > 0) log(`Marked ${count} private ranking run(s) as interrupted`);
  } catch (error) {
    if (error instanceof RankingTablesMissingError) {
      log("Ranking tables not found; pairwise ranking is unavailable until backend/db/migrations/001_ranking_runs.sql is run.");
    } else {
      log(`Could not mark interrupted ranking runs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
