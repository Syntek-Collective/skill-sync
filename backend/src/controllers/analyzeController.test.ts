/*

    What is this file for?
    Tests for the analyzeController - checks that the CONTROLLER works correctly.
    (This is a CODE test - "does the code run right" - separate from the golden
     dataset, which tests "is the AI's output good")

    What does it test?
    That the controller does its job: pulls the right data from the request,
    calls the services in the right order, and responds with the right shape.

    The flow it should verify:
    - given a request with a resume filePath + job posting
    - it calls the services (fetch file, extract text, call the AI)
    - it responds with { result, id, createdAt }
    - it handles errors (missing data, a service failing)

    (see controllers/README for how controllers work in general)

*/

/*

    TODO
    write the tests once analyzeController is built.

    Coordinate with the team on:
    - test framework (Jest or Vitest?)
    - how to MOCK the services (so tests don't actually call the AI / database -
      we test the controller's logic, not the real services)
    - the agreed response shape (so we test against what the frontend expects)

*/