/*
  RANKED RESULTS

  Shows every candidate for the current job, best match first.
  Each card shows the score and a one-line summary; "View details" opens the requirement-by-
  requirement breakdown with the resume evidence, strengths, concerns and interview questions.

  The score comes from the backend (calculated in code from the met / partial / not met
  judgments), so this component only displays - it doesn't calculate anything.
*/

import { useState } from "react";

import Button from "./ui/Button";
import Loading from "./ui/Loading";
import type { Candidate, CandidateResult, MatchStatus } from "../types";

const STATUS_LABEL: Record<MatchStatus, string> = {
  met: "Met",
  partial: "Partial",
  not_met: "Not shown",
};

const STATUS_STYLE: Record<MatchStatus, string> = {
  met: "bg-green-100 text-green-800",
  partial: "bg-yellow-100 text-yellow-800",
  not_met: "bg-red-100 text-red-700",
};

// color the score bar based on the band thresholds (80 / 50)
function scoreColor(score: number) {
  if (score >= 80) return "bg-green-600";
  if (score >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

// reminder that this is a review aid, shown with every ranking
export function ReviewAidNote() {
  return (
    <p className="mt-2 text-xs text-[#5f6b61]">
      Scores reflect only what each resume shows for this job's requirements. Use them to
      guide your review; you make the hiring decisions.
    </p>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-green-950">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-[#4f5f52]">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

type CandidateCardProps = {
  rank: number;
  fileName: string;
  result: CandidateResult;
};

// one analyzed candidate - also used by the history view
export function CandidateCard({ rank, fileName, result }: CandidateCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusById = new Map(result.matches.map((match) => [match.requirementId, match]));

  return (
    <div className="rounded-md border border-green-900/10 bg-white p-4 text-left">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-green-950">
          #{rank} <span className="font-normal">{fileName}</span>
        </p>
        <p className="shrink-0 text-xs text-[#4f5f52]">{result.band}</p>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className="w-12 text-lg font-bold text-green-950">{result.score}%</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-green-900/10">
          <div
            className={`h-full rounded-full ${scoreColor(result.score)}`}
            style={{ width: `${result.score}%` }}
          />
        </div>
      </div>

      <p className="mt-2 text-sm text-[#4f5f52]">{result.summary}</p>

      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-2 text-xs font-medium text-green-700 hover:opacity-70"
      >
        {isExpanded ? "Hide details ▲" : "View details ▼"}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3 border-t border-green-900/10 pt-3">
          <div>
            <p className="text-xs font-semibold uppercase text-green-950">Requirements</p>
            <ul className="mt-1 space-y-2">
              {result.requirements.map((requirement) => {
                const match = statusById.get(requirement.id);
                const status = match?.status ?? "not_met";
                return (
                  <li key={requirement.id} className="text-xs text-[#4f5f52]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="font-medium text-green-950">
                        {requirement.requirement}
                      </span>
                      <span className="opacity-60">({requirement.importance})</span>
                    </div>
                    {match?.evidence && (
                      <p className="mt-0.5 pl-1 italic">“{match.evidence}”</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <BulletList title="Strengths" items={result.strengths} />
          <BulletList title="Concerns to check" items={result.concerns} />
          <BulletList title="Interview questions" items={result.interviewQuestions} />
        </div>
      )}
    </div>
  );
}

type RankedResultsProps = {
  jobTitle: string;
  candidates: Candidate[];
  // remove a resume that hasn't been analyzed yet
  onRemove: (candidate: Candidate) => void;
  // true while an "Analyze" click is being processed
  isRunning: boolean;
  // starts the analysis for every resume not analyzed yet (App.tsx handleAnalyze)
  onAnalyze: () => void;
  // how many resumes the next Analyze click would process (new ones + failed ones)
  toAnalyzeCount: number;
  // the Analyze button is disabled until an OpenAI key is saved
  hasKey: boolean;
  // e.g. "Analyzing 2 of 3..." - shown on the button while a batch runs
  progressText: string;
  // whether this job is saved to the account (Past jobs) or private to this page
  isSaved: boolean;
  // download the ranked results as a CSV / as a PDF (print dialog)
  onDownloadCsv: () => void;
  onDownloadPdf: () => void;
};

// Two modes in one card:
//  - adding: resumes show as "Ready" and nothing runs until the recruiter clicks Analyze,
//    so they can keep adding or removing resumes first
//  - analyzing: the button shows progress, rows show Queued / Analyzing, and finished
//    candidates move into the ranked list above as they complete
function RankedResults({
  jobTitle,
  candidates,
  onRemove,
  isRunning,
  onAnalyze,
  toAnalyzeCount,
  hasKey,
  progressText,
  isSaved,
  onDownloadCsv,
  onDownloadPdf,
}: RankedResultsProps) {
  // finished candidates, best score first
  const analyzed = candidates
    .filter((candidate) => candidate.status === "done" && candidate.result)
    .sort((a, b) => (b.result?.score ?? 0) - (a.result?.score ?? 0));
  // everything else: ready, queued, analyzing, or failed
  const notAnalyzed = candidates.filter((candidate) => candidate.status !== "done");

  // "Analyze 3 resumes" on the first run; "Analyze 2 new resumes" once some are already ranked
  const resumeWord = toAnalyzeCount === 1 ? "resume" : "resumes";
  const analyzeLabel =
    analyzed.length > 0
      ? `Analyze ${toAnalyzeCount} new ${resumeWord}`
      : `Analyze ${toAnalyzeCount} ${resumeWord}`;

  // show the button while running (for progress) or when there's something to analyze
  const showAnalyzeButton = isRunning || toAnalyzeCount > 0;

  return (
    <section className="mt-10 w-full max-w-3xl rounded-lg border border-green-900/20 bg-white/80 p-6 text-left shadow-md">
      <h2 className="text-lg font-semibold uppercase tracking-wide text-green-950">
        Skill Match: {jobTitle}
      </h2>

      {/* where these results live: saved jobs are in Past jobs; private ones vanish on reload */}
      <p className="mt-1 text-xs text-[#5f6b61]">
        {isSaved
          ? "Saved to your account. You'll find this job in Past jobs."
          : "Not saved. Download your results before leaving this page."}
      </p>

      {/* instructions for the adding mode, until the first analysis has finished */}
      {analyzed.length === 0 && !isRunning && (
        <p className="mt-2 text-xs text-[#5f6b61]">
          Add all the resumes you want to compare (up to 10), then click Analyze.
        </p>
      )}

      {/* ranked results, once at least one candidate is done */}
      {analyzed.length > 0 && (
        <>
          <ReviewAidNote />
          <div className="mt-4 space-y-3">
            {analyzed.map((candidate, index) => (
              <CandidateCard
                key={candidate.resumeId}
                rank={index + 1}
                fileName={candidate.fileName}
                result={candidate.result as CandidateResult}
              />
            ))}
          </div>
        </>
      )}

      {/* resumes not analyzed yet, with their status */}
      {notAnalyzed.length > 0 && (
        <ul className="mt-4 space-y-2">
          {notAnalyzed.map((candidate) => (
            <li
              key={candidate.resumeId}
              className="flex items-center justify-between gap-3 rounded-md border border-green-900/10 bg-white px-4 py-2 text-sm text-[#4f5f52]"
            >
              <span className="truncate">{candidate.fileName}</span>
              <span className="flex shrink-0 items-center gap-3 text-xs">
                {candidate.status === "running" && (
                  <>
                    <Loading />
                    Analyzing
                  </>
                )}
                {/* "pending" means added but not analyzed: Queued during a run, Ready otherwise */}
                {candidate.status === "pending" && (isRunning ? "Queued" : "Ready")}
                {candidate.status === "error" && (
                  <span className="text-red-700">{candidate.error}</span>
                )}
                {/* resumes can only be removed between runs */}
                {candidate.status !== "running" && !isRunning && (
                  <button
                    type="button"
                    onClick={() => onRemove(candidate)}
                    className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* downloads, once there's at least one result and nothing is running */}
      {analyzed.length > 0 && !isRunning && (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button onClick={onDownloadPdf}>Download PDF</Button>
          <Button onClick={onDownloadCsv}>Download CSV</Button>
        </div>
      )}

      {/* the one button that starts an analysis */}
      {showAnalyzeButton && (
        <div className="mt-5 flex flex-col items-center gap-2">
          <Button variant="primary" onClick={onAnalyze} disabled={isRunning || !hasKey}>
            {isRunning ? progressText : analyzeLabel}
          </Button>
          {!hasKey && !isRunning && (
            <p className="text-xs text-[#5f6b61]">Add your OpenAI key above to analyze.</p>
          )}
        </div>
      )}
    </section>
  );
}

export default RankedResults;
