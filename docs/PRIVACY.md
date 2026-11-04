# Privacy

SkillSync handles resumes, which are other people's personal information. It's built to keep as little of that as possible. This page describes what the code does, so anyone running or contributing to SkillSync can check it.

> This is a technical description of the open-source app, not a legal privacy policy. If you host SkillSync for others, you're responsible for your own policy and for following the laws that apply to you (for example GDPR, or local rules on automated hiring tools).

## The short version

- **By default, nothing is stored.** Job postings, resumes and results live only in your browser tab, and are gone when you leave or reload.
- **Saving is opt-in, per job.** If you tick **"Save this job"**, that job's posting, resumes and results are stored in your account until you delete the job.
- **Your OpenAI key is yours.** It stays in your browser tab and is sent with each analysis. The server uses it for that one call and never stores or logs it.
- **Resume text goes to OpenAI** under your key, with common contact details removed first. The removal is best-effort, so some formats can slip through (see below).

## What happens to each piece of data

| Data | Private job (default) | Saved job |
|---|---|---|
| Job posting text | Kept in the page; sent to the server with each requirements request; not stored | Stored in `job_postings` |
| Resume PDFs | Kept in the page; sent to the server with each analysis; read in memory, then discarded | Uploaded to the private `resumes` storage bucket, plus a row in `resumes` (file name, storage path) |
| Results (scores, evidence, notes) | Shown in the page; downloadable as PDF or CSV; not stored | Also stored in `analyses` |
| Your OpenAI key | In `sessionStorage` for that tab; sent in the `X-OpenAI-Key` header | Same |
| Your account | Email, username and login handled by Supabase Auth | Same |

### What the server does with a resume

1. It receives the PDF (base64 in the request body, max 5 MB) and checks it's a PDF.
2. It extracts the text in memory.
3. It replaces contact details it recognizes with `[email]`, `[phone]` and `[link]`: email addresses, North American-style phone numbers, and links starting with `http`/`www` or pointing to LinkedIn or GitHub. This is **best-effort**. Other formats (for example `+44 20 7946 0958` or a bare domain like `portfolio.example.com`) aren't recognized and are sent as-is.
4. It sends that text and the job's requirement list to OpenAI using **your** key.
5. It calculates the score and returns the result.

For a private job, nothing in that process is written to the database or to disk. Errors are logged without resume text, and OpenAI errors are logged by status code only, so a key can't leak into logs.

### What goes to OpenAI

The job posting text (to extract requirements) and each resume's redacted text (to match it). Requests use your own API key, so they fall under **your** OpenAI account and [OpenAI's API data policies](https://openai.com/policies/). Every call sends `store: false`, so OpenAI doesn't keep the response in your account's stored responses. That setting doesn't change OpenAI's own separate retention for abuse monitoring, which its policies describe. SkillSync doesn't send names separately. Names inside the resume text aren't removed, but the AI is told to ignore them and never mention them.

## Pairwise ranking and the bias audit

Both features use the same redacted resume text and your own OpenAI key, sent per request.

- **Pairwise ranking runs** are stored in `ranking_runs` and `ranking_events` so a run can survive a dropped connection. Those rows hold the requirement list, candidate ids, who won each comparison, and the requirement ids that decided it. **Never resume text.**
  - **Private runs:** the redacted resume texts are held in server memory only while the run is going, then cleared. The model's one-line reason for each comparison is streamed to your browser but **not stored**, because it can paraphrase a resume. If the server restarts mid-run, a private run is marked *interrupted* and you run it again.
    - **What a private run keeps after it ends:** the candidate ids (the app's own random ids, not names or file names), the job's requirement list, who won each comparison and which requirement ids decided it, and the final strengths. No resume text, no file names, no reasons. These rows stay until you click **Delete run** on the finished (or failed, or interrupted) run, or your account is deleted.
  - **Saved runs:** resume text is read from your saved PDFs when needed, and the reason for each comparison is stored with the run, capped at 500 characters. A saved run is linked to its job, so **Delete job** deletes it too. You can also delete one run with **Delete run**.
  - Every event is visible only to the user who started the run (row-level security, plus a user-id check on every backend query and on the WebSocket subscription).
- **Bias audit** results are computed and returned in one request and **not stored**. The counterfactual versions of each resume exist only in memory; the response contains labels and scores, not text.
- The names used by the bias audit are synthetic probes from published audit-study lists. They're added to the redacted text only for the audit and never stored. If a resume's first line looks like the candidate's own name, the probe name replaces that line in the audit copy, so each copy carries only one name.

## Fairness safeguards

SkillSync is a **review aid**. It shows what a resume does and doesn't show, and people make the decisions. To keep the analysis about the job:

- Requirements about protected characteristics are never extracted, even if a posting mentions them.
- Requirements a resume can't show are skipped: schedule, location, work authorization, personality traits.
- The AI is told to ignore names, age, gender, race, ethnicity, nationality, religion, disability, marital or family status, photos and addresses, and not to infer them (for example from graduation years).
- Employment gaps aren't counted against candidates.
- Every status comes with evidence from the resume, so a person can check it.

Some places regulate automated tools used in hiring (for example New York City's rules on automated employment decision tools, and the EU AI Act). If you use SkillSync for real hiring, check what applies to you.

## Saved jobs and deletion

- **Past jobs** lists only jobs you saved.
- **Delete job** permanently removes:
  - that job's results
  - that job's pairwise ranking runs and their stored comparisons
  - the resume files and rows those results used, **except** a resume another job's results still use (only possible with older data, where one resume could be analyzed for several jobs). That resume stays until the other job is deleted too.
  - the job posting
- **Not covered by Delete job yet:**
  - a resume uploaded to a saved job but never analyzed
  - deleting your whole account (no button exists yet)

## Your browser

- Your OpenAI key is in `sessionStorage`. It's cleared when the tab closes, when you click **Forget my key**, or when you log out.
- Private results exist only in the page. Use **Download PDF** or **Download CSV** to keep them. The app warns you before you leave with results you haven't downloaded.

## If you run your own copy

- The backend's `SUPABASE_SERVICE_ROLE_KEY` bypasses Supabase row-level security. Keep it secret and server-side only.
- Make sure row-level security is on for every table and bucket, so the browser's anon key can only reach each user's own rows.
- Your hosting provider may log request metadata (IP addresses, URLs). Request bodies, which hold the resumes, shouldn't be logged.
