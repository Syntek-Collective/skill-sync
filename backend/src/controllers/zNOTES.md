# CONTROLLER


# What is a controller?
A controller is a doer, when a route directs a request the controller handles it (reads the request, does the work, sends a response)

# Universal Shape of a Controller
1. Receive - pull the data the frontend sent inside of the request package
2. Do the work - the actual job (usually by calling services like a database, AI, etc.)
3. Respond - send something back to the frontend/user


# Controller v.s Router
A router directs where as a controller does 


# req & res
req (request) = what came in - the data the frontend sent, you READ from this 

res (response) = what goes back - what you send to the frontend, you SEND with this 



# How to Figure Out a Controller's Steps (work backwards)
Don't guess the steps forwards - start at the GOAL and work backwards to what you already have.

Ask: "what do I need to make this? ...and what do I need for THAT?"
Keep going backwards until you reach what you already have, then flip it forward = your steps.

Why backwards? The goal is always clear, so it's easier to reason back from it 
than to guess where to start.

Example (analyze - one resume against one job, private mode):
  GOAL: a scored skill match for this resume
  ← need: a score, so: calculate it from the AI's met / partial / not met judgments (scoring)
  ← need: those judgments, so: send the resume TEXT + the job's requirements to the AI (openaiService)
  ← the AI shouldn't see contact details, so: redact the text first (redact)
  ← need: resume TEXT, but I have a PDF, so: extract text from the PDF (pdfService)
  ← I HAVE the PDF (sent in the request as base64) + the requirements ✅ (reached what I have)

  flip it forward = the steps:
  decode PDF → extract text (pdfService) → redact (redact) → match (openaiService) → score (scoring) → respond

  (saved mode adds steps at the start: look up the user's saved resume + job, fetch the PDF from
   storage (supabaseService) - and one at the end: save the result)

Each step is usually a service call (each does one specialized job).


# Our controllers
- analyzeController.ts
    - requirementsController → POST /api/analyze/requirements (the job's requirement list, once per job)
    - analyzeController      → POST /api/analyze (one resume against that list)
- historyController.ts
    - getHistory             → GET /api/history (original history endpoint; not used by the current frontend)
    - deleteJobController    → DELETE /api/history/:jobPostingId (Past jobs → Delete job)

Every controller takes the user from res.locals.user (set by authMiddleware after it checks the
login token) - never from the request body, which anyone could fake.
(full request/response details: docs/ARCHITECTURE.md)