/*

  PRIOR 2 SETUP

  What is this component's job?
  To display the AI's gap analysis on screen after the user submits a job posting
  (with a resume already uploaded)


  What does this component need to receive?
  This component receives the LLM response (text) from the main page (App.tsx)


  What does it need to remember?
  Nothing - all state is handled on the main page (App.tsx), it is just passed down as props to display


  What does it show?
  The LLM response & maybe a heading/label - shows nothing/place holder when there
  is no result yet


  What does it send back?
  Nothing/no information is sent back to the parent component (App.tsx) - this component just receives and
  displays, so theres no need to track state or send anything back to the main page


*/

/*

  SETUP

  Components describe what to render and the functions describe how the component behaves and the return statement describes
  the UI React renders



  STATE
  What does the app need to track over time (and change the UI based on)?

  Since this application relies on conditional rendering we need state to track each display change
  1. Is the user logged in or not
  1.5 What is the user's name?
  2. Did the user click/navigate resume input popup (modal)
  3. Track the actual resume input box
  4. Did the user click/navigate to the job listing modal
  5. Did the user click/navigate to the history modal
  6. Was an analysis performed and therefore need to be displayed
  7. Every time the user submits a job query we need to save this for the history modal



  HELPER FUNCTIONS
  Functions inside React components are typically used to handle events, update state, and encapsulate logic
  because they are defined inside the component they have access to the components state, props, and local variables through closures

  1. A function to open each modal
  2. A function to close each modal
  3. A function to handle saving the user's resume
  4. A function to handle analyzing (running the analysis & adding it to history)
  5. A function to handle login (remember we are using supabase 4 authentication)



  JSX RETURN
  JSX is HTML-looking syntax that describes what shows on screen
  We drop JavaScript into it using curly braces { }

  Due to the conditional rendering nature of this application all of the logic lives with the logged-in/logged-out condition
  Each side of a condition must be ONE element (so we wrap groups in a <div>)


  Structure:

  <main>  (the overall page wrapper)

        -- ALWAYS SHOWS --
        The title (Skill Sync) - sits outside any condition, so it always appears

        -- MASTER SWITCH: isLoggedIn ? (logged in) : (logged out) --

        IF logged in:
          <div>
            - personalized welcome message ({userName}, leave nothing to chance.)
            - buttons: Upload Resume / Upload Job Posting / Analysis History (each opens its modal)
            - AnalysisResult component (shows analysisResponse)
            - the modals, each with the && pattern (show only IF their state is true):
                IF isResumeModalOpen  -> ResumeModal (gets isOpen, onClose, onSave)
                IF isJobModalOpen     -> JobPostingModal (gets isOpen, onClose, onAnalyze)
                IF isHistoryModalOpen -> HistoryModal (gets isOpen, onClose, historyArr)
          </div>

        OTHERWISE (logged out):
          <div>
            - tagline (Align your skills. Accelerate your career.)
            - two buttons: Login / Signup
                -> each sets authMode (which view to open to) AND opens the modal
            - AuthModal with the && pattern (shows only IF isAuthModalOpen):
                gets isOpen, onClose, onAuthSuccess, authMode, setAuthMode
                (handles login AND signup internally; can toggle its own view via setAuthMode)
          </div>

      </main>


    Auth flow notes:
      - authMode ('login' | 'signup') = which view the modal opens to
      - Login/Signup buttons set authMode + open the modal
      - On success, the modal calls onAuthSuccess(user) -> handleAuthSuccess
        which sets isLoggedIn true, stores the name, and closes the modal
      - The modal can switch its own view (login <-> signup) via setAuthMode
*/

import { useState, useEffect } from "react";
import Button from "./components/ui/Button";
import Loading from "./components/ui/Loading";
import { supabase } from "./supabaseClient";

