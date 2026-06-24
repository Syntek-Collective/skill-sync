/*

    What is this file for?
    Handles the resume feature on the backend - IF the backend needs to do anything
    with resumes beyond what's already handled elsewhere.

    IMPORTANT - this controller's role is UNCERTAIN:
    - the frontend ResumeModal already UPLOADS the resume to Supabase + sends up a filePath
    - the analyze flow already FETCHES the resume + EXTRACTS the text (via the services)
    So between those two, there may be little or nothing left for a backend resume
    controller to do.

    What does this controller do?
    (TBD - depends on whether there's resume work not already covered)

    (see controllers/README for how controllers work in general)

*/

/*

    TODO
    FIRST - decide as a team whether this controller is even needed.

    Ask: is there any resume work the backend must do that ISN'T already handled by:
    - the frontend modal (upload + filePath), or
    - the analyze flow (fetch from storage + extract text)?

    Possible reasons it MIGHT be needed:
    - deleting a resume
    - listing a user's resumes
    - validating / re-fetching a resume separately
    If none of these apply, this controller (and its routes) can be DROPPED.

    Coordinate with the team on:
    - whether this controller exists at all
    - if it does, exactly what it's responsible for (so it doesn't overlap with the
      modal or the analyze flow)

*/