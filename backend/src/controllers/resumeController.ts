/*

    What feature is it for?
    Handles the resume feature - anything to do with the user's uploaded resume on the backend.

    What does this controller do?
    This is the "doer" for resume. The resume routes direct requests here, and this 
    controller handles them: reads the request, uses the services to do the work, and 
    sends back the result.

    The flow:
    Receive → Do the work (call the services) → Respond

    (see controllers/README for how controllers work in general)

*/

/*

    TODO
    build out the resume handler(s).

    NOTE: the resume already gets uploaded to storage from the FRONTEND modal, which sends 
    up a filePath. So figure out with the team what the BACKEND still needs to do here - 
    e.g. does it just need to fetch/extract text (and is that done in the analyze flow 
    instead?), or does it need its own routes at all?

    This file might need to:
    1. pull whatever it needs out of the request (a filePath?)
    2. use the services to do the work (fetch from storage? extract text?)
    3. send back the result

    Coordinate with the team on:
    - what the backend resume controller is actually responsible for (vs the frontend modal 
      and the analyze flow already handling upload + text extraction)
    - whether this controller is even needed, or if its work belongs in analyzeController

*/