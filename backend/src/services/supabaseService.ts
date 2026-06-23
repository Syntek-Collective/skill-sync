/*

    What is this service for?
    Talks to Supabase - the database AND file storage. This is the specialist for 
    anything that needs to read from or write to Supabase.

    What does it do?
    Other files (controllers) call this service when they need to fetch a file from 
    storage, or save/read data in the database. It does that ONE kind of job: Supabase.

    (see services/README for how services work in general)

*/

/*

    TODO
    build out the Supabase helper functions.

    This file will probably need functions to:
    - fetch a file from storage using a filePath (for the resume)
    - save an analysis to the database (for history)
    - read a user's past analyses from the database (for history)

    Coordinate with the team on:
    - where the Supabase client is set up/configured (there's no config file yet)
    - exactly what data shapes get saved/read (has to match the frontend + other controllers)

*/