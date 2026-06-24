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

function HistoryModal({ isOpen, onClose, historyArray }: HistoryModalProps) {
  // if the modal isn't open, render nothing
  if (!isOpen) return null;

  return (
    // overlay - dark backdrop behind the modal
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">

      {/* the modal card */}
      <div className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-lg border border-green-900/20 bg-white p-6 shadow-md">

        {/* header row - title + close button */}
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

        {/* EMPTY STATE - no past analyses yet */}
        {historyArray.length === 0 ? (
          <p className="mt-4 text-sm text-[#4f5f52]">
            No past analyses yet. Your history will appear here.
          </p>
        ) : (
          // THE LIST - loop over each past analysis
          <div className="mt-4 space-y-3">
            {historyArray.map((item) => {

              // parse THIS item's result safely (skip it if the JSON is bad)
              let analysis = null;
              try {
                analysis = JSON.parse(item.result);
              } catch {
                analysis = null;
              }

              return (
                // one row per past analysis
                <div
                  key={item.id}
                  className="rounded-md border border-green-900/10 bg-white/80 p-4"
                >
                  {/* the job that was analyzed */}
                  <p className="text-sm font-semibold text-green-950">
                    {item.jobListing}
                  </p>

                  {/* the date */}
                  <p className="text-xs text-[#4f5f52]">
                    {item.createdAt}
                  </p>

                  {/* the match score (parsed) - or a fallback if parsing failed */}
                  {analysis ? (
                    <p className="mt-2 text-sm text-[#4f5f52]">
                      <span className="font-semibold text-green-950">
                        {analysis.matchScore}% match
                      </span>
                      {" — "}{analysis.fitLevel}
                    </p>
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