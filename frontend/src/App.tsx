/*

  APP - the recruiter skill match

  PRIVATE BY DEFAULT: unless the recruiter ticks "Save this job", nothing is stored - the job text
  and resume PDFs stay in this page and are sent with each analysis request. Results must be
  downloaded (PDF / CSV) before leaving; the page warns if they haven't been. Saved jobs work the
  old way: stored in Supabase and listed in Past jobs, where they can be deleted.

  Flow for a signed-in recruiter:
    1. add their OpenAI key (BYOK - see ApiKeyPanel)
    2. add the job they're hiring for (JobPostingModal - private, or saved if they opt in)
    3. add up to 10 resume PDFs (CandidateUploadModal) - uploading only adds them to the list
    4. click "Analyze N resumes" (handleAnalyze): the backend pulls the job's requirements ONCE, then this page
       analyzes each resume against that same list, 3 at a time, so a big batch never hits
       a request timeout and one bad resume doesn't stop the rest
    5. see the candidates ranked (RankedResults) and download them; saved jobs are in HistoryModal

  State lives here and is passed down; the components mostly display and report back.

*/

import { useState, useEffect } from "react";
import Button from "./components/ui/Button";
import { supabase } from "./supabaseClient";

import RankedResults from "./components/RankedResults";
import CandidateUploadModal from "./components/CandidateUploadModal";
import JobPostingModal from "./components/jobPostingModal";
import AuthModal from "./components/AuthModal";
import HistoryModal from "./components/HistoryModal";
import ApiKeyPanel from "./components/ApiKeyPanel";
import PrintReport from "./components/PrintReport";
import {
  ApiError,
  analyzeCandidate,
  deleteSavedJob,
  fetchRequirements,
  fileToBase64,
  runWithConcurrency,
} from "./matchApi";
import { downloadCsv, printResults, rankCandidates } from "./exportResults";
import {
  isCandidateResult,
  type Candidate,
  type Job,
  type JobHistory,
  type Requirement,
} from "./types";
import skillSyncLogo from "./assets/skillsync-transparent.png";

const MAX_CANDIDATES = 10;
const PARALLEL_ANALYSES = 3;

// BYOK: the user's OpenAI key is kept in sessionStorage so it's gone when the tab closes.
// storage can be blocked (private mode, strict settings), so failures just mean "no saved key"
const OPENAI_KEY_STORAGE = "skillsync.openaiKey";

