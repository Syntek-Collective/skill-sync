# Architecture

How SkillSync works under the hood: the request flow, the API, scoring, and what's stored where. For *why* it's built this way, see [DECISIONS.md](../DECISIONS.md).

## Overview

```
Browser (React)                       Backend (Express)                  OpenAI
───────────────                       ─────────────────                  ──────
job text + resume PDFs ── HTTPS ───▶  auth check (Supabase token)
OpenAI key (header)                   read PDF in memory
                                      redact contact details
                                      ─────────────────────────────────▶ judge requirements
                                      score in code  ◀───────────────── (JSON schema)
ranked results  ◀──────────────────── result
```

- **The frontend** holds the current job, the resumes and the results. It runs the batch: one requirements call, then one analyze call per resume, **3 at a time** (`PARALLEL_ANALYSES` in `App.tsx`). Many short requests mean a big batch never hits a request timeout, and one bad resume doesn't stop the others.
- **The backend** checks the login, reads PDFs, calls OpenAI with the user's key, and calculates scores. It only writes to Supabase for **saved** jobs.
- **Supabase** handles login for everyone, and stores data only for jobs a recruiter chose to save.

## The two modes

| | **Private** (default) | **Saved** (opt-in: "Save this job") |
|---|---|---|
| Job posting | kept in the page, sent as `jobText` | stored in `job_postings`, sent as `jobPostingId` |
| Resume PDFs | kept in the page, sent as base64 `resumePdf` | uploaded to the `resumes` bucket + a `resumes` row, sent as `resumeId` |
| Results | returned only, not stored | also saved in `analyses.result` |
| After reload | gone (download first; the app warns you) | listed in **Past jobs**, deletable |
| 10-resume limit | checked in the browser | also checked on the server (`409`) |

The request body decides the mode on the server: ids mean saved, `resumePdf` or `jobText` means private.

## Analysis pipeline

1. **Extract requirements:** `POST /api/analyze/requirements`, once per job.
   - The AI (`requirementsPrompt`) lists up to **12** requirements, each marked `required` or `preferred`.
   - Ids (`r1`, `r2`, …) are assigned in code.
   - Things a resume can't show are skipped: schedule, location, work authorization, personality traits. Overlapping items are merged, and protected characteristics are never included.
2. **Match each resume:** `POST /api/analyze`, once per resume.
   - The PDF is turned into text (`pdfService`), then emails, phone numbers and links are replaced with `[email]` / `[phone]` / `[link]` (`redact.ts`).
   - The AI (`matchPrompt`) marks every requirement `met` / `partial` / `not_met` with evidence. It also returns a one-line summary, strengths, concerns and interview questions, while ignoring names, age and other protected traits.
   - Skills that are a standard part of a listed credential can count as `partial`, never `met`.
3. **Score in code** (`services/scoring.ts`):
   - `normalizeMatches` makes exactly one match per requirement, in order. Anything the AI skipped counts as `not_met`.
   - `computeScore` weighs required ×2 and preferred ×1, with credit met 1, partial 0.5, not met 0, then rounds earned ÷ possible × 100.
   - `scoreBand`: Strong match ≥ 80, Partial match ≥ 50, otherwise Weak match.

Both AI calls use the **Responses API with strict JSON schemas** (`openaiService.ts`), so the reply always parses into the expected shape. The model comes from `OPENAI_MODEL` (default `gpt-5-mini`). Reasoning models (`gpt-5*`, `o*`) get `reasoning.effort: "low"` for speed.

## API

All endpoints except `/api/test` need `Authorization: Bearer <Supabase access token>`. The analyze endpoints also need `X-OpenAI-Key: <user's key>`.

### `POST /api/analyze/requirements`

| Mode | Body |
|---|---|
| Private | `{ "jobText": "..." }` (max 20,000 characters) |
| Saved | `{ "jobPostingId": "..." }` (must belong to the user) |

**Response:** `{ "requirements": [{ "id": "r1", "requirement": "3+ years of Python", "importance": "required" }, ...] }`

### `POST /api/analyze`

| Mode | Body |
|---|---|
| Private | `{ "resumePdf": "<base64>", "requirements": [...] }`. The PDF must start with `%PDF-` and be ≤ 5 MB. |
| Saved | `{ "resumeId": "...", "jobPostingId": "...", "requirements": [...] }` |

