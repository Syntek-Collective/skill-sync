/*

    What is this file for?
    Tests for the historyController - checks that fetching past analyses works.

    What does it test?
    That the controller pulls the right user's history and responds with the
    list in the right shape.

    What to verify:
    - it fetches the correct user's past analyses
    - it responds with the list in the shape the frontend's HistoryModal expects
    - it handles no history / a fetch failure

    (see controllers/README for how controllers work in general)

*/

/*

    TODO
    write the tests once historyController is built.

    Coordinate with the team on:
    - test framework (Jest or Vitest?)
    - how to MOCK the database
    - the history item shape (must match the frontend's HistoryModal: id, jobListing,
      result, createdAt - and we decided id & createdAt are STRINGS)

*/