/*

    What is this file for?
    Holds the shared TypeScript types/interfaces - the "shapes" of our data that multiple 
    backend files use (e.g. what an analysis result looks like, what a history item looks like).

    Why?
    Define a shape ONCE here, import it wherever it's needed - instead of redefining the 
    same shape in every file. Keeps the data shapes consistent across the backend.

    TODO
    add types as they come up while building, e.g.:
    - the shape of an analysis result
    - the shape of a history item (should match the frontend's historyArray shape)
    - request/response shapes if helpful

    Coordinate with the team on:
    - keeping these shapes matched to what the frontend expects (and what gets saved in the db)

*/