`requirements` is the list from the step above, sent back unchanged (1–12 items, validated by `parseRequirements`).

**Response:** `{ "result": CandidateResult }`. Saved mode also returns `id` and `createdAt` of the saved row.

```ts
type CandidateResult = {
  version: 2;
  requirements: Requirement[];
  summary: string;
  matches: { requirementId: string; status: "met" | "partial" | "not_met"; evidence: string }[];
  strengths: string[];
  concerns: string[];
  interviewQuestions: string[];
  score: number;          // 0-100, calculated in code
  band: "Strong match" | "Partial match" | "Weak match";
};
```

This route accepts JSON bodies up to **8 MB** (to fit a base64 PDF). Every other route keeps Express's 100 KB default.

### `DELETE /api/history/:jobPostingId`

This is Past jobs → **Delete job**. It deletes the job's analyses, then each resume (file and row) those analyses used, unless another analysis still uses it, and finally the job posting. Responses: `204` on success, `404` if the job isn't the user's.

### `GET /api/history`

This is the original history endpoint. The current frontend loads Past jobs straight from Supabase instead and doesn't call it.

### Errors

Errors come back as `{ "error": "message for the user" }`.

| Status | When |
|---|---|
| `400` | Missing or invalid input (including broken JSON), a missing OpenAI key, or the key can't use the model |
| `401` | Not logged in, or OpenAI rejected the key |
| `404` | A saved resume, posting or job isn't the user's |
| `409` | A saved job already has 10 analyzed candidates |
| `413` | The request body is over the size limit (8 MB on `/api/analyze`, 100 KB elsewhere) |
| `429` | OpenAI rate limit, or the key is out of credit |
| `502` / `500` | OpenAI or the server failed |

OpenAI errors are logged by **status only**, because OpenAI's error text can echo part of the key.

## Data model

Supabase tables, as used by the app. Only **saved** jobs write to the last three.

| Table | Columns | Notes |
|---|---|---|
| `profiles` | `id`, `username`, `email`, `created_at`, `updated_at` | One per account |
| `job_postings` | `id`, `user_id`, `job_title`, `company_name`, `file_name`, `file_path`, `extracted_text`, `created_at` | `extracted_text` is the posting |
| `resumes` | `id`, `user_id`, `title`, `file_name`, `file_path`, `extracted_text`, `created_at`, `updated_at` | The PDF is in the `resumes` bucket at `file_path` (`<user id>/<timestamp>-<n>.pdf`, never the original file name) |
| `analyses` | `id`, `user_id`, `resume_id`, `job_posting_id`, `result` (jsonb), `created_at` | `result` is a `CandidateResult` (`version: 2`) |

**Storage buckets:** `resumes` and `job-postings`, both private.

**Older data:** rows from the earlier job-seeker version have a different `result` shape (no `version: 2`). They're kept but not shown.

**Access:** the browser uses the **anon key**, so Supabase row-level security is what keeps users' rows apart. The backend uses the **service-role key**, which bypasses row-level security. That's why every backend lookup filters by the verified user's id. The schema and policies aren't in the repo yet.

## Frontend map

| File | Role |
|---|---|
| `App.tsx` | Page state, `handleAnalyze` (the batch runner), downloads, the leave warning, Past jobs loading |
| `components/jobPostingModal.tsx` | Job title and text, the privacy note, the "Save this job" checkbox |
| `components/CandidateUploadModal.tsx` | Picking or dropping PDFs; uploads them only for saved jobs |
| `components/RankedResults.tsx` | Ready / queued list, the Analyze button with progress, ranked cards, download buttons |
| `components/PrintReport.tsx` | Print-only layout behind "Download PDF" |
| `components/HistoryModal.tsx` | Past jobs (saved only) and Delete job |
| `components/ApiKeyPanel.tsx` | The OpenAI key, kept in `sessionStorage` |
| `matchApi.ts` | Backend calls, `fileToBase64`, `runWithConcurrency` |
| `exportResults.ts` | CSV builder and download, `printResults` |

## Evals

`backend/src/eval/` runs the same pipeline against a golden dataset of resume and posting pairs (`npm run eval`). Each case checks:
- the band and score range
- requirements that should and shouldn't be met
- importance (required or preferred)

The pass/fail logic is in `evalChecks.ts`, with unit tests. Run the evals after changing a prompt or `OPENAI_MODEL`.
