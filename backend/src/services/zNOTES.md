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
- supabaseService → talks to the database/storage (fetch files, save/read data)
- pdfService      → extracts the text out of a PDF file
- openaiService   → sends text to the AI and gets a response back




NOTE: a service should do its ONE job well and not worry about the request/response - 
that's the controller's job. Services just take an input, do their job, return a result.

NOTE: services are the only files that should talk to the outside stuff (the database, the 
AI, etc.) - controllers go THROUGH services, they don't reach out directly





# General concepts (apply across services)


# How the backend reads .env (dotenv)
Plain Node (the backend) does NOT read .env files automatically (Vite does that for the 
frontend, but Node doesn't).
So the backend uses dotenv to LOAD the .env file - this makes secret values like 
OPENAI_API_KEY available to the code via process.env.

    import 'dotenv/config'   ← loads the .env so the keys are usable

(any service that needs a secret key relies on this)


# The resume's journey: filePath → text
The resume starts as a PDF (the frontend uploads it and passes a filePath - a pointer).
By the time a service like openaiService needs the resume, it's already TEXT - because 
earlier steps converted it:

    filePath  →  supabaseService fetches the PDF  →  pdfService extracts the text  →  TEXT

So services receive the FINISHED data - they don't fetch or convert it themselves. The 
CONTROLLER runs those steps in order, THEN hands the result to the next service.


# How services connect to controllers (the flow)
A controller gathers what's needed, then calls services in order, passing each one's 
output to the next:

    controller:
      1. get the filePath + job posting from the request
      2. call supabaseService → fetch the PDF
      3. call pdfService → extract the text
      4. call openaiService(resumeText, jobText) → get the analysis
      5. send the result back

So a service only ever RECEIVES what it needs (as parameters) and RETURNS a result. It 
never reaches back to the request or to other services.


# Talking to the AI (OpenAI concepts)
- the CLIENT is an authenticated connection to OpenAI, created with our API key 
  (the key identifies + bills us). it's just the connection - a function uses it to 
  actually make a call.
- the AI call sends MESSAGES, each with a ROLE:
    - 'system'    = the INSTRUCTIONS (how the AI should behave) - our prompt
    - 'user'      = the DATA / request (the actual resume + job)
    - 'assistant' = the AI's own replies
  so the prompt goes in a 'system' message, the resume + job in a 'user' message.
- the prompt (the instructions) lives in prompt.ts - services IMPORT it, they don't 
  write it inline.
- the AI's reply comes back NESTED in a big response object; the actual answer is at 
  response.choices[0].message.content.