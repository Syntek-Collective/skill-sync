/*

    What is this file for?
    Executes one pairwise ranking run in the background (docs/RANKING.md):
    1. build the deterministic pair schedule (seeded with the run id, so a restart rebuilds the
       exact same task list)
    2. skip every task that already has a `comparison` event (resume after a restart or a failure);
       a resumed run emits `run_resumed` instead of a second `run_started`
    3. judge the remaining pairs with the user's OpenAI key, 3 at a time
    4. after each judgment: store a `comparison` event, refit Bradley-Terry, store a `standings`
       event. Events are stored FIRST and only then published on the event bus, one at a time in
       seq order, so a WebSocket client that replays from the database never misses one.
    5. store the result and a `completed` event (or `failed`)

    PRIVACY
    - Resume text never goes into events, the run row, logs or error messages. Events carry
      candidate ids, the winner, the model's short reason and requirement ids only.
    - The model's reason can paraphrase resume content, so for PRIVATE runs it is NOT stored:
      the stored comparison event has `reason: null`, and only the live event published on the
      bus (same seq) carries it. Saved runs store it (capped at 500 characters).
    - PRIVATE runs: the controller passes the already-redacted texts in; they're kept in an
      in-memory Map for the life of the run and deleted in `finally`, success or not.
    - SAVED runs: texts are re-read from the user's own stored resumes (owner-checked), so a
      saved run can be resumed after a restart. They're also only held in memory while it runs.
    - OpenAI errors are logged by status only (their message can echo part of the key).

*/

import { APIError } from "openai";

import { fitBradleyTerry, type BTFit, type Outcome } from "./bradleyTerry";
import { buildSchedule, type PairTask } from "./pairSchedule";
import { judgePair } from "./pairwiseJudge";
import {
  appendEvent,
  listEventsAfter,
  updateRun,
  type RankingEventType,
  type RankingRunRow,
  type StoredEvent,
} from "./rankingStore";
import { fetchResumeFile, getResumeForUser } from "./supabaseService";
import { textFromPdf } from "./pdfService";
import { redactContactInfo } from "./redact";
import { publish } from "../realtime/eventBus";

export const RUN_CONCURRENCY = 3;
const MAX_REASON_LENGTH = 500;

// An error whose message is safe to show the user and store on the run.
export class RunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunError";
  }
}

// run id -> candidate id -> redacted resume text. Private runs only; lives for the run only.
const privateRunTexts = new Map<string, Map<string, string>>();
// runs executing in this process (guards against starting the same run twice)
const activeRuns = new Set<string>();

export function isRunActive(runId: string): boolean {
  return activeRuns.has(runId);
}

// for tests: is any private text still held in memory for this run?
export function hasPrivateTexts(runId: string): boolean {
  return privateRunTexts.has(runId);
}

// Reads one of the user's saved resumes and returns its redacted text, or null when the resume
// doesn't exist or isn't the user's (getResumeForUser also refuses file paths outside the
// user's own folder).
export async function loadSavedResumeText(resumeId: string, userId: string): Promise<string | null> {
  const resume = await getResumeForUser(resumeId, userId);
  if (!resume) return null;

  const file = await fetchResumeFile(resume.file_path);
  const text = await textFromPdf(file);
  return redactContactInfo(text);
}

// turns an OpenAI error status into a message the user can act on (same wording as /api/analyze)
export function openaiErrorMessage(status: number): string {
  if (status === 401) return "OpenAI rejected your API key. Check it and try again.";
  if (status === 429) {
    return "OpenAI rate limit reached, or your key is out of credit. Check your OpenAI billing and try again.";
  }
  if (status === 403 || status === 404) return "Your OpenAI key doesn't have access to the model SkillSync uses.";
  return "OpenAI couldn't complete the comparison. Please try again.";
}

// The message stored on the run and sent to the client. Never the raw error message, which
// could contain model output (and so resume content) or part of the key.
function userFacingError(error: unknown): string {
  if (error instanceof APIError && error.status) return openaiErrorMessage(error.status);
  if (error instanceof RunError) return error.message;
  return "The ranking failed. Please try again.";
}

