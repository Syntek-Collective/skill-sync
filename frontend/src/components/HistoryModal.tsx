/*

  HISTORY MODAL

  Shows the recruiter's past jobs, each with its candidates ranked best match first.
  App.tsx groups the saved analyses by job posting before passing them in
  (older job-seeker analyses are in a different format and are left out).

  DESIGN - a scannable list of jobs; open one to see its ranked candidates,
  and open a candidate to see the full requirement breakdown.

*/

import { useState } from "react";

import { CandidateCard, ReviewAidNote } from "./RankedResults";
import type { JobHistory } from "../types";

type HistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  jobHistory: JobHistory[];
};

function HistoryModal({ isOpen, onClose, jobHistory }: HistoryModalProps) {
  // which job is expanded (null = none)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-lg border border-green-900/20 bg-white p-6 shadow-md">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-green-950">
            Past Jobs
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-green-950 hover:opacity-70"
          >
            Close
          </button>
        </div>

        {jobHistory.length === 0 ? (
          <p className="mt-4 text-sm text-[#4f5f52]">
            No past skill matches yet. Run one and it will show up here.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {jobHistory.map((job) => {
              const isExpanded = expandedJobId === job.jobPostingId;
              const ranked = [...job.candidates].sort(
                (a, b) => b.result.score - a.result.score,
              );
              const top = ranked[0];

              return (
                <div
                  key={job.jobPostingId}
                  className="rounded-md border border-green-900/10 bg-white/80 p-4 text-left"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-green-950">{job.jobTitle}</p>
                    <p className="shrink-0 text-xs text-[#4f5f52]">
                      {new Date(job.lastAnalyzedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  <p className="mt-1 text-xs text-[#4f5f52]">
                    {ranked.length} candidate{ranked.length === 1 ? "" : "s"}
                    {top && ` · top match ${top.result.score}% (${top.fileName})`}
                  </p>

                  <button
                    onClick={() => setExpandedJobId(isExpanded ? null : job.jobPostingId)}
                    className="mt-2 text-xs font-medium text-green-700 hover:opacity-70"
                  >
                    {isExpanded ? "Hide candidates ▲" : "View ranked candidates ▼"}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 border-t border-green-900/10 pt-3">
                      <ReviewAidNote />
                      <div className="mt-3 space-y-3">
                        {ranked.map((candidate, index) => (
                          <CandidateCard
                            key={candidate.analysisId}
                            rank={index + 1}
                            fileName={candidate.fileName}
                            result={candidate.result}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default HistoryModal;
