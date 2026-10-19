# Privacy

SkillSync handles resumes, which are other people's personal information. It's built to keep as little of that as possible. This page describes what the code does, so anyone running or contributing to SkillSync can check it.

> This is a technical description of the open-source app, not a legal privacy policy. If you host SkillSync for others, you're responsible for your own policy and for following the laws that apply to you (for example GDPR, or local rules on automated hiring tools).

## The short version

- **By default, nothing is stored.** Job postings, resumes and results live only in your browser tab, and are gone when you leave or reload.
- **Saving is opt-in, per job.** If you tick **"Save this job"**, that job's posting, resumes and results are stored in your account until you delete the job.
- **Your OpenAI key is yours.** It stays in your browser tab and is sent with each analysis. The server uses it for that one call and never stores or logs it.
- **Resume text goes to OpenAI** under your key, with contact details removed first.

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
3. It replaces emails, phone numbers and links with `[email]`, `[phone]` and `[link]`.
4. It sends that text and the job's requirement list to OpenAI using **your** key.
5. It calculates the score and returns the result.

For a private job, nothing in that process is written to the database or to disk. Errors are logged without resume text, and OpenAI errors are logged by status code only, so a key can't leak into logs.

### What goes to OpenAI

The job posting text (to extract requirements) and each resume's redacted text (to match it). Requests use your own API key, so they fall under **your** OpenAI account and [OpenAI's API data policies](https://openai.com/policies/). SkillSync doesn't send names separately. Names inside the resume text aren't removed, but the AI is told to ignore them and never mention them.

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
  - the resume files and rows those results used
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
