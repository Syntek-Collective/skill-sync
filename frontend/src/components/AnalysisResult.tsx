/*

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

type AnalysisResultProps = {
  llmResponse: string;
};

//function that returns the the response display on the UI
function AnalysisResult({ llmResponse }: AnalysisResultProps) {
  return (
    <section className="mt-10 w-full max-w-3xl rounded-lg border border-green-900/20 bg-white/80 p-6 text-left shadow-md">
      <h2 className="text-lg font-semibold uppercase tracking-wide text-green-950">
        Skill Gap Analysis
      </h2>
      <div className="mt-4 min-h-32 rounded-md border border-green-900/10 bg-white p-4 text-xs text-[#4f5f52]">
        {llmResponse
          ? llmResponse
          : "Your analysis will appear here once you submit a job posting."}
      </div>
    </section>
  );
}

export default AnalysisResult;