// What's safe to log: an OpenAI status, our own safe message, or just the error's class name.
function logFailure(runId: string, error: unknown): void {
  if (error instanceof APIError && error.status) {
    console.error(`Ranking run ${runId} failed: OpenAI returned`, error.status);
  } else if (error instanceof RunError) {
    console.error(`Ranking run ${runId} failed:`, error.message);
  } else {
    console.error(`Ranking run ${runId} failed:`, error instanceof Error ? error.name : typeof error);
  }
}

function taskKey(a: string, b: string): string {
  return JSON.stringify([a, b]);
}

// Tasks already judged, read back from the run's stored comparison events.
function completedFromEvents(events: StoredEvent[]): { doneSeqs: Set<number>; doneKeys: Set<string>; outcomes: Outcome[] } {
  const doneSeqs = new Set<number>();
  const doneKeys = new Set<string>();
  const outcomes: Outcome[] = [];

  for (const event of events) {
    if (event.type !== "comparison") continue;
    const task = event.payload.task as { seq?: unknown; a?: unknown; b?: unknown } | undefined;
    const winner = event.payload.winner;
    if (!task || typeof task.a !== "string" || typeof task.b !== "string") continue;
    if (winner !== "a" && winner !== "b" && winner !== "tie") continue;

    const key = taskKey(task.a, task.b);
    if (typeof task.seq === "number") {
      if (doneSeqs.has(task.seq)) continue;
      doneSeqs.add(task.seq);
    } else if (doneKeys.has(key)) {
      continue;
    }
    doneKeys.add(key);
    outcomes.push({ a: task.a, b: task.b, result: winner });
  }

  return { doneSeqs, doneKeys, outcomes };
}

async function loadTexts(run: RankingRunRow): Promise<Map<string, string>> {
  if (run.mode === "private") {
    const texts = privateRunTexts.get(run.id);
    if (!texts) {
      throw new RunError("This private run's resumes are no longer in memory. Run it again.");
    }
    return texts;
  }

  const resumeIds = run.resume_ids ?? [];
  if (resumeIds.length !== run.candidate_ids.length) {
    throw new RunError("This run's resumes are missing. Run it again.");
  }

  const texts = new Map<string, string>();
  for (let i = 0; i < run.candidate_ids.length; i++) {
    const text = await loadSavedResumeText(resumeIds[i]!, run.user_id);
    if (!text) {
      throw new RunError("A resume in this run is no longer available.");
    }
    texts.set(run.candidate_ids[i]!, text);
  }
  return texts;
}

