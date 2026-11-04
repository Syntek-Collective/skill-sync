/*

    What feature is it for?
    Pairwise ranking (docs/RANKING.md): the AI compares candidates two at a time and a
    Bradley-Terry model turns the wins and losses into a ranking.

    What does this controller do?
    - createRankingController  POST /api/rankings          validates, stores the run, starts it in the background
    - getRankingController     GET  /api/rankings/:runId   the run's status + the last event seq (owner only)
    - deleteRankingController  DELETE /api/rankings/:runId  deletes a finished run and its events (owner only)
    - resumeRankingController  POST /api/rankings/:runId/resume
          continues a SAVED run that stopped (server restart or an OpenAI error), skipping the
          comparisons already done. Needs the OpenAI key again because keys are never stored.
    Progress streams over the WebSocket (/ws), not over HTTP.

    TWO MODES, like /api/analyze - the body decides:
    - SAVED:   candidates: [{ id, resumeId }]   resumes this user stored; the run can be resumed.
               Optional jobPostingId (the user's saved job) links the run to the job, so
               deleting the job deletes the run too.
    - PRIVATE: candidates: [{ id, resumePdf }]  base64 PDFs read in memory, redacted, kept in
               memory only while the run lasts. Nothing about them is written to the database.

    Also exports the request helpers the bias-audit controller shares.

*/

import { Request, Response } from "express";
import { APIError } from "openai";

import { getJobPostingForUser, getResumeForUser } from "../services/supabaseService";
import { textFromPdf } from "../services/pdfService";
import { redactContactInfo } from "../services/redact";
import { parseRequirements } from "../services/scoring";
import { createRun, deleteRunForUser, getLastSeq, getRunForUser } from "../services/rankingStore";
import { isRunActive, openaiErrorMessage, startRun } from "../services/rankingRunner";

export const MIN_RANKING_CANDIDATES = 2;
export const MAX_RANKING_CANDIDATES = 10;
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
// all PDFs in one request together (the JSON body limit in app.ts is sized for this)
export const MAX_TOTAL_RESUME_BYTES = 30 * 1024 * 1024;
const MAX_CANDIDATE_ID_LENGTH = 64;

// ===== shared request helpers =====

// BYOK - the user's own OpenAI key, sent per request in a header; never stored or logged
export function readApiKey(req: Request): string | null {
  const apiKey = req.headers["x-openai-key"];
  return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
}

function openaiStatusCode(status: number): number {
  if (status === 401) return 401;
  if (status === 429) return 429;
  if (status === 403 || status === 404) return 400;
  return 502;
}

export function sendError(res: Response, label: string, error: unknown) {
  // only the status is logged - OpenAI's error message can echo part of the key
  if (error instanceof APIError && error.status) {
    console.error(`${label} failed: OpenAI returned`, error.status);
    return res.status(openaiStatusCode(error.status)).json({ error: openaiErrorMessage(error.status) });
  }

  // log the error type only: other errors (e.g. a malformed AI reply) could carry resume content
  console.error(`${label} failed:`, error instanceof Error ? error.name : typeof error);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}

// Decodes a base64 PDF and checks it's a real, reasonably sized PDF.
export function decodeResumePdf(value: unknown): { buffer: Buffer } | { error: string } {
  if (typeof value !== "string" || !value) {
    return { error: "resumePdf is required." };
  }

  const buffer = Buffer.from(value, "base64");

  if (buffer.length > MAX_RESUME_BYTES) {
    return { error: "Resumes must be 5 MB or smaller." };
  }
  // every PDF file starts with "%PDF-"; this catches renamed non-PDF files
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { error: "That file isn't a readable PDF." };
  }

  return { buffer };
}

export type ParsedCandidates =
  | { mode: "saved"; candidates: { id: string; resumeId: string }[] }
  | { mode: "private"; candidates: { id: string; buffer: Buffer }[] };

