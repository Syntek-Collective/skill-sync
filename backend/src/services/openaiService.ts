/*

    What is this service for?
    Talks to the AI (OpenAI). This is the specialist for sending text to the AI and 
    getting a response back.

    What does it do?
    A controller hands it the resume text + job posting (and the prompt), and it sends 
    that to the AI and returns the AI's response (the skill-gap analysis).
    That's its one job: talk to the AI.

    (see services/README for how services work in general)

*/

/*

    TODO
    build out the AI call.

    This file will need to:
    1. take in the resume text + job posting
    2. build the message to send (using the prompt from prompt.ts)
    3. send it to the OpenAI API (gpt-4o-mini)
    4. return the AI's response (the analysis)

    Coordinate with the team on:
    - the exact prompt (lives in prompt.ts - this service USES it)
    - what shape the AI should return (so the controller can send it back to the frontend)
    - the model + any settings (gpt-4o-mini, etc.)

*/