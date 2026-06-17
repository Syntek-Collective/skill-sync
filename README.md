# SkillSync

SkillSync is a skill-gap analyzer that compares your resume against any job listing and shows you exactly what skills you're missing — so you know which jobs are realistic for you right now, and what to learn to close the gap.

## The Problem

When you're applying to 100+ jobs a week as a beginner, it's overwhelming — and the hardest part is that you can't tell which jobs are realistic for your current skill level, or what you'd need to learn to be ready. You end up applying blindly to roles you're not qualified for, or you don't know what to focus on. There's no clear signal connecting where your skills are to where a specific job needs them to be.

## The Solution

SkillSync compares your resume against the real requirements of any job listing and highlights exactly what's missing. You can use it two ways: to rule out jobs that aren't realistic for your skill level yet, or to see precisely what gaps to close for the jobs you're pursuing.

The hard part isn't listing requirements — it's making the analysis accurate and prioritized, which is where we focused our engineering.

## MVP Scope

The core features for the first working version:

- **Sign up / log in** — so the app knows who each user is (needed for saving your resume).
- **Save your resume once** — paste your resume and it's saved to your account, so you don't re-enter it every time.
- **Paste a job posting** — the per-session input you want to analyze.
- **Extract requirements from the posting** — the system pulls the required skills out of the unstructured job text.
- **Compare resume against requirements** — the matching engine that finds what lines up and what doesn't.
- **Generate the gap analysis** — the system shows what you have and what you're missing.
- **Display the results** — the user sees their skill gap clearly.

## Tough Technical Challenges

- **Messy, unstructured input.** Resumes come in all different formats and styles — separating the meaningful skills from the background noise is a real parsing problem.
- **Semantic matching.** A resume might say "built a REST API" while a posting asks for "backend experience" — same skill, different words. Matching by meaning rather than exact keywords is the only way this works.
- **Measuring accuracy.** How do we know the gap analysis is actually correct, and not making things up or missing real gaps? We plan to use a golden dataset (a set of test cases with known-correct answers) to evaluate the output.

## Stretch Goals

Features we'll add once the core MVP works:

- **PDF upload + text extraction** — let users upload their resume as a file (PDF), not just pasted text.
- **RAG matching layer** — upgrade the matching to use embeddings and a vector database (Pinecone + `text-embedding-3-small`) for more robust semantic matching.
- **Saved query history** — keep a list of every job analyzed and its skill gap.
- **Prioritization** — rank which gaps matter most for a given role.
- **Learning path** — map each gap to what to actually go learn.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node + Express
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **AI / LLM:** OpenAI (`gpt-4o-mini`)

In the MVP, the resume and job posting are both pasted as text. The job posting is sent to the LLM, which extracts the requirements as structured JSON. The LLM then compares the resume against those requirements directly and generates the gap analysis. (The RAG/embeddings approach is a stretch goal — the MVP uses direct LLM comparison to ship a working version faster.)

## Getting Started

1. Clone the repo: git clone https://github.com/Big-Porky-Girls/skill-sync.git
2. Install dependencies (npm install on front and back end)
3. Set up environment variables: create a `.env` file in the backend folder and add your OpenAI API key and Supabase URL + keys.
4. Run the apps: npm run dev (from the front & back end)



## Team

Built by the Big Porky Girls.