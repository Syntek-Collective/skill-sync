/*

  APP - the recruiter skill match

  Flow for a signed-in recruiter:
    1. add their OpenAI key (BYOK - see ApiKeyPanel)
    2. add the job they're hiring for (JobPostingModal saves it)
    3. add up to 10 resume PDFs (CandidateUploadModal)
    4. run the skill match: the backend pulls the job's requirements ONCE, then this page
       analyzes each resume against that same list, 3 at a time, so a big batch never hits
       a request timeout and one bad resume doesn't stop the rest
    5. see the candidates ranked (RankedResults); past jobs are in HistoryModal

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
import {
  ApiError,
  analyzeCandidate,
  fetchRequirements,
  runWithConcurrency,
} from "./matchApi";
import {
  isCandidateResult,
  type Candidate,
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

  // the current job and its candidates
  const [job, setJob] = useState<{ id: string; title: string } | null>(null);
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState("");

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
  const doneCount = candidates.filter((candidate) => candidate.status === "done").length;

  const updateCandidate = (resumeId: string, changes: Partial<Candidate>) => {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.resumeId === resumeId ? { ...candidate, ...changes } : candidate,
      ),
    );
  };

  // ===== RUN THE SKILL MATCH =====
  // runs automatically after an upload (and after a key is saved), so the recruiter never has
  // to find a "run" button; the Retry button calls it again for anything unfinished.
  // the key is passed in because a just-saved key isn't in this render's state yet
  const runMatch = async (toRun: Candidate[], key: string = openaiKey) => {
    if (!job || toRun.length === 0) return;
    if (!key) {
      setRunError("Add your OpenAI key above to start the match.");
      return;
    }

    setIsRunning(true);
    setRunError("");

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
      // candidate (including ones added later) is scored on the same list
      const jobRequirements =
        requirements ?? (await fetchRequirements(accessToken, key, job.id));
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
            const result = await analyzeCandidate(accessToken, key, {
              resumeId: candidate.resumeId,
              jobPostingId: job.id,
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

      if (userId) setJobHistory(await fetchJobHistory(userId));
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

  // removes a resume that hasn't been analyzed yet (file + row), e.g. one added by mistake
  const handleRemoveCandidate = async (candidate: Candidate) => {
    setRunError("");

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
    setJob(null);
    setRequirements(null);
    setCandidates([]);
    setRunError("");
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
    // resumes uploaded before the key was added start now
    if (!isRunning) runMatch(candidatesToRun, key);
  };

  const handleForgetKey = () => {
    setOpenaiKey("");
    writeStoredKey("");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // don't leave a key behind for whoever uses this browser next
    handleForgetKey();
    handleStartNewJob();
    setJobHistory([]);
    setIsLoggedIn(false);
    setUserName("");
    setUserId(null);
  };

  return (
    <main
      className={`relative min-h-screen flex flex-col items-center text-center px-6 ${
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
                {/* only needed when something didn't finish (an error, or a stopped batch) */}
                {!isRunning && openaiKey && candidatesToRun.length > 0 && (
                  <Button variant="primary" onClick={() => runMatch(candidatesToRun)}>
                    Retry ({candidatesToRun.length})
                  </Button>
                )}
                <Button onClick={handleStartNewJob} disabled={isRunning}>
                  Start a new job
                </Button>
              </div>

              {isRunning && (
                <p className="mt-4 text-sm font-semibold text-[#3f7f52]">
                  {requirements
                    ? `${doneCount} of ${candidates.length} done`
                    : "Reading the job's requirements..."}
                </p>
              )}

              <RankedResults
                jobTitle={job.title}
                candidates={candidates}
                onRemove={handleRemoveCandidate}
                isRunning={isRunning}
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
              onSave={(jobData) =>
                setJob({ id: jobData.jobPostingId, title: jobData.title })
              }
            />
          )}

          {isUploadModalOpen && (
            <CandidateUploadModal
              isOpen={isUploadModalOpen}
              onClose={() => setIsUploadModalOpen(false)}
              remainingSlots={MAX_CANDIDATES - candidates.length}
              onUploaded={(newCandidates) => {
                setCandidates((current) => [...current, ...newCandidates]);
                // start right away - uploading is the last thing the recruiter has to do
                runMatch(newCandidates);
              }}
            />
          )}

          {isHistoryModalOpen && (
            <HistoryModal
              isOpen={isHistoryModalOpen}
              onClose={() => setIsHistoryModalOpen(false)}
              jobHistory={jobHistory}
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
  );
}

export default App;
