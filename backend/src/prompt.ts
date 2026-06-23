/*

    What is this file for?
    Holds the PROMPT - the instructions we give the AI. This is the text that tells the AI 
    what its job is, what to analyze, and how to format its answer.

    What does it do?
    It doesn't DO work itself - it's the instructions that openaiService sends to the AI.
    (prompt = the instructions; openaiService = the thing that sends them to the AI)

    Think of it like a job description we hand the AI:
    "here's your role, here's what to compare, here's how to give back the result."

*/

/*

    TODO
    write the prompt that gets sent to the AI.

    The prompt should tell the AI:
    1. its role (e.g. "you are a skill-gap analyzer")
    2. what it's getting (a resume + a job posting)
    3. what to do (compare them, find the skills the job wants that the resume is missing)
    4. how to format the answer (so it comes back in a shape the frontend can display)

    Coordinate with the team on:
    - exactly what the analysis should include (just the gap? suggestions too?)
    - the output format/shape (has to match what AnalysisResult expects to display)
    - whether to give the AI examples (few-shot) to make its answers more consistent

*/