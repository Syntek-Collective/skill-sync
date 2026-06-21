/*

    What is this file for?
    This is the auth MIDDLEWARE - a checkpoint that runs BEFORE protected routes, 
    to check if the user is actually logged in / allowed before letting them through.

    What is middleware?
    Code that runs in the MIDDLE - between a request arriving and the controller handling it.
    Like airport security before your gate: it checks the request and either lets it 
    CONTINUE to the controller, or STOPS it and sends back "not allowed."

    The flow:
    request → [auth middleware checks if logged in] → if OK, continue to controller
                                                    → if NOT, stop + send back an error

*/

/*

    TODO
    build out the auth check.

    This file still needs to:
    1. get whatever proves the user is logged in (a token / session from the request)
    2. check if it's valid (using Supabase auth)
    3. if valid → let the request continue on to the controller
       if not valid → stop it and send back an "unauthorized" response

    Coordinate with the team on:
    - how auth is tracked (Supabase session? a token? - has to match how authController logs people in)
    - which routes actually need this protection (analyze? history? - the logged-in-only ones)
    - what to send back when someone isn't authorized

*/