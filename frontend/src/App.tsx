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
      The title (SkillSync) - sits outside any condition, so it always appears

      -- MASTER SWITCH: isLoggedIn ? (logged in) : (logged out) --

      IF logged in:
        <div>
          - personalized welcome message
          - buttons: Add Resume / Job Posting / History (each opens its modal)
          - AnalysisResult component (shows analysisResponse)
          - the modals, each with the && pattern (show only IF their state is true):
              IF isResumeModalOpen  -> ResumeModal (gets onClose, onSave)
              IF isJobModalOpen     -> JobModal (gets onClose, onAnalyze)
              IF isHistoryModalOpen -> HistoryModal (gets onClose, historyArray)
        </div>

      OTHERWISE (logged out):
        <div>
          - message asking them to log in or sign up (AND/OR the align your skills accelerate your career message)
          - Auth component (handles BOTH login and signup internally; gets onAuthSuccess)
        </div>

    </main>

*/
import { useState, useEffect } from "react"


function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false)
  const [resumeFile, setResumeFile] = useState(null)
  const [isJobModalOpen, setIsJobModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [analysisResponse, setAnalysisResponse] = useState('')
  const [historyArray, setHistoryArray] = useState([])


  return (
    <main>

      {/* ===== ALWAYS SHOWS (no condition) ===== */}
      <h1>Skill Sync</h1>



      {/* ===== MASTER SWITCH: logged in or not? ===== */}

      {isLoggedIn ? (
        <p>{userName}, let's turn gaps into goals.</p>

      ) : (
        <p>Align your skills. Accelerate your career</p>
      )}




    </main>
  );
}

export default App;
