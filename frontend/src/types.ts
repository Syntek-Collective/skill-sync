// Shapes shared across the recruiter skill-match UI.
// They mirror backend/src/types/index.ts - keep the two in sync.

export type RequirementImportance = "required" | "preferred";

export type Requirement = {
  id: string;
  requirement: string;
  importance: RequirementImportance;
};

export type MatchStatus = "met" | "partial" | "not_met";

export type RequirementMatch = {
  requirementId: string;
  status: MatchStatus;
  evidence: string;
};

export type MatchBand = "Strong match" | "Partial match" | "Weak match";

// what the backend saves in analyses.result for each candidate
export type CandidateResult = {
  version: 2;
  requirements: Requirement[];
  summary: string;
  matches: RequirementMatch[];
  strengths: string[];
  concerns: string[];
  interviewQuestions: string[];
  score: number;
  band: MatchBand;
};

// the job the recruiter is working on right now.
// Private by default: an unsaved job lives only in this page (its text is sent with each request
// and nothing is stored). A saved job was stored in Supabase, so it has an id and shows in Past jobs.
export type Job = {
  title: string;
  text: string;
  saved: boolean;
  // the job_postings row id - only for saved jobs
  id: string | null;
};

// one resume in the current job, and where its analysis stands
export type Candidate = {
  // saved jobs: the resumes row id. Unsaved jobs: a random id made in the browser (nothing is stored)
  resumeId: string;
  fileName: string;
  // saved jobs only: where the PDF is stored in the "resumes" bucket
  filePath?: string;
  // unsaved jobs only: the PDF itself, kept in memory and sent with the analysis request
  file?: File;
  status: "pending" | "running" | "done" | "error";
  result?: CandidateResult;
  error?: string;
};

// a past job with its analyzed candidates, for the history view
export type JobHistory = {
  jobPostingId: string;
  jobTitle: string;
  lastAnalyzedAt: string;
  candidates: { analysisId: string; fileName: string; result: CandidateResult }[];
};

// older job-seeker analyses are saved in a different shape; only version 2 is shown
export function isCandidateResult(value: unknown): value is CandidateResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 2
  );
}