function readStoredKey() {
  try {
    return sessionStorage.getItem(OPENAI_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

function writeStoredKey(key: string) {
  try {
    if (key) sessionStorage.setItem(OPENAI_KEY_STORAGE, key);
    else sessionStorage.removeItem(OPENAI_KEY_STORAGE);
  } catch {
    // key still works for this page load, it just won't survive a refresh
  }
}

// one saved analysis, joined to its job title and resume file name
type AnalysisRow = {
  id: string | number;
  job_posting_id: string;
  result: unknown;
  created_at: string;
  job_postings: { job_title: string | null } | null;
  resumes: { file_name: string | null } | null;
};

// Loads the user's past skill matches, grouped by job (newest job first).
// Older job-seeker analyses are in a different format and are skipped.
async function fetchJobHistory(userId: string): Promise<JobHistory[]> {
  const { data, error } = await supabase
    .from("analyses")
    .select("id, job_posting_id, result, created_at, job_postings(job_title), resumes(file_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Could not load history:", error);
    return [];
  }

  const jobs = new Map<string, JobHistory>();
  for (const row of data as unknown as AnalysisRow[]) {
    if (!isCandidateResult(row.result)) continue;

    let job = jobs.get(row.job_posting_id);
    if (!job) {
      // rows are newest first, so the first row seen for a job is its latest
      job = {
        jobPostingId: row.job_posting_id,
        jobTitle: row.job_postings?.job_title || "Untitled job",
        lastAnalyzedAt: row.created_at,
        candidates: [],
      };
      jobs.set(row.job_posting_id, job);
    }

    job.candidates.push({
      analysisId: String(row.id),
      fileName: row.resumes?.file_name || "Resume",
      result: row.result,
    });
  }

  return [...jobs.values()];
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [openaiKey, setOpenaiKey] = useState(readStoredKey);

  // the current job (private or saved - see Job in types.ts) and its candidates
  const [job, setJob] = useState<Job | null>(null);
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  // the resumes in the current "Analyze" click, so progress reads "2 of 3" for this batch only
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const [runError, setRunError] = useState("");
  // has the recruiter downloaded the latest results? Private jobs warn before leaving if not.
  // Reset to false whenever a new analysis starts.
  const [hasDownloaded, setHasDownloaded] = useState(false);

  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [jobHistory, setJobHistory] = useState<JobHistory[]>([]);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const user = data.session.user;
        const profileResponse = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        const username = profileResponse.data?.username;
        setIsLoggedIn(true);
        setUserName(username || user.email || "");
        setUserId(user.id);
        setJobHistory(await fetchJobHistory(user.id));
      }
    };
    checkSession();
  }, []);

  // candidates that still need analyzing (new ones, or ones that failed and can be retried)
  const candidatesToRun = candidates.filter(
    (candidate) => candidate.status === "pending" || candidate.status === "error",
  );

  // progress text for the Analyze button while a batch runs.
  // requirements is null until the job's requirement list comes back (first click only)
  const finishedInBatch = candidates.filter(
    (candidate) =>
      runningIds.includes(candidate.resumeId) &&
      (candidate.status === "done" || candidate.status === "error"),
  ).length;
  const progressText = requirements
    ? `Analyzing ${finishedInBatch} of ${runningIds.length}...`
    : "Reading the job's requirements...";

  // finished candidates, best first - used by the downloads and the print layout
  const rankedResults = rankCandidates(candidates);

  // true when leaving now would lose results: a private job with results not yet downloaded
  const hasUnsavedResults =
    job !== null && !job.saved && rankedResults.length > 0 && !hasDownloaded;

  // Ask the browser to show its "Leave site? Changes may not be saved" prompt on reload/close
  // while there are results that would be lost. (Browsers show their own wording, not ours.)
  useEffect(() => {
    if (!hasUnsavedResults) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedResults]);

  // Same idea for in-app actions that clear the job (Start a new job, Logout).
  // Returns true if it's fine to continue.
  const confirmDiscardResults = () =>
    !hasUnsavedResults ||
    window.confirm(
      "These results aren't saved. If you continue, they'll be gone. Download them first?\n\nPress OK to continue without downloading, or Cancel to go back.",
    );

  const updateCandidate = (resumeId: string, changes: Partial<Candidate>) => {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.resumeId === resumeId ? { ...candidate, ...changes } : candidate,
      ),
    );
  };

  // ===== RUN THE SKILL MATCH =====
  // Called by the "Analyze N resumes" button. Adding resumes never starts an analysis on its own,
  // so the recruiter can keep adding (or removing) resumes until the list is complete.
  // It analyzes everything not done yet: new resumes plus any that failed last time.
  const handleAnalyze = async () => {
    // snapshot the list now; candidates added while this runs wait for the next click
    const toRun = candidatesToRun;
    const key = openaiKey;
    if (!job || toRun.length === 0) return;
    if (!key) {
      setRunError("Add your OpenAI key above to analyze.");
      return;
    }

    setIsRunning(true);
    setRunningIds(toRun.map((candidate) => candidate.resumeId));
    setRunError("");
    // new results are coming, so any earlier download no longer covers everything
    setHasDownloaded(false);

    try {
      // get the current session so we can send the auth token the backend expects
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setRunError("Please log in again before running the skill match.");
        return;
      }
      const accessToken = session.access_token;

      // the requirement list is extracted once per job and reused, so every
      // candidate (including ones added later) is scored on the same list.
      // private jobs send the posting text; saved jobs send their stored id
      const jobRequirements =
        requirements ??
        (await fetchRequirements(
          accessToken,
          key,
          job.saved && job.id ? { jobPostingId: job.id } : { jobText: job.text },
        ));
      setRequirements(jobRequirements);

      // a rejected key, an empty balance, or a full job will fail every remaining
      // resume the same way, so stop starting new ones
      let stopBatch = false;

      await runWithConcurrency(
        toRun,
        PARALLEL_ANALYSES,
        async (candidate) => {
          updateCandidate(candidate.resumeId, { status: "running" });
          try {
            // private jobs send the PDF itself (read in memory on the server, never stored);
            // saved jobs send the ids of the stored resume and job posting
            const result =
              job.saved && job.id
                ? await analyzeCandidate(accessToken, key, {
                    resumeId: candidate.resumeId,
                    jobPostingId: job.id,
                    requirements: jobRequirements,
                  })
                : await analyzeCandidate(accessToken, key, {
                    resumePdf: await fileToBase64(candidate.file as File),
                    requirements: jobRequirements,
                  });
            updateCandidate(candidate.resumeId, { status: "done", result });
          } catch (error) {
            const message =
              error instanceof ApiError
                ? error.message
                : "Something went wrong. Please try again.";
            updateCandidate(candidate.resumeId, { status: "error", error: message });

            if (error instanceof ApiError && [401, 409, 429].includes(error.status)) {
              stopBatch = true;
              setRunError(message);
            }
          }
        },
        () => stopBatch,
      );

      // only saved jobs appear in Past jobs, so only they need a refresh
      if (job.saved && userId) setJobHistory(await fetchJobHistory(userId));
    } catch (error) {
      // only the requirements step reaches here; per-resume errors are handled above
      console.error("Skill match failed:", error);
      setRunError(
        error instanceof ApiError
          ? error.message
          : "Couldn't read the job's requirements. Please try again.",
      );
    } finally {
      setIsRunning(false);
    }
  };

  // removes a resume that hasn't been analyzed yet, e.g. one added by mistake.
  // private jobs only need to drop it from the list; saved jobs also delete the file + row
  const handleRemoveCandidate = async (candidate: Candidate) => {
    setRunError("");

    if (!job?.saved || !candidate.filePath) {
      setCandidates((current) =>
        current.filter((item) => item.resumeId !== candidate.resumeId),
      );
      return;
    }

    const { error: storageError } = await supabase.storage
      .from("resumes")
      .remove([candidate.filePath]);
    const { error: rowError } = await supabase
      .from("resumes")
      .delete()
      .eq("id", candidate.resumeId);

    if (storageError || rowError) {
      console.error("Could not remove resume:", storageError ?? rowError);
      setRunError(`Couldn't remove ${candidate.fileName}. Please try again.`);
      return;
    }

    setCandidates((current) =>
      current.filter((item) => item.resumeId !== candidate.resumeId),
    );
  };

  const handleStartNewJob = () => {
    if (!confirmDiscardResults()) return;
    resetJob();
  };

  // clears the current job without asking (used after the recruiter has confirmed)
  const resetJob = () => {
    setJob(null);
    setRequirements(null);
    setCandidates([]);
    setRunError("");
    setHasDownloaded(false);
  };

  // ===== DOWNLOADS =====
  // both mark the results as downloaded, which turns off the "leave page" warning
  const handleDownloadCsv = () => {
    if (!job) return;
    downloadCsv(job.title, rankedResults);
    setHasDownloaded(true);
  };

  const handleDownloadPdf = () => {
    if (!job) return;
    printResults(job.title);
    setHasDownloaded(true);
  };

  // ===== DELETE A SAVED JOB (Past jobs) =====
  // the backend deletes the job's results, resume files and posting; then the list reloads.
  // errors are thrown so HistoryModal can show them
  const handleDeleteJob = async (jobPostingId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not logged in");

    await deleteSavedJob(session.access_token, jobPostingId);

    // if the deleted job is the one on screen, clear it too
    if (job?.id === jobPostingId) resetJob();
    if (userId) setJobHistory(await fetchJobHistory(userId));
  };

  // ===== AUTH SUCCESS - called when login/signup succeeds =====
  const handleAuthSuccess = (user: string) => {
    setIsLoggedIn(true);
    setUserName(user);
    setIsAuthModalOpen(false);
    // refresh the userId and history after auth
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        setJobHistory(await fetchJobHistory(data.user.id));
      }
    });
  };

  const handleSaveKey = (key: string) => {
    setOpenaiKey(key);
    writeStoredKey(key);
    setRunError("");
  };

  const handleForgetKey = () => {
    setOpenaiKey("");
    writeStoredKey("");
  };

  const handleLogout = async () => {
    if (!confirmDiscardResults()) return;
    await supabase.auth.signOut();
    // don't leave a key behind for whoever uses this browser next
    handleForgetKey();
    resetJob();
    setJobHistory([]);
    setIsLoggedIn(false);
    setUserName("");
    setUserId(null);
  };

  return (
    <>
      {/* the whole app is hidden when printing; only PrintReport (below) prints */}
      <main
        className={`relative min-h-screen flex flex-col items-center text-center px-6 print:hidden ${
          isLoggedIn ? "pt-10 pb-16" : "pt-52 pb-16"
        }`}
      >
        {isLoggedIn && (
          <button
            type="button"
            onClick={handleLogout}
            className="absolute right-6 top-6 rounded-full border border-[#c8d0c6] bg-white/85 px-5 py-2 text-xs font-medium text-[#003d06] shadow-[0_8px_18px_rgba(0,61,6,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#eef8ec] hover:shadow-[0_12px_24px_rgba(0,61,6,0.3)]"
          >
            Logout
          </button>
        )}

        <img
          src={skillSyncLogo}
          alt="Skill Sync logo"
          className="h-20 w-20 mb-1"
        />
        <h1 className="text-4xl font-bold uppercase">Skill Sync</h1>

        {isLoggedIn ? (
          <div className="flex w-full max-w-3xl flex-col items-center">
            <p className="mt-2 text-sm text-[#235c2a]">
              {userName}, match every resume to the role.
            </p>

            <ApiKeyPanel
              apiKey={openaiKey}
              onSave={handleSaveKey}
              onForget={handleForgetKey}
            />

            {!job ? (
              <div className="mt-10 flex flex-wrap justify-center gap-6">
                <Button variant="primary" onClick={() => setIsJobModalOpen(true)}>
                  Add the job
                </Button>
              </div>
            ) : (
              <>
                <div className="mt-10 flex flex-wrap justify-center gap-4">
                  <Button
                    variant={candidates.length === 0 ? "primary" : "secondary"}
                    onClick={() => setIsUploadModalOpen(true)}
                    disabled={isRunning || candidates.length >= MAX_CANDIDATES}
                  >
                    Add resumes ({candidates.length}/{MAX_CANDIDATES})
                  </Button>
                  <Button onClick={handleStartNewJob} disabled={isRunning}>
                    Start a new job
                  </Button>
                </div>

                <RankedResults
                  jobTitle={job.title}
                  candidates={candidates}
                  onRemove={handleRemoveCandidate}
                  isRunning={isRunning}
                  onAnalyze={handleAnalyze}
                  toAnalyzeCount={candidatesToRun.length}
                  hasKey={Boolean(openaiKey)}
                  progressText={progressText}
                  isSaved={job.saved}
                  onDownloadCsv={handleDownloadCsv}
                  onDownloadPdf={handleDownloadPdf}
                />
              </>
            )}

            {runError && (
              <p className="mt-4 text-sm font-semibold text-red-700">{runError}</p>
            )}

            {jobHistory.length > 0 && (
              <div className="mt-6">
                <Button onClick={() => setIsHistoryModalOpen(true)}>Past jobs</Button>
              </div>
            )}

            {/* Modals */}
            {isJobModalOpen && (
              <JobPostingModal
                isOpen={isJobModalOpen}
                onClose={() => setIsJobModalOpen(false)}
                onSave={(newJob) => setJob(newJob)}
              />
            )}

            {isUploadModalOpen && (
              <CandidateUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                remainingSlots={MAX_CANDIDATES - candidates.length}
                saveToAccount={job?.saved ?? false}
                // uploading only adds resumes to the list; the Analyze button starts the analysis
                onUploaded={(newCandidates) =>
                  setCandidates((current) => [...current, ...newCandidates])
                }
              />
            )}

            {isHistoryModalOpen && (
              <HistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                jobHistory={jobHistory}
                onDeleteJob={handleDeleteJob}
              />
            )}
          </div>
        ) : (
          <div className="flex w-full flex-col items-center">
            <p className="mt-3 text-xl font-semibold">
              Match resumes to the role. Review with evidence.
            </p>
            <div className="mt-10 flex w-full justify-center gap-12">
              <Button
                onClick={() => {
                  setAuthMode("login");
                  setIsAuthModalOpen(true);
                }}
              >
                Login
              </Button>
              <Button
                onClick={() => {
                  setAuthMode("signup");
                  setIsAuthModalOpen(true);
                }}
              >
                Signup
              </Button>
            </div>

            {isAuthModalOpen && (
              <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                onAuthSuccess={handleAuthSuccess}
                authMode={authMode}
                setAuthMode={setAuthMode}
              />
            )}
          </div>
        )}
      </main>

      {/* print-only layout used by "Download PDF" */}
      {job && <PrintReport jobTitle={job.title} ranked={rankedResults} />}
    </>
  );
}

export default App;
