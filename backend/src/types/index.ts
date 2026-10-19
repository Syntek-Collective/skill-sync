/*

    What is this file for?
    Holds the shared TypeScript types/interfaces - the "shapes" of our data that multiple 
    backend files use (e.g. what an analysis result looks like, what a history item looks like).

    Why?
    Define a shape ONCE here, import it wherever it's needed - instead of redefining the 
    same shape in every file. Keeps the data shapes consistent across the backend.

    TODO
    add types as they come up while building, e.g.:
    - the shape of an analysis result
    - the shape of a history item (should match the frontend's historyArray shape)
    - request/response shapes if helpful

    Coordinate with the team on:
    - keeping these shapes matched to what the frontend expects (and what gets saved in the db)

*/

// ===== SKILL MATCH (recruiter flow): one job posting, many resumes =====

//how much a requirement matters for the role
export type RequirementImportance = "required" | "preferred";

//one requirement pulled out of the job posting once, then reused for every resume
//so all candidates for a job are scored against the same list
export type Requirement = {
  id: string;
  requirement: string;
  importance: RequirementImportance;
};

export type MatchStatus = "met" | "partial" | "not_met";

//how one resume lines up with one requirement, with a short quote or paraphrase as evidence
export type RequirementMatch = {
  requirementId: string;
  status: MatchStatus;
  evidence: string;
};

//what the AI returns for one resume
export type CandidateMatch = {
  summary: string;
  matches: RequirementMatch[];
  strengths: string[];
  concerns: string[];
  interviewQuestions: string[];
};

export type MatchBand = "Strong match" | "Partial match" | "Weak match";

//what gets saved in analyses.result for each candidate (version 2 = recruiter format)
export type CandidateResult = CandidateMatch & {
  version: 2;
  requirements: Requirement[];
  score: number;
  band: MatchBand;
};
