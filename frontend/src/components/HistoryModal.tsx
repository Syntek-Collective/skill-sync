/*

  HISTORY MODAL

  What is this component's job?
  Shows a list of the user's PAST analyses. Display + close only.

  What it receives:
    - isOpen        → whether the modal is showing
    - onClose       → function to close it
    - historyArray  → the list of past analyses

  Each history item looks like:
    { id, jobListing, result, createdAt }
    - id          → unique id (string)
    - jobListing  → the job posting that was analyzed
    - result      → the STRINGIFIED structured analysis (same shape AnalysisResult uses)
    - createdAt   → when it was created

  THE KEY THING - parsing each result
  Each item's `result` is a stringified analysis object. So to show details (like the
  match score), we JSON.parse(item.result) FOR EACH ITEM (inside the .map).
  (AnalysisResult got ONE already-parsed object from App.tsx. Here we have a LIST of
  strings, so we parse each one as we loop.)

  DESIGN - a scannable summary list
  We show a compact row per past analysis (job + date + match score), NOT the full
  analysis for every item (that would be a wall of text). Simple and scannable.

  THINGS HANDLED:
    - if not open      → render nothing
    - if no history    → show an empty message
    - parsing safely   → if one item's result is bad JSON, skip it (don't crash the whole list)

*/

import { useState } from "react";

type HistoryItem = {
  id: string;
  jobListing: string;
  result: string;
  createdAt: string;
};

type HistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  historyArray: HistoryItem[];
};

// the shape we expect after parsing item.result
type ParsedAnalysis = {
  matchScore: number;
  fitLevel: string;
  fitMessage: string;
  matchedSkills: string[];
  missingSkills: { skill: string; importance: "critical" | "nice-to-have" }[];
  suggestions: string[];
  timeToReady: string;
};

function HistoryModal({ isOpen, onClose, historyArray }: HistoryModalProps) {
  // track which item is expanded into the full view (null = none expanded)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!isOpen) return null;

  // color the progress bar based on how strong the match is
  const scoreColor = (score: number) => {
    if (score >= 75) return "bg-green-600";
    if (score >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-lg border border-green-900/20 bg-white p-6 shadow-md">
        {/* header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-green-950">
            Analysis History
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-green-950 hover:opacity-70"
          >
            Close
          </button>
        </div>

        {/* EMPTY STATE */}
        {historyArray.length === 0 ? (
          <p className="mt-4 text-sm text-[#4f5f52]">
            No past analyses yet. Run an analysis and it will show up here.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {historyArray.map((item) => {
              // safely parse this item's result
              let analysis: ParsedAnalysis | null;
              try {
                analysis = JSON.parse(item.result);
              } catch {
                analysis = null;
              }

              const isExpanded = expandedId === item.id;

              // the single most important gap to name
              const topMissing = analysis?.missingSkills?.find(
                (s) => s.importance === "critical",
              )?.skill;

              return (
                <div
                  key={item.id}
                  className="rounded-md border border-green-900/10 bg-white/80 p-4"
                >
                  {/* TOP ROW - title + date */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-green-950">
                      {item.jobListing}
                    </p>
                    <p className="text-xs text-[#4f5f52]">
                      {new Date(item.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  {analysis ? (
                    <>
                      {/* PROGRESS BAR - percentage + gap level (fitLevel) */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-green-950">
                            {analysis.matchScore}% match
                          </span>
                          <span className="text-[#4f5f52]">
                            {analysis.fitLevel}
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-green-900/10">
                          <div
                            className={`h-full rounded-full ${scoreColor(
                              analysis.matchScore,
                            )}`}
                            style={{ width: `${analysis.matchScore}%` }}
                          />
                        </div>
                      </div>

                      {/* QUICK STATS - matched, to build, top priority, time */}
                      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#4f5f52]">
                        <span>
                          <span className="font-medium text-green-950">
                            {analysis.matchedSkills?.length || 0}
                          </span>{" "}
                          skill{analysis.matchedSkills?.length === 1 ? "" : "s"}{" "}
                          matched
                        </span>
                        <span>
                          <span className="font-medium text-green-950">
                            {analysis.missingSkills?.length || 0}
                          </span>{" "}
                          skill{analysis.missingSkills?.length === 1 ? "" : "s"} to
                          build
                        </span>
                        {topMissing && (
                          <span>
                            Top priority:{" "}
                            <span className="font-medium text-green-950">
                              {topMissing}
                            </span>
                          </span>
                        )}
                        {analysis.timeToReady && (
                          <span>
                            Time to ready:{" "}
                            <span className="font-medium text-green-950">
                              {analysis.timeToReady}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* VIEW FULL toggle */}
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : item.id)
                        }
                        className="mt-3 text-xs font-medium text-green-700 hover:opacity-70"
                      >
                        {isExpanded ? "Hide details ▲" : "View full analysis ▼"}
                      </button>

                      {/* FULL VIEW - shows when expanded */}
                      {isExpanded && (
                        <div className="mt-3 space-y-3 border-t border-green-900/10 pt-3 text-left">
                          {/* fit message */}
                          <p className="text-sm text-[#4f5f52]">
                            {analysis.fitMessage}
                          </p>

                          {/* matched skills */}
                          {analysis.matchedSkills?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase text-green-950">
                                Skills you have
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {analysis.matchedSkills.map((skill, i) => (
                                  <span
                                    key={i}
                                    className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800"
                                  >
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* missing skills */}
                          {analysis.missingSkills?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase text-green-950">
                                Skills to build
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {analysis.missingSkills.map((s, i) => (
                                  <span
                                    key={i}
                                    className={`rounded-full px-2 py-0.5 text-xs ${
                                      s.importance === "critical"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-yellow-100 text-yellow-700"
                                    }`}
                                  >
                                    {s.skill}
                                    {s.importance === "critical"
                                      ? " (critical)"
                                      : ""}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* suggestions */}
                          {analysis.suggestions?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase text-green-950">
                                How to close the gap
                              </p>
                              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-[#4f5f52]">
                                {analysis.suggestions.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-[#4f5f52] opacity-60">
                      (couldn't load this analysis)
                    </p>
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
