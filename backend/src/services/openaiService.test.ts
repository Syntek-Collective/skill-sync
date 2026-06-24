/*

    What is this file for?
    Tests for the openaiService - checks that the AI service works correctly.
    (CODE test - does it call the AI and return the right shape - separate from
     the golden dataset, which judges the QUALITY of the AI's answers)

    What does it test?
    That the service takes in the resume text + job posting, sends them to the AI,
    and returns a response in the expected shape.

    What to verify:
    - given resume text + a job posting, it returns a result
    - the result is the shape the controller expects
    - it handles the AI call failing

    (see services/README for how services work in general)

*/

/*

    TODO
    write the tests once openaiService is built.

    Coordinate with the team on:
    - test framework (Jest or Vitest?)
    - how to MOCK the OpenAI call (so tests don't actually hit the API / cost money -
      we test our service's logic, not OpenAI itself)
    - the expected response shape

*/

