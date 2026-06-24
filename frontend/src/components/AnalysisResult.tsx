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
  parsedResponse: {
    matchScore: number;
    fitLevel: string;
    fitMessage: string;
    matchedSkills: string[];
    missingSkills: { skill: string; importance: string }[];
    suggestions: string[];
    timeToReady: string;
  } | null;
};

//function that returns the the response display on the UI
function AnalysisResult({ parsedResponse }: AnalysisResultProps) {
  // empty state - check FIRST
  if (!parsedResponse) {
    return (
      <section className="mt-10 w-full max-w-3xl rounded-lg border border-green-900/20 bg-white/80 p-6 text-left shadow-md">
        <h2 className="text-lg font-semibold uppercase tracking-wide text-green-950">
          Skill Gap Analysis
        </h2>
        <div className="mt-4 min-h-32 rounded-md border border-green-900/10 bg-white p-4 text-xs text-[#4f5f52]">
          Your analysis will appear here once you submit a job posting.
        </div>
      </section>
    );
  }

  // destructure the fields (safe - parsedResponse exists)
  const {
    matchScore,
    fitLevel,
    fitMessage,
    matchedSkills,
    missingSkills,
    suggestions,
    timeToReady,
  } = parsedResponse;

  // display the fields
  return (
    <section className="mt-10 w-full max-w-3xl rounded-lg border border-green-900/20 bg-white/80 p-6 text-left shadow-md">
      <h2 className="text-lg font-semibold uppercase tracking-wide text-green-950">
        Skill Gap Analysis
      </h2>

      <div className="mt-4 rounded-md border border-green-900/10 bg-white p-4 text-[#4f5f52]">
        {/* MATCH SCORE - a single number */}
        <p className="text-3xl font-bold text-green-950">{matchScore}%</p>

        {/* FIT VERDICT - the headline + the constructive message */}
        <p className="mt-2 text-lg font-semibold text-green-950">{fitLevel}</p>
        <p className="mt-1 text-sm">{fitMessage}</p>

        {/* TIME TO READY - a single value */}
        <p className="mt-3 text-sm">
          <span className="font-semibold text-green-950">
            Estimated time to ready:{" "}
          </span>
          {timeToReady}
        </p>

        {/* MATCHED SKILLS - a list (the positives) */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-green-950">
            Skills You Have
          </h3>
          <ul className="mt-1 list-disc list-inside text-sm">
            {matchedSkills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </div>

        {/* MISSING SKILLS - a list of OBJECTS (skill + importance) */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-green-950">
            Skills to Build
          </h3>
          <ul className="mt-1 list-disc list-inside text-sm">
            {missingSkills.map((item) => (
              <li key={item.skill}>
                {item.skill}{" "}
                <span className="opacity-60">({item.importance})</span>
              </li>
            ))}
          </ul>
        </div>

        {/* SUGGESTIONS - a list */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-green-950">
            Suggested Next Steps
          </h3>
          <ul className="mt-1 list-disc list-inside text-sm">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default AnalysisResult;