import AnalysisResult from "./components/AnalysisResult";
import ResumeModal from "./components/resumeModal";
import JobPostingModal from "./components/jobPostingModal";
import AuthModal from "./components/AuthModal";
import HistoryModal from "./components/HistoryModal";
import skillSyncLogo from "./assets/skillsync-transparent.png";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [resumeFilePath, setResumeFilePath] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [analysisResponse, setAnalysisResponse] = useState<string>("");
  const [resumeUploadMessage, setResumeUploadMessage] = useState("");
  const [historyArray, setHistoryArray] = useState<
    { id: string; jobListing: string; result: string; createdAt: string }[]
  >([]);

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
        // store the logged-in user's id - the analyze request needs it
        setUserId(user.id);
      }
    };
    checkSession();
  }, []);

  // ===== REAL ANALYZE FUNCTION - calls our backend =====
  // receives the job data (incl. jobPostingId) from the JobPostingModal
  const handleAnalyze = async (jobData: {
    title: string;
    posting: string;
    jobPostingId: string;
  }) => {
    // guard: we need a resume uploaded (filePath + id) and a logged-in user
    if (!resumeFilePath || !resumeId || !userId) {
      console.error("Missing resume, resume id, or user id");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // send everything the backend needs: the file path, the job text,
        // and the ids needed to save the analysis row
        body: JSON.stringify({
          resume: resumeFilePath,
          jobPosting: jobData.posting,
          userId,
          resumeId,
          jobPostingId: jobData.jobPostingId,
        }),
      });

      const data = await response.json();

      // the analysis comes back from a jsonb column, so data.result is an OBJECT.
      // we stringify it for our state/history (which store it as a string),
      // and AnalysisResult parses it back when displaying.
      const resultString =
        typeof data.result === "string"
          ? data.result
          : JSON.stringify(data.result);

      // store the current result so AnalysisResult shows it
      setAnalysisResponse(resultString);

      // add this analysis to history, keeping past entries
      setHistoryArray([
        ...historyArray,
        {
          id: String(data.id),
          jobListing: jobData.title,
          result: resultString,
          createdAt: String(data.createdAt),
        },
      ]);
    } catch (error) {
      console.error("Analyze failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ===== AUTH SUCCESS - called when login/signup succeeds =====
  const handleAuthSuccess = (user: string) => {
    setIsLoggedIn(true);
    setUserName(user);
    setIsAuthModalOpen(false);
    // refresh the userId after auth
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setUserName("");
    setUserId(null);
    setResumeFilePath(null);
    setResumeId(null);
  };

  return (
    <main className="relative min-h-screen flex flex-col items-center text-center px-6 pt-10">
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
        <div className="w-full max-w-2xl">
          <p className="mt-2 text-sm text-[#235c2a]">
            {userName}, leave nothing to chance.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-6">
            <Button onClick={() => setIsResumeModalOpen(true)}>
              Upload Resume
            </Button>
            <Button
              onClick={() => setIsJobModalOpen(true)}
              disabled={!resumeFilePath}
            >
              Upload Job Posting
            </Button>
            <Button onClick={() => setIsHistoryModalOpen(true)}>
              Analysis History
            </Button>
          </div>

          {resumeUploadMessage && (
            <p className="mt-4 text-sm font-semibold text-green-800">
              {resumeUploadMessage}
            </p>
          )}

          {isLoading ? (
            <Loading />
          ) : (
            // parse the stringified result into an object before passing it down
            // (or pass null if there's no analysis yet - the component handles the empty state)
           <AnalysisResult
              parsedResponse={(() => {
                if (!analysisResponse) return null;
                try {
                  return JSON.parse(analysisResponse);
                } catch {
                  console.error("Could not parse analysis:", analysisResponse);
                  return null;
                }
              })()}
/>
          )}

          {/* RESUME STATUS - shows when a resume has been uploaded */}
          {resumeFilePath && (
            <p className="mt-4 text-sm text-green-700">Resume uploaded ✓</p>
          )}

          {/* Modals */}
          {isResumeModalOpen && (
            <ResumeModal
              isOpen={isResumeModalOpen}
              onClose={() => setIsResumeModalOpen(false)}
              onSave={(filePath, newResumeId) => {
                setResumeFilePath(filePath);
                setResumeId(newResumeId);
                setResumeUploadMessage("Resume uploaded successfully.");
              }}
            />
          )}

          {isJobModalOpen && (
            <JobPostingModal
              isOpen={isJobModalOpen}
              onClose={() => setIsJobModalOpen(false)}
              onAnalyze={handleAnalyze}
            />
          )}

          {isHistoryModalOpen && (
            <HistoryModal
              isOpen={isHistoryModalOpen}
              onClose={() => setIsHistoryModalOpen(false)}
              historyArray={historyArray}
            />
          )}
        </div>
      ) : (
        <div className="flex w-full flex-col items-center">
          <p className="mt-3 text-xl font-semibold">
            Align your skills. Accelerate your career.
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