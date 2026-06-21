/*

    What feature is it for?
    Handles the analyze feature - comparing a resume to a job posting to find the skill gap.

    What does this controller do?
    This is the "doer" for analyze. The analyze route directs requests here, and this 
    controller handles the whole job: reads the request, calls the services to do the 
    work, and sends the result back.

    The flow:
    Receive → Do the work (call the services) → Respond

    (see controllers/README for how controllers work in general)

*/

/*

    TODO
    build out the analyze handler.

    This file still needs to:
    1. pull the resume filePath + job posting out of the request
    2. use the services (in order) to do the work:
       - get the resume file from storage (supabaseService)
       - turn the PDF into text (pdfService)
       - send the text + job posting to the AI to get the skill gap (openaiService + prompt)
    3. send the result back to the frontend
    4. handle the case where something goes wrong (bad request, a service fails, etc.)

    Coordinate with the team on:
    - the exact field names the frontend sends (resume? jobPosting?)
    - what the response should look like (does it include id / createdAt for history?)
    - whether the result also gets saved to the database here

*/