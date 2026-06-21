/*

    What feature is it for?
    Handles the auth feature - logging users in and signing them up.

    What does this controller do?
    This is the "doer" for auth. The auth routes direct requests here, and this controller 
    handles them: reads the credentials from the request, uses Supabase to log in / sign up, 
    and sends back whether it worked (and the user info).

    The flow:
    Receive → Do the work (call the services) → Respond

    (see controllers/README for how controllers work in general)

*/

/*

    TODO
    build out the auth handler(s) - probably more than one (login AND signup).

    This file still needs to:
    1. pull the user's credentials out of the request (email/password, etc.)
    2. use the service to do the work:
       - sign up: create the new user (supabaseService)
       - log in: check the credentials (supabaseService)
    3. send back whether it succeeded + the user info the frontend needs
    4. handle failures (wrong password, user already exists, etc.)

    Coordinate with the team on:
    - the exact field names the frontend sends (email? password?)
    - what the response should look like (what user info does the frontend need back?)
    - how auth/sessions are handled (Supabase auth? tokens? - whoever owns auth decides)

*/