// Validates the candidates list: min..max entries, unique non-empty ids, and ALL of one mode.
export function parseCandidates(value: unknown, min: number, max: number): ParsedCandidates | { error: string } {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    return { error: `Send between ${min} and ${max} candidates.` };
  }

  const ids = new Set<string>();
  const saved: { id: string; resumeId: string }[] = [];
  const unsaved: { id: string; buffer: Buffer }[] = [];
  let totalBytes = 0;

  for (const item of value) {
    if (typeof item !== "object" || item === null) return { error: "Each candidate needs an id." };
    const { id, resumeId, resumePdf } = item as Record<string, unknown>;

    if (typeof id !== "string" || !id.trim() || id.length > MAX_CANDIDATE_ID_LENGTH) {
      return { error: "Each candidate needs an id (64 characters max)." };
    }
    if (ids.has(id)) return { error: "Candidate ids must be unique." };
    ids.add(id);

    if (resumePdf !== undefined) {
      const decoded = decodeResumePdf(resumePdf);
      if ("error" in decoded) return { error: decoded.error };
      totalBytes += decoded.buffer.length;
      if (totalBytes > MAX_TOTAL_RESUME_BYTES) return { error: "The resumes are too large together (30 MB max)." };
      unsaved.push({ id, buffer: decoded.buffer });
    } else if (typeof resumeId === "string" && resumeId) {
      saved.push({ id, resumeId });
    } else {
      return { error: "Each candidate needs a resumeId or a resumePdf." };
    }
  }

  if (saved.length > 0 && unsaved.length > 0) {
    return { error: "Send all candidates as saved resumes or all as PDFs, not a mix." };
  }

  return saved.length > 0 ? { mode: "saved", candidates: saved } : { mode: "private", candidates: unsaved };
}

// Reads each PDF in memory and redacts it. Returns candidate id -> redacted text, or null if a
// PDF has no readable text. The PDFs and texts are never written anywhere.
export async function readPrivateTexts(candidates: { id: string; buffer: Buffer }[]): Promise<Map<string, string> | null> {
  const texts = new Map<string, string>();
  for (const candidate of candidates) {
    let text: string;
    try {
      text = await textFromPdf(candidate.buffer);
    } catch {
      return null;
    }
    if (!text.trim()) return null;
    texts.set(candidate.id, redactContactInfo(text));
  }
  return texts;
}

function pairCount(candidates: number, rounds: number): number {
  return ((candidates * (candidates - 1)) / 2) * rounds;
}

// ===== handlers =====

// POST /api/rankings -> 201 { runId, totalTasks }
export const createRankingController = async (req: Request, res: Response) => {
  // the user comes from the token authMiddleware verified, never from the body -
  // the backend uses the service-role key, which skips Supabase's row-level security
  const userId: string = res.locals.user.id;
  const body = req.body ?? {};

  const requirements = parseRequirements(body.requirements);
  if (!requirements) {
    return res.status(400).json({ error: "A valid requirements list is required." });
  }

  const rounds = body.rounds ?? 2;
  if (rounds !== 1 && rounds !== 2) {
    return res.status(400).json({ error: "rounds must be 1 or 2." });
  }

  const parsed = parseCandidates(body.candidates, MIN_RANKING_CANDIDATES, MAX_RANKING_CANDIDATES);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  // saved runs only: the saved job this run belongs to (checked below); private jobs aren't stored
  const jobPostingId: unknown = body.jobPostingId;
  if (jobPostingId !== undefined && jobPostingId !== null && (typeof jobPostingId !== "string" || !jobPostingId)) {
    return res.status(400).json({ error: "jobPostingId must be a string." });
  }

  const apiKey = readApiKey(req);
  if (!apiKey) {
    return res.status(400).json({ error: "Add your OpenAI API key to run a ranking." });
  }

  const candidateIds = parsed.candidates.map((candidate) => candidate.id);
  const totalTasks = pairCount(candidateIds.length, rounds);

  try {
    if (parsed.mode === "saved") {
      // LOOK UP - only resumes this user owns; another user's ids come back as null
      for (const candidate of parsed.candidates) {
        if (!(await getResumeForUser(candidate.resumeId, userId))) {
          return res.status(404).json({ error: "Resume not found." });
        }
      }

      // LOOK UP - the job must be this user's too
      if (typeof jobPostingId === "string" && !(await getJobPostingForUser(jobPostingId, userId))) {
        return res.status(404).json({ error: "Job not found." });
      }

      const run = await createRun({
        userId,
        jobPostingId: typeof jobPostingId === "string" ? jobPostingId : null,
        mode: "saved",
        candidateIds,
        resumeIds: parsed.candidates.map((candidate) => candidate.resumeId),
        rounds,
        totalTasks,
        requirements,
      });
      // the runner reads the stored resumes itself, so it can also do that again after a restart
      startRun(run, apiKey);
      return res.status(201).json({ runId: run.id, totalTasks });
    }

    // PRIVATE - read + redact in memory; the texts go only to the runner's in-memory map
    const texts = await readPrivateTexts(parsed.candidates);
    if (!texts) {
      return res.status(400).json({ error: "Couldn't read the text in one of the PDFs." });
    }

    const run = await createRun({ userId, mode: "private", candidateIds, rounds, totalTasks, requirements });
    startRun(run, apiKey, texts);
    return res.status(201).json({ runId: run.id, totalTasks });
  } catch (error) {
    return sendError(res, "Ranking", error);
  }
};

