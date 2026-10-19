# SERVICES


# What is a service?
A service is a helper file that does ONE specific kind of job (talking to the database, 
calling the AI, extracting text from a PDF, etc.)

Controllers CALL services to do the actual heavy lifting - the service is the specialist 
that knows how to do that one job.


# Why separate services out?
- keeps the controllers clean (they coordinate; services do the heavy work)
- reusable - more than one controller can use the same service
- organized - all the "talk to the AI" logic lives in one place, all the "talk to the 
  database" logic in another


# Controller vs Service
A controller COORDINATES the steps (the conductor).
A service DOES one specific step (a musician who plays one instrument).


# Our services
- supabaseService → talks to the database/storage (only for SAVED jobs: fetch files, save/read/delete data)
- pdfService      → extracts the text out of a PDF file
- openaiService   → talks to the AI: extractRequirements (once per job) + matchResume (once per resume)
- redact          → removes emails, phone numbers and links from resume text before the AI sees it
- scoring         → turns the AI's met / partial / not met judgments into a score + band (no AI involved)




NOTE: a service should do its ONE job well and not worry about the request/response - 
that's the controller's job. Services just take an input, do their job, return a result.

NOTE: services are the only files that should talk to the outside stuff (the database, the 
AI, etc.) - controllers go THROUGH services, they don't reach out directly





# General concepts (apply across services)


# How the backend reads .env (dotenv)
Plain Node (the backend) does NOT read .env files automatically (Vite does that for the 
frontend, but Node doesn't).
So the backend uses dotenv to LOAD the .env file - this makes values like SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY and OPENAI_MODEL available to the code via process.env.
(the OpenAI key is NOT in .env for the app - each user brings their own, sent with each request.
 OPENAI_API_KEY in .env is only for the eval script.)

    import 'dotenv/config'   ← loads the .env so the keys are usable

(any service that needs a secret key relies on this)


# The resume's journey: PDF → text
The resume starts as a PDF. How it reaches the backend depends on the mode:
  - private job (default): the PDF comes IN the request (base64) - nothing is stored
  - saved job: the PDF was uploaded to storage, and the request passes its id

By the time a service like openaiService needs the resume, it's already TEXT - because 
earlier steps converted it:

    private:  PDF from the request              →  pdfService extracts the text  →  redact  →  TEXT
    saved:    supabaseService fetches the PDF   →  pdfService extracts the text  →  redact  →  TEXT

So services receive the FINISHED data - they don't fetch or convert it themselves. The 
CONTROLLER runs those steps in order, THEN hands the result to the next service.


# How services connect to controllers (the flow)
A controller gathers what's needed, then calls services in order, passing each one's 
output to the next:

    controller (private mode):
      1. get the PDF + the job's requirements from the request
      2. call pdfService → extract the text
      3. call redact → remove contact details
      4. call openaiService.matchResume(apiKey, requirements, resumeText) → the AI's judgments
      5. call scoring → score + band
      6. send the result back (saved mode also calls supabaseService to save it)

So a service only ever RECEIVES what it needs (as parameters) and RETURNS a result. It 
never reaches back to the request or to other services.


# Talking to the AI (OpenAI concepts)
- the CLIENT is an authenticated connection to OpenAI, created with an API key 
  (the key identifies + bills the account). it's just the connection - a function uses it to 
  actually make a call.
- BYOK ("bring your own key"): the key is the USER'S, sent with each request, so a new client
  is created for every call - and the key is never stored or logged.
- we use the RESPONSES API (openai.responses.create), which takes:
    - instructions = HOW the AI should behave - our prompt
    - input        = WHAT to work on - the resume text + the job's requirements
  (the older Chat Completions API used a 'messages' array with 'system' / 'user' roles instead)
- the prompts (the instructions) live in prompt.ts - services IMPORT them, they don't 
  write them inline. there are two: requirementsPrompt and matchPrompt.
- text.format with a strict JSON SCHEMA makes the AI reply in exactly the shape we describe,
  so JSON.parse(response.output_text) always works.
- the model comes from OPENAI_MODEL (default gpt-5-mini), so it can be changed without code.
