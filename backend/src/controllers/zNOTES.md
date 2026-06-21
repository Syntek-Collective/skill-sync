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

Example (analyze):
  GOAL: skill-gap analysis
  ← need: resume TEXT + job posting fed to the AI
  ← but I only have a filePath (not text), so: extract text from the PDF
  ← but the PDF is in storage, so: fetch the file using the filePath
  ← I HAVE the filePath ✅ (reached what I have)

  flip it forward = the steps:
  fetch file (supabaseService) → extract text (pdfService) → send to AI (openaiService) → analysis

Each step is usually a service call (each does one specialized job).