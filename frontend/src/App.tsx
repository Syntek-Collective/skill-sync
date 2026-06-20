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


import { useState } from 'react'
import Button from './components/ui/Button'
import Loading from './components/Loading'

import AnalysisResult from './components/AnalysisResult'
import ResumeModal from './components/ResumeModal'
import JobPostingModal from './components/JobPostingModal'
import AuthModal from './components/AuthModal'
import HistoryModal from './components/HistoryModal'



function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [userName, setUserName] = useState('')
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<"login" | "signup">('login')
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [isJobModalOpen, setIsJobModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [analysisResponse, setAnalysisResponse] = useState('')
  const [historyArray, setHistoryArray] = useState<{id: number, jobListing: string, result: string, createdAt: Date}[]>([])
  

  //PLACEHOLDER FUNCTION UNTIL BACKEND IS BUILT
  const handleAnalyzePlaceholder = (jobQuery: string) => {
    setIsLoading(true)
    // 1. make a FAKE data object (same shape the backend would send)
    const fakeObj = { id: 6767, result: "you're are inducted as a porky piggy pal", createdAt: new Date() }
    
    // 2. store the result (same as real function)
    setAnalysisResponse(fakeObj.result)
    
    // 3. add to history (same as real function)
    setHistoryArray([...historyArray, {id: fakeObj.id, jobListing: jobQuery, result: fakeObj.result, createdAt: fakeObj.createdAt}])
  
    setIsLoading(false)
  }



  //REAL HANDLE ANALYZE FUNCTION
  //data must be converted to JSON to travel over the internet 
  const handleAnalyze = async(jobQuery: string) => {
    //set the loading state to true while we are waiting for the response from the backend
    setIsLoading(true)

    const response = await fetch('http://localhost:3000/api/analyze', {
      //type of request we are making to the back end 
      method: 'POST',
      //info about request: describes the data type of the in the request body (JSON)
      headers: { 'Content-Type': 'application/json' },
      //actual data sent in request - converts our JS object (resume + job) into a JSON string to send
      body: JSON.stringify({ resume: resumeFile, jobPosting: jobQuery })
    })

    //convert the JSON response to a JavaScript
    const data = await response.json()

    //store the result so AnalysisResult shows it on screen
    setAnalysisResponse(data.result)

    //add this analysis (job + result) to history, keeping past entries
    setHistoryArray([...historyArray, {id: data.id, jobListing: jobQuery, result: data.result, createdAt: data.createdAt}])
  
    //once the information is received we are no longer loading
    setIsLoading(false)
  }



  //HANDLE AUTH SUCCESS FUNCTION
  const handleAuthSuccess = (user: string) => {
    setIsLoggedIn(true)
    setUserName(user)
    setIsAuthModalOpen(false)
  }

  return (
    <main>

      {/* ===== ALWAYS SHOWS (no condition) ===== */}
      <h1>Skill Sync</h1>



      {/* ===== MASTER SWITCH: logged in or not? ===== */}
      {isLoggedIn ? (
        <div>
          <p>{userName}, leave nothing to chance.</p>

          <Button onClick={()=>{setIsResumeModalOpen(true)}}>Upload Resume</Button>
          <Button onClick={()=>{setIsJobModalOpen(true)}}>Upload Job Posting</Button>
          <Button onClick={()=>{setIsHistoryModalOpen(true)}}>Analysis History</Button>

          {isLoading ? (
            <Loading/>
          ): (
            <AnalysisResult llmResponse={analysisResponse}/>
          )}

          { isResumeModalOpen && <ResumeModal isOpen={isResumeModalOpen} onClose={()=>{setIsResumeModalOpen(false)}} onSave={(file)=>{setResumeFile(file)}}/>}
          { isJobModalOpen && <JobPostingModal isOpen={isJobModalOpen} onClose={()=>{setIsJobModalOpen(false)}} onAnalyze={handleAnalyzePlaceholder}/>}
          { isHistoryModalOpen && <HistoryModal isOpen={isHistoryModalOpen} onClose={()=>{setIsHistoryModalOpen(false)}} historyArray={historyArray}/>}
        </div>
      ) : (
        <div>
          <p>Align your skills. Accelerate your career.</p>

          <Button onClick={()=>{setAuthMode('login'); setIsAuthModalOpen(true)}}>Login</Button>
          <Button onClick={()=>{setAuthMode('signup'); setIsAuthModalOpen(true)}}>Signup</Button>

          {isAuthModalOpen && <AuthModal isOpen={isAuthModalOpen} onClose={()=>{setIsAuthModalOpen(false)}} onAuthSuccess={handleAuthSuccess} authMode={authMode} setAuthMode={setAuthMode}/>}
        </div>
      )}
      
    </main>
  );
}

export default App;
