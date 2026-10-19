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

// one uploaded resume in the current run, and where its analysis stands
export type Candidate = {
  resumeId: string;
  fileName: string;
  filePath: string;
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
