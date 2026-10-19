/*

  HISTORY MODAL

  Shows the recruiter's SAVED jobs (only jobs saved with "Save this job" are stored), each with
  its candidates ranked best match first. Each job can be deleted, which removes its results
  and resume files for good.
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
  // deletes one saved job (App.tsx calls the backend, then reloads the list)
  onDeleteJob: (jobPostingId: string) => Promise<void>;
};

function HistoryModal({ isOpen, onClose, jobHistory, onDeleteJob }: HistoryModalProps) {
  // which job is expanded (null = none)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  // the job currently being deleted, to disable its button and show "Deleting..."
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // asks first, because deleting removes the saved resumes and results permanently
  const handleDelete = async (job: JobHistory) => {
    const confirmed = window.confirm(
      `Delete "${job.jobTitle}"? Its saved results and resume files will be permanently removed.`,
    );
    if (!confirmed) return;

    setDeletingJobId(job.jobPostingId);
    setDeleteError("");
    try {
      await onDeleteJob(job.jobPostingId);
    } catch (error) {
      console.error("Delete job failed:", error);
      setDeleteError(`Couldn't delete "${job.jobTitle}". Please try again.`);
    } finally {
      setDeletingJobId(null);
    }
  };

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

        {deleteError && <p className="mt-3 text-sm text-red-700">{deleteError}</p>}

        {jobHistory.length === 0 ? (
          <p className="mt-4 text-sm text-[#4f5f52]">
            No saved jobs. Tick "Save this job" when adding a job to keep it here.
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

                  <div className="mt-2 flex items-center justify-between gap-4">
                    <button
                      onClick={() => setExpandedJobId(isExpanded ? null : job.jobPostingId)}
                      className="text-xs font-medium text-green-700 hover:opacity-70"
                    >
                      {isExpanded ? "Hide candidates ▲" : "View ranked candidates ▼"}
                    </button>
                    <button
                      onClick={() => handleDelete(job)}
                      disabled={deletingJobId !== null}
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingJobId === job.jobPostingId ? "Deleting..." : "Delete job"}
                    </button>
                  </div>

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
