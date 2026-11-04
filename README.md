# SkillSync

SkillSync is a **skill match analyzer for recruiters**. Paste one job posting, add up to 10 resumes, and SkillSync ranks the candidates by how well each resume shows the job's requirements. Every score comes with the evidence behind it.

**Try it live:** https://skill-sync.up.railway.app (bring your own OpenAI API key)

It's a **review aid, not a hiring tool**. It shows what each resume does and doesn't show, with quotes. People make the decisions.

## How it works

1. **Add the job.** Paste the title and full posting.
2. **Add resumes.** Drag and drop (or pick) up to 10 PDFs, 5 MB each.
3. **Analyze.** SkillSync reads the job's requirements **once**, then checks every resume against that same list, so all candidates are scored on identical criteria.
4. **Review the ranking.** Each candidate shows:
   - a score and match band
   - each requirement as *met*, *partial* or *not shown*, with evidence quoted from the resume
   - strengths, concerns to check, and suggested interview questions
5. **Download** the results as a PDF report or a CSV.

### How the score works

The AI only judges each requirement. The score is calculated in code, so the same judgments always give the same score.

| | Weight / credit |
|---|---|
| Required requirement | counts **2×** |
| Preferred requirement | counts **1×** |
| Met / Partial / Not shown | **1** / **0.5** / **0** credit |

Score = earned ÷ possible × 100. Bands: **Strong match** (80+), **Partial match** (50–79), **Weak match** (below 50).

### Pairwise ranking

Per-candidate scores can drift a little between calls. **Pairwise ranking** is a second, more stable ordering:

- The AI compares candidates **two at a time** against the same requirement list and picks the stronger one (or a tie), citing the requirements that decided it. With 2 rounds, every pair is judged in **both orders** to cancel position bias.
- A **Bradley-Terry model** is fitted to those wins and losses (Hunter's MM algorithm, with a small prior so an undefeated candidate stays finite). Each candidate gets a latent **strength**; the ranking is the strengths in order.
- `npm run eval:stability` (in `backend/`) measures how well each method holds up across repeated runs: Kendall's tau between runs and top-1 agreement for pairwise vs. per-candidate scoring.

Ranking runs are **durable batches**. Their state and an append-only event log live in PostgreSQL, and progress streams to the browser over a **WebSocket** used as an event bus. A client that disconnects reconnects and resumes from the last event it saw, without restarting the run. The API routes and the WebSocket both require a verified Supabase login token (JWT). Details: [docs/RANKING.md](docs/RANKING.md).

### Bias audit

The **bias audit** measures whether a demographic signal changes the score, using **matched-pair counterfactuals**: the same resume is scored by the normal scorer in versions that differ only in one proxy, and the score difference isolates that attribute's effect.

| Proxy | What changes |
|---|---|
| Name (gender) | A male-coded vs. female-coded first name, same surname |
| Name (ethnicity) | A White-coded vs. Black-coded first name (lists from Bertrand & Mullainathan, 2004) |
| Pronouns | he/him vs. she/her vs. they/them |
| Graduation year | Degree years shifted 20 years earlier (an age proxy) |

Each version is scored several times to separate the effect from ordinary call-to-call noise. The report shows the **mean score change with a 95% bootstrap confidence interval**, how often the match band flips, and the **impact ratio** (four-fifths rule) for reaching *Strong match*. It's a diagnostic, not a fairness certification.

### Fairness

- Common contact details are removed from resume text before it goes to the AI: email addresses, North American-style phone numbers, and links starting with `http`/`www` or pointing to LinkedIn or GitHub. This is best-effort pattern matching, so other formats (for example some international phone numbers or bare domains like `portfolio.example.com`) can remain.
- The AI is told to ignore names, age, gender, ethnicity, photos, addresses, and anything that hints at them (like graduation years). It never mentions them.
- Requirements a resume can't show are left out: schedule, location, work authorization, personality traits.

## Privacy

**By default, SkillSync stores nothing.** The job text and resume PDFs stay in your browser tab and are sent along with each analysis request. The server reads each PDF in memory and discards it. Download your results before leaving the page; the app warns you if you haven't.

Saving is optional and **switched off by default** (`VITE_ENABLE_SAVED_JOBS`). When it's on and a recruiter ticks **"Save this job"**, the job, its resumes and its results are stored in their account and listed under **Past jobs**, where they can be deleted at any time.

**Bring your own key (BYOK):** each user pastes their own OpenAI API key. It's kept only in that browser tab and sent with each request, and the server never stores or logs it. The resume text goes to OpenAI under the user's key.

Full details: [docs/PRIVACY.md](docs/PRIVACY.md).

## Tech stack

- **Frontend:** React 19, Vite, Tailwind CSS, TypeScript
- **Backend:** Node, Express 5, TypeScript
- **Auth and optional storage:** Supabase (Postgres, Auth, Storage)
- **AI:** OpenAI Responses API with strict JSON-schema output. The model is set by `OPENAI_MODEL` (default `gpt-5-mini`).
- **Tests:** Jest (backend), plus an AI eval suite with a golden dataset

## Getting started

You'll need Node.js (developed on Node 22), a Supabase project, and an OpenAI API key to try the app.

```bash
git clone https://github.com/Syntek-Collective/skill-sync.git
cd skill-sync
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### Environment variables

Copy the examples and fill them in. Never commit the real `.env` files.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

| File | Variable | What it's for |
|---|---|---|
| `backend/.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Verifying logins and saved jobs (Supabase → Project Settings → API) |
| | `PORT` | API port (default `3000`) |
| | `CORS_ORIGIN` | Frontend URL(s) allowed to call the API, comma-separated (default `http://localhost:5173`) |
| | `OPENAI_MODEL` | Optional, default `gpt-5-mini` |
| | `OPENAI_API_KEY` | Only used by `npm run eval`. The app uses each user's own key. |
| `frontend/.env` | `VITE_API_URL` | Backend URL for local dev, e.g. `http://localhost:3000`. Leave unset in production (same site) |
| | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase project URL and public anon key |
| | `VITE_ENABLE_SAVED_JOBS` | `true` shows "Save this job" (off by default; see [DECISIONS.md](DECISIONS.md)) |

### Supabase

The app expects the tables `profiles`, `resumes`, `job_postings` and `analyses`, and private storage buckets `resumes` and `job-postings`. Column details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#data-model). SQL for these original tables isn't in the repo yet.

For pairwise ranking, run `backend/db/migrations/001_ranking_runs.sql` in the Supabase SQL Editor once. It creates `ranking_runs` and `ranking_events` with row-level security on.

**Keeping it awake:** Supabase pauses free-plan projects after about a week without activity. The [Supabase keep-alive](.github/workflows/supabase-keepalive.yml) GitHub Action pings the database once a day. It needs the repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Settings → Secrets and variables → Actions).

