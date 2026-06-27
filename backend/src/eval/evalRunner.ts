/*

    What is this file for?
    The EVAL RUNNER - this is what actually MEASURES whether our AI is doing a good job.
    It runs the AI against every case in the golden dataset and scores the results.

    This is DIFFERENT from the .test.ts files:
    - .test.ts files test "does the CODE run correctly"
    - this tests "is the AI's OUTPUT good" (the quality of the analysis)

    What it does:
    1. take each case from the golden dataset (input + expected output)
    2. run the AI on the input (call our analyze flow / openaiService)
    3. compare the AI's actual output to the expected output
    4. score it (how many passed? how close?)
    5. report the results (e.g. "4/5 passed = 80%")

    Why it matters:
    This is how we know if we're IMPROVING. Run it, get a baseline score, then tune
    the prompt and run again - if the score goes up, we improved. It's the core of our
    evaluation layer (and a key thing that makes this project stand out).

    (this is GROUP work - the prompt + golden dataset + this runner are built together)

*/

/*

    TODO
    build the eval runner.

    This file will need to:
    1. import the golden dataset (the test cases)
    2. loop through each case - run the AI on the input
    3. compare the AI output to the expected output (the SCORING METHOD)
    4. tally the score and report it

    The BIG decision to make as a team - the SCORING METHOD (how do we decide a
    "pass"?). Options:
    - exact match (usually too strict for AI - outputs vary)
    - key fields present (does the output include the right skill gaps?)
    - semantic similarity (is it close enough in meaning?)
    - LLM-as-judge (use another AI to grade the output)

    Coordinate with the team on:
    - the scoring method (the crux - decide this together)
    - whether to run against the live server (HTTP requests) or call the functions directly
    - what counts as a passing score overall

*/

import goldenDataset from './goldenDataset'
import getAnalysis from '../services/openaiService'

console.log("File is Running")

const runEval = async () => {
    let passed = 0;
    console.log("🚀 Starting Evaluation Runner...")

    for (const testCase of goldenDataset) {
    console.log("Running Test:", testCase.label);

    try {
        const aiResponse = await getAnalysis(testCase.resume, testCase.jobPosting);

        // turn the string into an object so we can check its fields
        const ai = JSON.parse(aiResponse);

        // assume the test passes until a check fails
        let testPassed = true;

        // CHECK 1: is the score in the expected range?
        // get the low and high from expectedScoreRange
        // if the AI's matchScore is below low OR above high → testPassed = false
        if (ai.matchScore < testCase.expectedScoreRange[0] || ai.matchScore> testCase.expectedScoreRange[1]) {
            console.log(`❌ Score FAIL: Expected ${testCase.expectedScoreRange.join('-')}, got ${ai.matchScore}`)
            testPassed = false;
        }


        // CHECK 2: did the AI catch the missing skills?
        // make a list of the skill names the AI marked missing
        // for each expected missing skill:
        //   if it's NOT in the AI's missing list → testPassed = false
        if (ai.fitLevel !== testCase.expectedFitLevel) {
            console.log(`❌ FitLevel FAIL: Expected ${testCase.expectedFitLevel}, got ${ai.fitLevel}`);
            testPassed = false;
        }

        // CHECK 3: does the fit level match?
        // if the AI's fitLevel is NOT equal to expectedFitLevel → testPassed = false
        const missingSkillsMatch = testCase.expectedMissingSkills.every(expected =>
            ai.missingSkills.some((actual: any) => {
                const a = actual.skill.toLowerCase();
                const e = expected.skill.toLowerCase();
                // short skills (like "C", "git") need an exact word match to avoid false hits
                if (e.length <= 3) {
                    return a === e || a.split(/\s+/).includes(e);
                }
                // longer skills can use loose matching
                return a.includes(e) || e.includes(a);
            })
        );

        const missingSkills = ai.missingSkills || [];

        if (!missingSkillsMatch) {
            console.log("❌ Missing Skills FAIL")
            console.log(`❌: Expected ${JSON.stringify(testCase.expectedMissingSkills)}`);
            console.log(`   AI said: `, ai.missingSkills.map((s: any) => s.skill).join(", "));
            testPassed = false;
        }


        // after all checks: did it pass?
        // if testPassed → add 1 to passed, print PASS
        // else → print FAIL
        if (testPassed) {
            console.log("✅ PASS");
            passed++;
        }

    } catch (error) {
        console.error(`❌ Error on test "${testCase.label}":`, error);
    }
    }

    // after the loop: print the final score
    // print "FINAL SCORE: passed / total"
    console.log(`\n============================`);
    console.log(`FINAL SCORE: ${passed} / ${goldenDataset.length}`);
    console.log(`============================`);
};

runEval();