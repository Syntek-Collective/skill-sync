// Calls to the backend for the skill match, plus a small helper to run a batch a few at a time.

import type { CandidateResult, Requirement } from "./types";

// Where the backend lives. Empty (the default) means "this same site": in production the Express
// server also serves this React app, so "/api/..." just works. Locally, frontend/.env sets
// VITE_API_URL=http://localhost:3000 because Vite and Express run on different ports.
const API_URL = import.meta.env.VITE_API_URL ?? "";

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