// Runs the whole job. Resolves when the run has completed or failed (it never rejects).
// For private runs pass the redacted texts (candidate id -> text); they're dropped at the end.
export async function executeRun(
  run: RankingRunRow,
  apiKey: string,
  privateTexts?: Map<string, string>,
): Promise<void> {
  if (activeRuns.has(run.id)) return;
  activeRuns.add(run.id);
  if (run.mode === "private" && privateTexts) privateRunTexts.set(run.id, privateTexts);

  let texts: Map<string, string> | null = null;

  // Store, then publish - one event at a time, so seqs are published in order.
  // `livePatch` is merged into the PUBLISHED event only (never stored), e.g. a private run's reason.
  let queue: Promise<unknown> = Promise.resolve();
  const emitInOrder = (
    type: RankingEventType,
    payload: Record<string, unknown>,
    livePatch?: Record<string, unknown>,
  ) => {
    const next = queue.then(async () => {
      const stored = await appendEvent(run.id, type, payload);
      publish(livePatch ? { ...stored, payload: { ...stored.payload, ...livePatch } } : stored);
      return stored;
    });
    queue = next.catch(() => undefined);
    return next;
  };

  try {
    texts = await loadTexts(run);

    const existing = (await listEventsAfter(run.id, run.user_id, 0)) ?? [];
    if (existing.some((event) => event.type === "completed")) {
      return; // already finished; nothing to do
    }

    const schedule = buildSchedule(run.candidate_ids, run.rounds, run.id);
    const totalTasks = run.total_tasks || schedule.length;
    const { doneSeqs, doneKeys, outcomes } = completedFromEvents(existing);
    const pending: PairTask[] = schedule.filter(
      (task) => !doneSeqs.has(task.seq) && !doneKeys.has(taskKey(task.a, task.b)),
    );

    await updateRun(run.id, run.user_id, { status: "running", error: null, completedTasks: outcomes.length });
    if (!existing.some((event) => event.type === "run_started")) {
      await emitInOrder("run_started", { totalTasks });
    } else {
      // a resume (after a restart or a failure): tells clients the run is going again, so an
      // earlier `failed` event in the log is no longer the run's state
      await emitInOrder("run_resumed", { completedTasks: outcomes.length, totalTasks });
    }

    // ===== judge the pending pairs, RUN_CONCURRENCY at a time =====
    let nextIndex = 0;
    let failure: unknown = null;
    const runTexts = texts;

    // comparison -> progress -> standings for one judgment; runs strictly one at a time (recordQueue)
    const recordJudgment = async (task: PairTask, result: Outcome["result"], reason: string, deciding: string[]) => {
      if (failure !== null) return;
      outcomes.push({ a: task.a, b: task.b, result });
      const completedTasks = outcomes.length;

      // PRIVACY: a private run's reason is published live but never stored
      const isPrivate = run.mode === "private";
      await emitInOrder(
        "comparison",
        {
          task: { seq: task.seq, a: task.a, b: task.b },
          winner: result,
          reason: isPrivate ? null : reason,
          decidingRequirementIds: deciding,
          completedTasks,
          totalTasks,
        },
        isPrivate ? { reason } : undefined,
      );
      await updateRun(run.id, run.user_id, { completedTasks });

      const fit = fitBradleyTerry(run.candidate_ids, outcomes);
      await emitInOrder("standings", { strengths: fit.strengths });
    };

    let recordQueue: Promise<unknown> = Promise.resolve();

    const worker = async () => {
      while (failure === null) {
        const task = pending[nextIndex++];
        if (!task) return;

        try {
          const judgment = await judgePair(apiKey, run.requirements, runTexts.get(task.a) ?? "", runTexts.get(task.b) ?? "");
          if (failure !== null) return; // another task failed meanwhile; don't record more

          const result: Outcome["result"] = judgment.winner === "A" ? "a" : judgment.winner === "B" ? "b" : "tie";
          const reason = String(judgment.reason ?? "").slice(0, MAX_REASON_LENGTH);
          const deciding = Array.isArray(judgment.decidingRequirementIds)
            ? judgment.decidingRequirementIds.filter((id): id is string => typeof id === "string")
            : [];

          const recorded = recordQueue.then(() => recordJudgment(task, result, reason, deciding));
          recordQueue = recorded.catch(() => undefined);
          await recorded;
        } catch (error) {
          if (failure === null) failure = error;
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(RUN_CONCURRENCY, pending.length) }, worker));
    if (failure !== null) throw failure;

    // ===== done: store the result, then announce it =====
    const fit: BTFit = fitBradleyTerry(run.candidate_ids, outcomes);
    const result = { strengths: fit.strengths, iterations: fit.iterations, converged: fit.converged };
    await updateRun(run.id, run.user_id, { status: "completed", completedTasks: outcomes.length, result });
    await emitInOrder("completed", { result });
  } catch (error) {
    logFailure(run.id, error);
    const message = userFacingError(error);
    try {
      await queue; // let any event already being stored finish first, so seqs stay in order
      await updateRun(run.id, run.user_id, { status: "failed", error: message });
      await emitInOrder("failed", { error: message });
    } catch (storeError) {
      logFailure(run.id, storeError);
    }
  } finally {
    // PRIVACY: drop every resume text this run held
    privateRunTexts.get(run.id)?.clear();
    privateRunTexts.delete(run.id);
    texts?.clear();
    activeRuns.delete(run.id);
  }
}

// Starts a run in the background. Returns false if it's already running in this process.
export function startRun(run: RankingRunRow, apiKey: string, privateTexts?: Map<string, string>): boolean {
  if (activeRuns.has(run.id)) return false;
  void executeRun(run, apiKey, privateTexts);
  return true;
}
