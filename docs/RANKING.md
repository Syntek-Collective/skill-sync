# Pairwise ranking and bias audit

Two features added next to the original per-candidate scoring (which is unchanged):

1. **Pairwise ranking.** The model compares candidates two at a time against the job's requirements. A Bradley-Terry model is fitted to those wins and losses to recover each candidate's latent strength. Comparative judgments are more consistent than absolute 0-100 scores, which drift between calls; `npm run eval:stability` measures this.
2. **Bias audit.** Matched-pair counterfactuals: the same resume is scored twice by the existing scorer, identical except for one demographic proxy. The score difference isolates that attribute's effect.

Ranking runs are batch jobs whose state is stored in PostgreSQL (Supabase). Progress streams over a WebSocket used as an event bus. A client that disconnects and reconnects resumes mid-run from the last event it saw instead of restarting.

## Backend modules (backend/src)

### services/bradleyTerry.ts (pure, no I/O)

```ts
export type Outcome = { a: string; b: string; result: 'a' | 'b' | 'tie' }
export type BTStrength = { id: string; strength: number; logStrength: number; wins: number; losses: number; ties: number }
export type BTFit = { strengths: BTStrength[]; iterations: number; converged: boolean }
// MM algorithm (Hunter 2004). Ties count as half a win to each side.
// A small symmetric prior (one virtual tie with every other candidate, weight `prior`, default 0.5)
// keeps strengths finite when a candidate wins or loses every comparison or the graph is disconnected.
// Strengths are normalised to geometric mean 1. Returned sorted by strength, descending.
export function fitBradleyTerry(ids: string[], outcomes: Outcome[], opts?: { prior?: number; maxIterations?: number; tolerance?: number }): BTFit
export function winProbability(si: number, sj: number): number // si / (si + sj)
export function kendallTau(rankingA: string[], rankingB: string[]): number // over the shared ids, -1..1
```

### services/pairSchedule.ts (pure)

```ts
export type PairTask = { seq: number; a: string; b: string } // a is shown first ("Candidate A")
// Every unordered pair once per round. Round r alternates presentation order so each pair is seen
// in both orders across 2 rounds, cancelling position bias. Order of tasks is deterministic for a seed.
export function buildSchedule(ids: string[], rounds: number, seed: string): PairTask[]
```

### services/pairwiseJudge.ts (OpenAI, same BYOK + store:false + modelSettings pattern as openaiService.ts)

```ts
export type PairJudgment = { winner: 'A' | 'B' | 'tie'; reason: string; decidingRequirementIds: string[] }
// Both resume texts must already be redacted (redactContactInfo).
export async function judgePair(apiKey: string, requirements: Requirement[], resumeA: string, resumeB: string): Promise<PairJudgment>
```
The prompt lives in prompt.ts as `pairwisePrompt`. Strict JSON schema.

### services/counterfactual.ts (pure) and services/biasAudit.ts

```ts
export type ProxyAttribute = 'name_gender' | 'name_ethnicity' | 'pronouns' | 'graduation_year'
export type Variant = { label: string; text: string }
// Builds matched variants of ONE resume that differ only in the chosen proxy.
// name_*: prepends/replaces a "Name: <first> <last>" header line using fixed, documented name lists
//         (audit-study style; e.g. Bertrand & Mullainathan 2004). Each variant uses the same surname.
//         An existing "Name: ..." line is replaced; so is a first non-empty line that looks like the
//         candidate's own name (2-4 capitalised words, letters/hyphens/apostrophes only, under 40
//         characters), so a variant never carries two names. Otherwise the header is prepended.
// pronouns: rewrites he/him/his <-> she/her/hers <-> they/them/their.
// graduation_year: shifts 4-digit years 1950-2035 on education lines by a fixed offset (-20 years)
//         as an age proxy. Education lines: inside an Education section (a heading like "EDUCATION",
//         "Education:", "Academic ...", "Qualifications" up to the next ALL-CAPS heading, or Title Case
//         heading ending in ":" or after a blank line), or lines with an explicit degree token (B.S., BS,
//         BSc, B.A., BA, M.S., MS, MSc, MBA, PhD, Ph.D., Bachelor of/'s, Master of/'s, Doctor of,
//         Associate of, Associate's degree, diploma, ...). Bare "university", "college", "graduate" or
//         "associate" don't count, so job dates ("Associate Software Engineer, 2019 - 2022") stay put.
// Returns [] if the proxy can't be applied to this resume (e.g. no years found).
export function buildVariants(resumeText: string, attribute: ProxyAttribute): Variant[]

export type AuditPair = { candidateId: string; baseline: Variant; variant: Variant; baselineScore: number; variantScore: number; delta: number }
export type AttributeReport = {
  attribute: ProxyAttribute
  pairs: AuditPair[]
  meanDelta: number            // variant - baseline, score points
  ci95: [number, number]       // paired bootstrap, 2000 resamples, seeded
  flipRate: number             // share of pairs whose match band changed
  impactRatio: number | null   // four-fifths rule: min/max selection rate (band = Strong match) across variant labels; null if none selected
}
// Scores each variant with the EXISTING scorer (matchResume + normalizeMatches + computeScore), so the audit tests the real pipeline.
// `runs` repeats each variant to separate the attribute effect from ordinary call-to-call noise; scores are averaged per variant.
export async function runBiasAudit(apiKey: string, requirements: Requirement[], resumes: { id: string; text: string }[], attributes: ProxyAttribute[], opts?: { runs?: number; seed?: string; concurrency?: number }): Promise<AttributeReport[]>
```

