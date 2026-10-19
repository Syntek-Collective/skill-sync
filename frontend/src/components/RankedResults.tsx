/*
  RANKED RESULTS

  Shows every candidate for the current job, best match first.
  Each card shows the score and a one-line summary; "View details" opens the requirement-by-
  requirement breakdown with the resume evidence, strengths, concerns and interview questions.

  The score comes from the backend (calculated in code from the met / partial / not met
  judgments), so this component only displays - it doesn't calculate anything.
*/

import { useState } from "react";

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
  isRunning: boolean;
};

function RankedResults({ jobTitle, candidates, onRemove, isRunning }: RankedResultsProps) {
  const analyzed = candidates
    .filter((candidate) => candidate.status === "done" && candidate.result)
    .sort((a, b) => (b.result?.score ?? 0) - (a.result?.score ?? 0));
  const notAnalyzed = candidates.filter((candidate) => candidate.status !== "done");

  return (
    <section className="mt-10 w-full max-w-3xl rounded-lg border border-green-900/20 bg-white/80 p-6 text-left shadow-md">
      <h2 className="text-lg font-semibold uppercase tracking-wide text-green-950">
        Skill Match: {jobTitle}
      </h2>

      {candidates.length === 0 ? (
        <p className="mt-4 text-xs text-[#7a887d]">
          Add up to 10 resumes, then run the skill match to rank them against this job.
        </p>
      ) : (
        <>
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

          {notAnalyzed.length > 0 && (
            <ul className="mt-4 space-y-2">
              {notAnalyzed.map((candidate) => (
                <li
                  key={candidate.resumeId}
                  className="flex items-center justify-between gap-3 rounded-md border border-green-900/10 bg-white px-4 py-2 text-sm text-[#4f5f52]"
                >
                  <span className="truncate">{candidate.fileName}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs">
                    {candidate.status === "running" && <Loading />}
                    {candidate.status === "pending" && "Waiting to run"}
                    {candidate.status === "error" && (
                      <span className="text-red-700">{candidate.error}</span>
                    )}
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
        </>
      )}
    </section>
  );
}

export default RankedResults;
