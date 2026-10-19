# Security Policy

SkillSync handles resumes and users' OpenAI API keys, so we take security reports seriously. Thank you for helping keep it safe.

## Reporting a vulnerability

**Please don't open a public issue for security problems.** Report them privately through GitHub instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the problem, how to reproduce it, and what an attacker could do with it.

> Maintainers: this uses GitHub's **private vulnerability reporting**. Turn it on under **Settings → Code security → Private vulnerability reporting** before publishing.

We'll acknowledge your report as soon as we can, keep you updated while we fix it, and credit you if you'd like.

## Scope

Things we especially want to hear about:

- One user being able to read, analyze, or delete another user's resumes, jobs, or results
- A way to make the server store or log resume text, job postings, or API keys when it shouldn't
- An OpenAI key leaking (into logs, error messages, URLs, or other users' requests)
- Bypassing login on the API
- Ways to run code in another user's browser (cross-site scripting)

Not in scope: bugs in third-party services themselves (Supabase, OpenAI, the host). Report those to their vendors.

## How SkillSync protects data

A quick summary for reviewers. Details are in [docs/PRIVACY.md](docs/PRIVACY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- **Logins:** every API route except a health check requires a valid Supabase login token. The backend takes the user's identity from that token, never from the request body.
- **Saved data:** the backend uses Supabase's service-role key, which bypasses row-level security, so every lookup is filtered by the verified user's id. The browser uses the public anon key and relies on row-level security.
- **API keys:** users' OpenAI keys are sent per request in a header, used for one call, and never stored or logged. OpenAI errors are logged by status code only.
- **Private by default:** unless a recruiter opts in to saving a job, resumes are read in memory and discarded.
- **Uploads:**
  - **Private jobs:** the server enforces the limits. PDFs must be 5 MB or smaller and start with a PDF header.
  - **Saved jobs:** the browser uploads PDFs straight to Supabase Storage after its own size and type checks. The server doesn't repeat those checks when it later downloads the file, so treat them as client-side only, and set a file size limit on the `resumes` storage bucket.
  - Stored files never use the original file name.

## For contributors

- Never commit `.env` files or real keys. Use `.env.example` with placeholder values.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. Never use it in the frontend or put it in a `VITE_` variable.
- Don't log resume text, job posting text, request bodies, or keys.
- Never commit real resumes or candidate data. Use made-up examples.
