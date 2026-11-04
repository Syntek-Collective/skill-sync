// Calls to the backend for the skill match, plus a small helper to run a batch a few at a time.

import type {
  AttributeReport,
  Candidate,
  CandidateResult,
  Job,
  ProxyAttribute,
  RankingCandidateInput,
  RankingRun,
  Requirement,
} from "./types";

// Where the backend lives. Empty (the default) means "this same site": in production the Express
// server also serves this React app, so "/api/..." just works. Locally, frontend/.env sets
// VITE_API_URL=http://localhost:3000 because Vite and Express run on different ports.
const API_URL = import.meta.env.VITE_API_URL ?? "";
// the live ranking socket (rankingSocket.ts) is served by the same backend
export const API_BASE_URL: string = API_URL;

// ===== upload limits for PRIVATE (unsaved) ranking and audit runs =====
// Same numbers as the backend (backend/src/controllers/rankingController.ts): each PDF up to
// 5 MB, all PDFs in one request together up to 30 MB.
const MB = 1024 * 1024;
export const MAX_RESUME_BYTES = 5 * MB;
export const MAX_TOTAL_RESUME_BYTES = 30 * MB;

// Checks the PDFs a private run would send, before sending them. Returns a message to show,
// or null when they fit (or the job is saved, so only resume ids are sent).
export function privateUploadProblem(job: Job, candidates: Candidate[]): string | null {
  if (job.saved && job.id) return null;

  const tooBig = candidates.find((candidate) => (candidate.file?.size ?? 0) > MAX_RESUME_BYTES);
  if (tooBig) {
    return `${tooBig.fileName} is over ${MAX_RESUME_BYTES / MB} MB; private runs accept PDFs up to ${MAX_RESUME_BYTES / MB} MB each. Use a smaller PDF, or save the job.`;
  }

  const total = candidates.reduce((sum, candidate) => sum + (candidate.file?.size ?? 0), 0);
  if (total > MAX_TOTAL_RESUME_BYTES) {
    return `These resumes total ${Math.ceil(total / MB)} MB; private runs accept up to ${MAX_TOTAL_RESUME_BYTES / MB} MB at once. Use fewer or smaller PDFs, or save the job.`;
  }
  return null;
}

// an error the backend explained (e.g. a rejected OpenAI key), with its HTTP status
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function postJson<T>(
  path: string,
  accessToken: string,
  openaiKey: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-OpenAI-Key": openaiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // the backend sends a readable message; fall back to a generic one
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      errorBody?.error || "Something went wrong. Please try again.",
    );
  }

  return response.json() as Promise<T>;
}

// step 1 - once per job: the requirement list every resume is checked against.
// Unsaved jobs send the posting text ({ jobText }); saved jobs send their id ({ jobPostingId }).
export async function fetchRequirements(
  accessToken: string,
  openaiKey: string,
  body: { jobText: string } | { jobPostingId: string },
): Promise<Requirement[]> {
  const data = await postJson<{ requirements: Requirement[] }>(
    "/api/analyze/requirements",
    accessToken,
    openaiKey,
    body,
  );
  return data.requirements;
}

// step 2 - once per resume.
// Unsaved jobs send the PDF itself (base64); saved jobs send the stored resume + job ids.
export async function analyzeCandidate(
  accessToken: string,
  openaiKey: string,
  body:
    | { resumePdf: string; requirements: Requirement[] }
    | { resumeId: string; jobPostingId: string; requirements: Requirement[] },
): Promise<CandidateResult> {
  const data = await postJson<{ result: CandidateResult }>(
    "/api/analyze",
    accessToken,
    openaiKey,
    body,
  );
  return data.result;
}

async function getJson<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      errorBody?.error || "Something went wrong. Please try again.",
    );
  }

  return response.json() as Promise<T>;
}

// ===== Pairwise ranking and bias audit (docs/RANKING.md) =====

// The candidate list for POST /api/rankings and /api/bias-audit, decided the same way as
// analyzeCandidate: saved jobs send the stored resume ids, private jobs send each PDF (base64).
// The candidate's resumeId (a real row id, or the browser-made id for private jobs) is its id.
export async function buildRankingCandidates(
  job: Job,
  candidates: Candidate[],
): Promise<RankingCandidateInput[]> {
  if (job.saved && job.id) {
    return candidates.map((candidate) => ({
      id: candidate.resumeId,
      resumeId: candidate.resumeId,
    }));
  }
  return Promise.all(
    candidates.map(async (candidate) => ({
      id: candidate.resumeId,
      resumePdf: await fileToBase64(candidate.file as File),
    })),
  );
}

// Starts a pairwise ranking run in the background; progress then streams over the socket.
// Saved jobs also send jobPostingId, which links the run to the job: deleting the job deletes it.
export async function startRanking(
  accessToken: string,
  apiKey: string,
  body: {
    requirements: Requirement[];
    rounds: 1 | 2;
    candidates: RankingCandidateInput[];
    jobPostingId?: string;
  },
): Promise<{ runId: string; totalTasks: number }> {
  return postJson("/api/rankings", accessToken, apiKey, body);
}

// The saved job a ranking run belongs to: its id for saved jobs, nothing for private ones.
export function rankingJobLink(job: Job): { jobPostingId: string } | Record<string, never> {
  return job.saved && job.id ? { jobPostingId: job.id } : {};
}

// Permanently deletes a finished run and its stored events (owner only; 204).
export async function deleteRanking(accessToken: string, runId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/rankings/${encodeURIComponent(runId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(response.status, errorBody?.error || "Couldn't delete this run.");
  }
}

// The run's current state, e.g. to re-attach after a page refresh.
export async function getRanking(
  accessToken: string,
  runId: string,
): Promise<{ run: RankingRun; lastSeq: number }> {
  return getJson(`/api/rankings/${encodeURIComponent(runId)}`, accessToken);
}

// Continues a SAVED run that stalled or failed, skipping comparisons already done. Needs the
// OpenAI key again (keys are never stored). 202 on success; 409 when the run is private,
// already completed or already running.
export async function resumeRanking(
  accessToken: string,
  apiKey: string,
  runId: string,
): Promise<{ runId: string; totalTasks: number; completedTasks: number }> {
  return postJson(`/api/rankings/${encodeURIComponent(runId)}/resume`, accessToken, apiKey, {});
}

// Matched-pair counterfactual audit of the existing scorer. Can take a few minutes.
export async function runBiasAudit(
  accessToken: string,
  apiKey: string,
  body: {
    requirements: Requirement[];
    attributes: ProxyAttribute[];
    runs: 1 | 2 | 3;
    candidates: RankingCandidateInput[];
  },
): Promise<AttributeReport[]> {
  const data = await postJson<{ reports: AttributeReport[] }>(
    "/api/bias-audit",
    accessToken,
    apiKey,
    body,
  );
  return data.reports;
}

// Removes one of the user's saved jobs and everything saved with it (Past jobs -> Delete).
export async function deleteSavedJob(accessToken: string, jobPostingId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/history/${encodeURIComponent(jobPostingId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(response.status, errorBody?.error || "Couldn't delete this job.");
  }
}

// Reads a File into base64 text so the PDF can travel inside a normal JSON request.
// (FileReader gives "data:application/pdf;base64,AAAA..." - we keep only the part after the comma)
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Runs worker over items with at most `limit` running at once.
// Each worker handles its own errors; shouldStop lets the caller end the batch early
// (e.g. after OpenAI rejects the key, there's no point starting the rest).
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  let next = 0;

  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !shouldStop()) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });

  await Promise.all(lanes);
}
