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

// ===== Pairwise ranking and bias audit (docs/RANKING.md) =====

// one candidate's Bradley-Terry strength. Strengths are normalised to geometric mean 1.
export type BTStrength = {
  id: string;
  strength: number;
  logStrength: number;
  wins: number;
  losses: number;
  ties: number;
};

export type RankingResult = { strengths: BTStrength[]; iterations: number; converged: boolean };

export type RankingRunStatus = "queued" | "running" | "completed" | "failed" | "interrupted";

// GET /api/rankings/:runId -> run
export type RankingRun = {
  id: string;
  status: RankingRunStatus;
  mode: "saved" | "private";
  totalTasks: number;
  completedTasks: number;
  result: RankingResult | null;
  error: string | null;
};

// what the ranking and audit endpoints take for each candidate: saved jobs send the stored
// resume's id, private jobs send the PDF itself (base64, like /api/analyze)
export type RankingCandidateInput = { id: string; resumeId: string } | { id: string; resumePdf: string };

type RankingEventBase = { runId: string; seq: number };

// events streamed over the /ws socket
export type RankingEvent = RankingEventBase &
  (
    | { type: "run_started"; totalTasks: number }
    // a stopped saved run was resumed on the server; any earlier "failed" no longer applies
    | { type: "run_resumed"; completedTasks: number; totalTasks: number }
    | {
        type: "comparison";
        // seq is the task's place in the run's pair schedule (not the event seq)
        task: { seq?: number; a: string; b: string };
        winner: "a" | "b" | "tie";
        // null when replayed from a PRIVATE run: the reason is shown live but never stored
        reason: string | null;
        decidingRequirementIds: string[];
        completedTasks: number;
        totalTasks: number;
      }
    | { type: "standings"; strengths: BTStrength[] }
    | { type: "completed"; result: RankingResult }
    | { type: "failed"; error: string }
  );

export type ComparisonEvent = Extract<RankingEvent, { type: "comparison" }>;

export type ProxyAttribute = "name_gender" | "name_ethnicity" | "pronouns" | "graduation_year";

// the audit never returns the variant texts, only their labels
export type AuditPair = {
  candidateId: string;
  baseline: { label: string };
  variant: { label: string };
  baselineScore: number;
  variantScore: number;
  delta: number;
};

export type AttributeReport = {
  attribute: ProxyAttribute;
  pairs: AuditPair[];
  // variant - baseline, in score points
  meanDelta: number;
  ci95: [number, number];
  // share of pairs whose match band changed
  flipRate: number;
  // four-fifths rule: min/max "Strong match" rate across variant labels; null if none selected
  impactRatio: number | null;
};
