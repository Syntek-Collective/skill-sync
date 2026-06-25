/*

  ANALYSIS RESULT COMPONENT

  What is this component's job?
  To display the AI's skill-gap analysis on screen. It's a display-only component -
  it RECEIVES the analysis and SHOWS it, it doesn't do any work or send anything back.


  THE BIG CHANGE - structured data instead of one text blob
  The AI no longer returns one paragraph - it returns STRUCTURED data with multiple
  fields, so we can display a rich, organized result instead of a wall of text.

  The fields the analysis has:
    - matchScore     → a % showing how much of the role the resume matches (a number)
    - fitLevel       → the headline verdict ("Strong Match" / "Good Fit with Gaps" / etc.)
    - fitMessage     → a short, CONSTRUCTIVE explanation of the fit
    - matchedSkills  → list of skills the job wants that the resume HAS (the positives)
    - missingSkills  → list of the gap, each with an "importance" (critical / nice-to-have)
    - suggestions    → list of actionable steps to close the gap
    - timeToReady    → estimated time/effort to be ready for the role


  HOW THE DATA ARRIVES - App.tsx parses, this component gets an OBJECT
  To keep storage simple (the database + history stay string-based), the result is
  stored/passed as a STRINGIFIED JSON string. App.tsx parses that string into an object
  and passes the OBJECT down to this component.
  So this component receives a ready-to-use object (or null if there's no analysis yet) -
  it does NOT parse anything itself, it just displays.
  (parsing lives in App.tsx = data prep; this component = pure display)


  WHAT THIS COMPONENT RECEIVES
  analysis → the parsed analysis object (or null if there's no analysis yet)


  WHAT IT NEEDS TO REMEMBER
  Nothing - no state. It just receives the object and displays. Pure display.


  WHAT IT SENDS BACK
  Nothing - display only. No interaction, nothing to report to the parent.


  THE EMPTY STATE (check this FIRST)
  If there's no analysis yet (analysis is null), show a placeholder message - BEFORE
  trying to read any fields (reading fields off null would crash).
    - if (!analysis) → show "Your analysis will appear here once you submit a job posting."
    - otherwise → display the fields


  HOW TO DISPLAY EACH TYPE OF FIELD
    - a single value (matchScore, fitLevel, fitMessage, timeToReady)
        → just show it:  {analysis.matchScore}%
    - a LIST (matchedSkills, suggestions)
        → use .map() to turn the array into list items, each needs a key:
          {analysis.matchedSkills.map((skill) => <li key={skill}>{skill}</li>)}
    - missingSkills is a list of OBJECTS ({skill, importance}), so access both:
          {analysis.missingSkills.map((item) => (
             <li key={item.skill}>{item.skill} - {item.importance}</li>
          ))}


  TONE NOTE
  The fit verdict + message should read as CONSTRUCTIVE - frame gaps as "here's the path"
  not "you're not good enough." Keep the display encouraging too (e.g. lead with the
  positives / matched skills).


  WHAT THIS STRUCTURED-OUTPUT CHANGE AFFECTS ELSEWHERE (team needs to align):
    - prompt.ts        → must ask the AI to return these exact fields as JSON
    - openaiService    → gets the JSON, stringifies it to pass along
    - the database     → stores the stringified result (stays a STRING - no schema change)
    - historyArray type→ result stays a string (no change, thanks to stringifying)
    - App.tsx          → parses the string into an object before passing it here
    - HistoryModal     → will also parse + display past analyses (build it to match)
  => the FIELD SET is a shared contract - everyone aligns to the same fields.

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
        <div className="mt-4 min-h-32 rounded-md border border-green-900/10 bg-white p-4 text-xs text-[#7a887d]">
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
