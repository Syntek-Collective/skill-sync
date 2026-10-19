# Decisions

A log of the choices that shaped SkillSync and why we made them, so nobody has to guess from the code. Newest first. Add an entry when you make a decision someone might later ask "why?" about.

Each entry: **Decision**, **Why**, **Alternatives considered**, and **Status** (*decided*, *proposed*, or *open*).

---

## 2026-10-19: Private by default; saving is opt-in per job

**Decision:** Nothing is stored unless the recruiter ticks **"Save this job"** (off by default).
- Private jobs keep the posting and PDFs in the browser, send them with each request, and offer PDF and CSV downloads.
- Saved jobs work the earlier way and can be deleted from Past jobs.

**Why:** Resumes are other people's personal data. Not storing them removes most of the privacy risk, and most runs don't need to be revisited. Saving stays available for recruiters who want to come back to a job.

**Alternatives considered:**
- Remove history entirely. Rejected, so teammates can keep or return to it.
- A server-wide on/off setting. Rejected in favor of a per-job choice the recruiter controls.

**Also decided:** existing tables, stored data and the history code stay untouched. Nothing was deleted.

**Status:** decided

## 2026-10-19: PDFs travel as base64 in JSON

**Decision:** In private mode the browser sends each PDF base64-encoded inside the normal JSON request. `/api/analyze` accepts bodies up to 8 MB.

**Why:** It needs no new dependency (an upload library like `multer`) and keeps one request format.

**Alternatives considered:** multipart uploads with `multer`; extracting PDF text in the browser with pdf.js (a heavy dependency).

**Status:** decided

## 2026-10-19: Downloads are a PDF (via print) and a CSV, with no libraries

**Decision:** "Download PDF" opens the browser's print dialog on a print-only report (Save as PDF). "Download CSV" builds the file in the browser. The app warns before leaving with results that haven't been downloaded.

**Why:** Private results have to leave the page somehow. Both formats cover sharing with a hiring manager and pasting into a spreadsheet or hiring tool, without adding PDF or CSV libraries.

**Status:** decided

## 2026-10-19: Adding resumes and analyzing are separate steps

**Decision:** Uploading only adds resumes to the list ("Ready"). One **"Analyze N resumes"** button starts the analysis and shows progress for that batch. Later additions get "Analyze N new resumes".

**Why:** In testing, a resume added a moment later missed an auto-started batch, and "Waiting to run" read as already running.

**Alternatives considered:** auto-running after each upload. Tried, then reverted.

**Status:** decided

## 2026-10-19: Score in code, not by the AI

**Decision:** The AI only judges each requirement (met / partial / not met, with evidence). `scoring.ts` calculates the score: required ×2, preferred ×1, partial half credit. Bands are 80 and 50.

**Why:** The same judgments always give the same score, candidates are comparable, and the formula is visible and testable. Scores the AI picked itself drifted and couldn't be explained.

**Status:** decided

## 2026-10-19: Extract requirements once per job

**Decision:** One AI call pulls up to 12 requirements from the posting. Every resume for that job is matched against the same list.

**Why:** Ranking is only fair if every candidate is judged on identical criteria.

**Status:** decided

## 2026-10-19: Requirements stick to what a resume can show

**Decision:** The requirements prompt skips schedule, location, work authorization and personality traits, and merges overlapping items. The match prompt can give *partial* (never *met*) credit for skills that are a standard part of a listed credential.

**Why:** The yoga eval case scored 42% because of logistics items and three overlapping Pilates items, then 47% because core training skills counted as missing. After both prompt changes, the evals passed 6/6 (yoga case 59%, Partial).

**Status:** decided. Evals were run once per change, so run-to-run variance isn't measured yet.

## 2026-10-19: Model is a setting; default `gpt-5-mini`

**Decision:** `OPENAI_MODEL` picks the model, defaulting to `gpt-5-mini`, with low reasoning effort. Both AI calls use strict JSON-schema output.

**Why:** gpt-4o-mini was older and likely to be retired. A setting lets the evals compare models without code changes. Strict schemas mean the reply always parses.

**Status:** decided. Compare other models with `npm run eval` when useful.

## 2026-10-19: Bring your own key (BYOK)

**Decision:** Each user pastes their own OpenAI key. It's kept in `sessionStorage` (cleared when the tab closes or on "Forget my key"), sent in an `X-OpenAI-Key` header, used for one call, and never stored or logged by the server.

**Why:** Hosting the app shouldn't mean paying every user's OpenAI bill.

**Alternatives considered:**
- Memory only: re-enter on every reload. Barely safer, since a malicious script can read memory too.
- `localStorage`: kept indefinitely. Riskier.

The UI recommends a separate OpenAI project key with a monthly budget.

**Status:** decided

## 2026-10-19: Recruiter "skill match" instead of job-seeker "skill gap"

**Decision:** SkillSync is now for recruiters: one job posting, **up to 10 resumes**, ranked with evidence.

**Why:** It's how the team wants to market it, and real users are more likely to have one posting and many resumes.

**Guardrails:**
- Framed as a **review aid**, not a hiring decision.
- The AI ignores names, age and other protected traits.
- Common contact details are removed before the AI sees the text (best-effort pattern matching).

**Status:** decided (the team agreed to "skill match"; the recruiter direction followed from it)

## 2026-10-19: The analyze route trusts only the verified user

**Decision:** The backend takes the user from the verified Supabase token, never from the request body, and loads saved rows filtered by that user's id.

**Why:** The backend uses the service-role key, which bypasses row-level security. Before this fix, any signed-in user could analyze another user's resume by sending its path.

**Status:** decided

## 2026-10-19: Deploy-ready configuration

**Decision:** The port, the CORS origin and the frontend's API URL come from env vars (`PORT`, `CORS_ORIGIN`, `VITE_API_URL`). The backend gets `build` and `start` scripts, plus `.env.example` files.

**Status:** decided

## 2026-10-19: Stay on Supabase's free plan for now

**Decision:** Keep the free plan while building. Free projects pause after about a week without activity; this project was paused and restored on this date. A keep-alive ping or real traffic can prevent it, and Pro costs about $25/month.

**Status:** decided for now

## 2026-10-16: The repo moved to Syntek Collective

**Decision:** The project now lives at `Syntek-Collective/skill-sync` (a fresh copy made by a teammate). The original `Big-Porky-Girls/skill-sync` is archived.

**Status:** decided

---

## Open questions

- **Hosting:** one Railway service where Express also serves the React build, or separate frontend and backend services? *Proposed:* one service, which is simpler, cheaper, and needs no CORS setup.
- **License:** MIT was suggested; the team needs to choose.
- **Supabase schema:** export the tables, row-level security policies and storage policies as SQL migrations, so new contributors can set up a project.
- **Code of conduct contact:** who receives reports (see `CODE_OF_CONDUCT.md`).

## Known issues

- **Saved jobs with no results:** a saved job whose resumes were never analyzed (or all failed) doesn't appear in Past jobs, so it can't be deleted there. Past jobs is built from results, and new saved jobs can't be told apart from the older job-seeker postings without a schema change. *Fix:* add a job-to-resume table or a marker column. This is the first item for the schema migrations. (Copilot review on PR #1)
- **Delete job:** for the same reason, it doesn't remove resumes uploaded to a saved job but never analyzed. The same schema change fixes it.
- **Reloading:** a private job is lost on reload by design, so download first.
- **The 10-resume limit:** for saved jobs it can be slightly exceeded when several requests arrive at once (the count and the save aren't atomic). For private jobs it's enforced in the browser only. *Fix:* reserve a slot in the database before analyzing. Low impact, since each run uses the user's own key.