### eval/stabilityEval.ts — `npm run eval:stability`

Uses the golden dataset (eval/goldenDataset.ts). Runs pointwise scoring K times (default 3) and pairwise BT ranking K times on the same candidates, and prints: per-candidate score std-dev across runs (pointwise), mean pairwise Kendall tau between runs for each method, and top-1 agreement. Needs OPENAI_API_KEY. Pure helpers (stats, tau) are unit tested; the runner is not run in CI.

## Durable batch state (PostgreSQL / Supabase)

Migration: `backend/db/migrations/001_ranking_runs.sql` (idempotent, `create table if not exists`, RLS enabled, owner-only select policies). It needs the app's existing `job_postings` table.

```
ranking_runs(id uuid pk default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_posting_id uuid null references job_postings(id) on delete cascade,
  mode text check (mode in ('saved','private')), status text check (status in ('queued','running','completed','failed','interrupted')),
  candidate_ids text[] not null, resume_ids text[] null, rounds int not null, total_tasks int not null, completed_tasks int not null default 0,
  requirements jsonb not null, result jsonb null, error text null, created_at timestamptz default now(), updated_at timestamptz default now())
ranking_events(run_id uuid references ranking_runs(id) on delete cascade, seq int not null, type text not null,
  payload jsonb not null, created_at timestamptz default now(), primary key (run_id, seq))
```
`job_posting_id` is set for saved runs started from a saved job (the frontend sends it), so **deleting the job deletes its runs** (and their events): through the foreign key, and also explicitly in `deleteSavedJob` (supabaseService.ts) for databases where the key is missing. Deleting a user deletes their runs. For databases created before these keys existed, the migration adds both in `do $$ ... $$` blocks that check `pg_constraint` first (Postgres has no `add constraint if not exists`), as `not valid` so existing rows aren't checked.

**Before the migration is run** the rest of the app works: on boot `markInterruptedRunsOnBoot` logs one line ("Ranking tables not found ...") and the server keeps serving `/api/analyze` and `/api/history`; `deleteSavedJob` skips the ranking tables when they don't exist (PostgREST `PGRST205` / Postgres `42P01`).

`resume_ids` is set for saved runs only: the resume row id for each entry of `candidate_ids` (same order), so the runner can re-read the resumes after a restart. It is `null` for private runs. The migration also runs `alter table ... add column if not exists resume_ids` for databases created before the column existed.

`ranking_events` is the append-only event log. Payloads never contain resume text. Comparison events hold only candidate ids, winner, reason (saved runs only, capped at 500 characters), and requirement ids.

Privacy: **saved** runs re-read each resume's stored PDF (owner-checked via `resumes.file_path`), extract its text and redact it in memory, so they can resume even after a server restart. **Private** runs keep the redacted texts in server memory only for the life of the run; if the server restarts, the run is marked `interrupted` and the user re-runs it. Nothing about a private run's resumes is written to the database: the model's comparison reason can paraphrase resume content, so a private run's stored `comparison` event has `reason: null`. The reason is only sent live over the WebSocket (same `seq`); a client that replays the run later sees no reason (the UI shows "reason not stored for private runs").

### services/rankingStore.ts — Supabase data access (service-role client, every query filtered by user_id)
### services/rankingRunner.ts — executes a run: builds the schedule, skips tasks already present in ranking_events (resume after restart or failure; a resumed run emits `run_resumed` instead of a second `run_started`), judges with concurrency 3, appends one `comparison` event per task, refits BT after each event and emits `standings`, writes `result` and `completed`. Emits every event to the event bus after it's persisted (for private runs the published comparison additionally carries the reason that isn't stored).
### realtime/eventBus.ts — in-process EventEmitter keyed by run id.

**Limitation: single process.** The event bus lives in one Node process, and so does the set of active runs. With several backend instances, a client connected to instance B would never see events published by a run executing on instance A (and B could start the same run again). Multi-instance deployments need a shared bus — Postgres `LISTEN/NOTIFY` or Supabase Realtime on `ranking_events` — with the same publish/subscribe shape, plus a cross-instance lock on running a run.
### realtime/wsServer.ts — `ws` WebSocketServer at path `/ws` attached to the same HTTP server (server.ts uses `http.createServer(app)`).

## HTTP API (all routes use the existing authMiddleware: Supabase JWT in `Authorization: Bearer`)

