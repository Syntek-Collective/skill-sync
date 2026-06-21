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