### Run it

From the repo root, one command starts both (the API on port 3000, the app on 5173):

```bash
npm install && npm run dev
```

Or run them in two terminals with `npm run dev` inside `backend/` and `frontend/`.

Open the URL Vite prints (usually http://localhost:5173), sign up, paste your OpenAI key, and add a job.

## Scripts

| Where | Command | What it does |
|---|---|---|
| root | `npm run dev` | Start the API and the app together (uses `concurrently`) |
| | `npm run build` / `npm start` | Production: install and build both apps / run the API, which also serves the app |
| `backend/` | `npm run dev` | Run the API with ts-node (restart it after code changes) |
| | `npm run build` / `npm start` | Compile to `dist/` / run the compiled API |
| | `npm test` | Jest unit tests (services are mocked; no network calls) |
| | `npm run eval` | Run the AI against the golden dataset (uses `OPENAI_API_KEY`, costs a few cents) |
| | `npm run eval:stability` | Compare run-to-run stability of pairwise (Bradley-Terry) vs. per-candidate ranking (uses `OPENAI_API_KEY`) |
| `frontend/` | `npm run dev` | Vite dev server with hot reload |
| | `npm run build` / `npm run preview` | Production build / preview it |
| | `npm run lint` | ESLint |

## Project structure

```
backend/src/
  app.ts, server.ts      Express setup and entry point
  routes/                URL → controller
  controllers/           request handling (analyze, history, rankings, bias audit)
  services/              OpenAI, Supabase, PDF text, scoring, redaction,
                         Bradley-Terry, pair schedule, pairwise judge,
                         counterfactuals, bias audit, ranking store and runner
  realtime/              WebSocket server and event bus for ranking runs
  middleware/            Supabase JWT verification
  prompt.ts              the AI prompts (requirements, match, pairwise)
  eval/                  golden dataset, eval runner, eval checks, stability eval
backend/db/migrations/   SQL for ranking_runs and ranking_events
  types/                 shared types
frontend/src/
  App.tsx                page state and the analyze flow
  components/            modals, results, pairwise ranking, bias audit, UI pieces
  matchApi.ts            calls to the backend
  rankingSocket.ts       WebSocket client with reconnect and resume
  exportResults.ts       CSV and PDF downloads
docs/                    architecture, privacy
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): request flow, API, scoring, data model
- [docs/RANKING.md](docs/RANKING.md): pairwise ranking, bias audit, ranking runs, WebSocket protocol
- [docs/PRIVACY.md](docs/PRIVACY.md): what is and isn't stored
- [DECISIONS.md](DECISIONS.md): why things are the way they are
- [CONTRIBUTING.md](CONTRIBUTING.md): workflow, conventions, tests and evals
- [SECURITY.md](SECURITY.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Deploy (Railway)

SkillSync deploys as **one service**: Express serves both the API and the built React app.

1. On [Railway](https://railway.com), create a project with **Deploy from GitHub repo** and pick this repo. Railway uses the root `npm run build` and `npm start`.
2. Under **Variables**, add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (optionally `OPENAI_MODEL`). Don't set `VITE_API_URL`, `PORT` or `CORS_ORIGIN`: the API is on the same site, and Railway provides the port.
3. Under **Settings → Networking**, click **Generate Domain**.
4. In Supabase → **Authentication → URL Configuration**, set **Site URL** (and add a redirect URL) to that domain, so sign-up emails link to the live app.

## Status

The recruiter skill match is live at https://skill-sync.up.railway.app, deployed as a single Railway service. Still to come: Supabase SQL migrations and the saved-jobs fixes listed in [DECISIONS.md](DECISIONS.md).

## License

[MIT](LICENSE)

## Team

Built by Kanami Anderson, Olivia Mckelvey, and Tanisha Thompson-Jones. Maintained under [Syntek Collective](https://github.com/Syntek-Collective).
