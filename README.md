# SkillSync

SkillSync is a **skill match analyzer for recruiters**. Paste one job posting, add up to 10 resumes, and SkillSync ranks the candidates by how well each resume shows the job's requirements. Every score comes with the evidence behind it.

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

### Fairness

- Common contact details are removed from resume text before it goes to the AI: email addresses, North American-style phone numbers, and links starting with `http`/`www` or pointing to LinkedIn or GitHub. This is best-effort pattern matching, so other formats (for example some international phone numbers or bare domains like `portfolio.example.com`) can remain.
- The AI is told to ignore names, age, gender, ethnicity, photos, addresses, and anything that hints at them (like graduation years). It never mentions them.
- Requirements a resume can't show are left out: schedule, location, work authorization, personality traits.

## Privacy

**By default, SkillSync stores nothing.** The job text and resume PDFs stay in your browser tab and are sent along with each analysis request. The server reads each PDF in memory and discards it. Download your results before leaving the page; the app warns you if you haven't.

If a recruiter ticks **"Save this job"**, the job, its resumes and its results are stored in their account and listed under **Past jobs**, where they can be deleted at any time.

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
| `frontend/.env` | `VITE_API_URL` | Backend URL, e.g. `http://localhost:3000` |
| | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase project URL and public anon key |

### Supabase

The app expects the tables `profiles`, `resumes`, `job_postings` and `analyses`, and private storage buckets `resumes` and `job-postings`. Column details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#data-model). SQL migrations for the schema and row-level security aren't in the repo yet.

### Run it

In two terminals:

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

Open the URL Vite prints (usually http://localhost:5173), sign up, paste your OpenAI key, and add a job.

## Scripts

| Where | Command | What it does |
|---|---|---|
| `backend/` | `npm run dev` | Run the API with ts-node (restart it after code changes) |
| | `npm run build` / `npm start` | Compile to `dist/` / run the compiled API |
| | `npm test` | Jest unit tests (services are mocked; no network calls) |
| | `npm run eval` | Run the AI against the golden dataset (uses `OPENAI_API_KEY`, costs a few cents) |
| `frontend/` | `npm run dev` | Vite dev server with hot reload |
| | `npm run build` / `npm run preview` | Production build / preview it |
| | `npm run lint` | ESLint |

## Project structure

```
backend/src/
  app.ts, server.ts      Express setup and entry point
  routes/                URL → controller
  controllers/           request handling (analyze, history)
  services/              OpenAI, Supabase, PDF text, scoring, redaction
  prompt.ts              the two AI prompts (requirements, match)
  eval/                  golden dataset, eval runner, eval checks
  types/                 shared types
frontend/src/
  App.tsx                page state and the analyze flow
  components/            modals, results, print report, UI pieces
  matchApi.ts            calls to the backend
  exportResults.ts       CSV and PDF downloads
docs/                    architecture, privacy
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): request flow, API, scoring, data model
- [docs/PRIVACY.md](docs/PRIVACY.md): what is and isn't stored
- [DECISIONS.md](DECISIONS.md): why things are the way they are
- [CONTRIBUTING.md](CONTRIBUTING.md): workflow, conventions, tests and evals
- [SECURITY.md](SECURITY.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Status

The recruiter skill match is working locally. Still to come: a deployment, a license, and Supabase SQL migrations.

## Team

Originally built by the Big Porky Girls; now maintained under [Syntek Collective](https://github.com/Syntek-Collective).