Size limits: `/api/rankings` and `/api/bias-audit` accept JSON bodies up to **41mb** (app.ts). app.ts runs `authMiddleware` for these two paths **before** that parser (`app.use([...], authMiddleware, express.json({ limit: '41mb' }))`), so a request without a valid token gets 401 without its body being read; their routers don't repeat the check. The controllers cap each decoded PDF at **5 MB** and all PDFs in one request at **30 MB** (`MAX_RESUME_BYTES` / `MAX_TOTAL_RESUME_BYTES` in rankingController.ts; base64 adds about a third, hence 41mb). The frontend checks the same limits before sending a private run (`matchApi.ts`).

- `POST /api/rankings` body `{ requirements, rounds?: 1|2 (default 2), candidates: [{ id, resumeId } ], jobPostingId? }` (saved; `jobPostingId` must be one of the user's saved jobs, else 404, and is stored on the run) or `{ requirements, rounds?, candidates: [{ id, resumePdf }] }` (private, base64 like /api/analyze). Header `x-openai-key`. 2-10 candidates. → `201 { runId, totalTasks }`. The run starts in the background.
- `GET /api/rankings/:runId` → `{ run: { id, status, mode, totalTasks, completedTasks, result, error }, lastSeq }` (owner only, else 404).
- `DELETE /api/rankings/:runId` → `204`. Deletes the run and its events (owner only, else 404; `409` while it's executing). The panel shows a "Delete run" link for completed, failed and interrupted runs.
- `POST /api/rankings/:runId/resume` header `x-openai-key` (keys are never stored, so it's needed again) → `202 { runId, totalTasks, completedTasks }`. Continues a **saved** run that stalled (e.g. server restart left it `running`) or `failed`, skipping comparisons already stored. `409` if the run is private, already completed, or already running in this process; `404` if not the owner's. The frontend offers "Resume run" for a saved run that is `failed` or has had no event for 20s, and on 409 refreshes the status via GET.
- `POST /api/bias-audit` body `{ requirements, attributes: ProxyAttribute[], runs?: 1-3 (default 2), candidates: same shapes as above (1-5) }` → `200 { reports: AttributeReport[] }` (variant texts are NOT returned, only labels and scores). **Synchronous**: the request stays open until every variant is scored (every variant of up to 5 resumes, for each chosen attribute, `runs` times), which can take minutes. A proxy, load balancer or browser timeout can cut it off and the work is lost; making it a background run like rankings would fix that.

## WebSocket protocol (`/ws`)

Client → server, first message within 10s or the socket is closed with code 4401:
`{ "type": "auth", "token": "<supabase access token>" }` → server verifies with `supabase.auth.getUser` → `{ "type": "auth_ok" }`. The server then reads the token's `exp` (base64url-decoding the JWT payload, not as verification) and closes the socket with **4401** when it passes. The client reconnects with a fresh token; its "stop after 3 consecutive 4401s" rule resets on every `auth_ok`, so a routine expiry never counts toward it.
`{ "type": "subscribe", "runId": "...", "lastSeq": 0 }` → server checks ownership, replays every persisted event with `seq > lastSeq` in order, then streams live ones. It subscribes to the bus before reading the replay and dedupes by `seq`; when the same `seq` is both replayed and buffered live, the live payload is sent (it may carry a private run's reason). Unknown or foreign run → `{ "type": "error", "message": "Run not found" }`.
Server → client events (all carry `runId` and `seq`):
- `{ type: "run_started", totalTasks }`
- `{ type: "run_resumed", completedTasks, totalTasks }` — a stopped run was resumed; any earlier `failed` in the log no longer applies
- `{ type: "comparison", task: { seq, a, b }, winner: "a"|"b"|"tie", reason, decidingRequirementIds, completedTasks, totalTasks }` — `task.seq` is the task's index in the pair schedule (used to skip done tasks on resume), distinct from the event `seq`. `reason` is `null` when a private run's event is replayed from the database.
- `{ type: "standings", strengths: BTStrength[] }`
- `{ type: "completed", result: { strengths: BTStrength[], iterations, converged } }`
- `{ type: "failed", error }`
Heartbeat: server pings every 30s; client reconnects with exponential backoff (1s, 2s, 4s… max 15s) and re-subscribes with the highest `seq` it has.

Client state (frontend `rankingRun.ts`): after a refresh the panel GETs the run (`lastSeq` = the latest event at load time) and replays from 0. A resumed run's log still holds its old `failed`, so `failed` never overrides `completed`, progress events (`comparison`, `standings`, `run_resumed`) after a `failed` set the status back to running, and a `failed` is only terminal (close the socket, allow a new run) when its `seq` ≥ the snapshot's `lastSeq` — every live failure qualifies. After a socket reconnect, and whenever no event has arrived for 20s (any mode), the panel re-GETs the run, so a private run interrupted by a server restart (which sends no event) shows *interrupted* instead of spinning.