// GET /api/rankings/:runId -> { run, lastSeq }
export const getRankingController = async (req: Request, res: Response) => {
  const userId: string = res.locals.user.id;
  const runId = String(req.params.runId ?? "");

  try {
    const run = await getRunForUser(runId, userId);
    if (!run) {
      return res.status(404).json({ error: "Run not found." });
    }

    const lastSeq = await getLastSeq(run.id);
    return res.json({
      run: {
        id: run.id,
        status: run.status,
        mode: run.mode,
        totalTasks: run.total_tasks,
        completedTasks: run.completed_tasks,
        result: run.result,
        error: run.error,
      },
      lastSeq,
    });
  } catch (error) {
    return sendError(res, "Ranking status", error);
  }
};

// POST /api/rankings/:runId/resume -> 202 { runId, totalTasks, completedTasks }
export const resumeRankingController = async (req: Request, res: Response) => {
  const userId: string = res.locals.user.id;
  const runId = String(req.params.runId ?? "");

  const apiKey = readApiKey(req);
  if (!apiKey) {
    return res.status(400).json({ error: "Add your OpenAI API key to run a ranking." });
  }

  try {
    const run = await getRunForUser(runId, userId);
    if (!run) {
      return res.status(404).json({ error: "Run not found." });
    }
    if (run.status === "completed") {
      return res.status(409).json({ error: "This run has already completed." });
    }
    if (run.mode === "private") {
      // the resumes only ever lived in memory; there's nothing to resume from
      return res.status(409).json({ error: "Private runs can't be resumed. Run it again." });
    }
    if (isRunActive(run.id)) {
      return res.status(409).json({ error: "This run is already in progress." });
    }

    startRun(run, apiKey);
    return res.status(202).json({ runId: run.id, totalTasks: run.total_tasks, completedTasks: run.completed_tasks });
  } catch (error) {
    return sendError(res, "Ranking resume", error);
  }
};

// DELETE /api/rankings/:runId -> 204. Owner only (404 otherwise); a run still executing in this
// process can't be deleted (409) - wait for it to finish.
export const deleteRankingController = async (req: Request, res: Response) => {
  const userId: string = res.locals.user.id;
  const runId = String(req.params.runId ?? "");

  try {
    const run = await getRunForUser(runId, userId);
    if (!run) {
      return res.status(404).json({ error: "Run not found." });
    }
    if (isRunActive(run.id)) {
      return res.status(409).json({ error: "This run is still in progress." });
    }

    if (!(await deleteRunForUser(run.id, userId))) {
      return res.status(404).json({ error: "Run not found." });
    }
    return res.status(204).end();
  } catch (error) {
    return sendError(res, "Ranking delete", error);
  }
};
