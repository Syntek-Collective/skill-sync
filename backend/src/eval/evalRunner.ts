/*

    What is this file for?
    The EVAL RUNNER - this is what actually MEASURES whether our AI is doing a good job.
    It runs the AI against every case in the golden dataset and scores the results.

    This is DIFFERENT from the .test.ts files:
    - .test.ts files test "does the CODE run correctly"
    - this tests "is the AI's OUTPUT good" (the quality of the skill match)

    What it does (same pipeline as the app, called directly instead of over HTTP):
    1. extract the job's requirements (extractRequirements)
    2. match the redacted resume against them (matchResume)
    3. score in code (normalizeMatches + computeScore + scoreBand)
    4. check the result against the case's answer key (evalChecks)
    5. report the results (e.g. "5 / 6 passed")

    Why it matters:
    This is how we know if we're IMPROVING. Run it, get a baseline score, then tune
    the prompts (or try another OPENAI_MODEL) and run again - if the score goes up, we improved.

    Run it with `npm run eval`. It uses OPENAI_API_KEY (and OPENAI_MODEL, if set) from
    backend/.env, and each full run costs a few cents.

*/

import goldenDataset from './goldenDataset'
import { checkCase } from './evalChecks'
import { extractRequirements, matchResume } from '../services/openaiService'
import { redactContactInfo } from '../services/redact'
import { computeScore, normalizeMatches, scoreBand } from '../services/scoring'

const runEval = async () => {
    // evals run with your own key from backend/.env (the app itself uses each user's key)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("Set OPENAI_API_KEY in backend/.env to run the evals.");
        process.exit(1);
    }

    let passed = 0;
    console.log(`🚀 Starting Evaluation Runner (model: ${process.env.OPENAI_MODEL || "default"})...`)

    for (const testCase of goldenDataset) {
        console.log("\nRunning Test:", testCase.label);

        try {
            const requirements = await extractRequirements(apiKey, testCase.jobPosting);

            // a posting with no concrete requirements has nothing to match against
            const candidateMatch = requirements.length > 0
                ? await matchResume(apiKey, requirements, redactContactInfo(testCase.resume))
                : null;

            const matches = normalizeMatches(requirements, candidateMatch?.matches ?? []);
            const score = computeScore(requirements, matches);
            const band = scoreBand(score);

            const failures = checkCase(testCase, { requirements, matches, score, band });

            if (failures.length === 0) {
                console.log(`✅ PASS (${score}%, ${band})`);
                passed++;
                continue;
            }

            for (const failure of failures) console.log(`❌ ${failure}`);

            // show what the AI did, so a failure can be diagnosed without rerunning
            console.log(`   Got ${score}% (${band}). Requirements:`);
            for (const requirement of requirements) {
                const match = matches.find((item) => item.requirementId === requirement.id);
                console.log(`   - [${match?.status}] ${requirement.requirement} (${requirement.importance})`);
            }
        } catch (error) {
            console.error(`❌ Error on test "${testCase.label}":`, error);
        }
    }

    console.log(`\n============================`);
    console.log(`FINAL SCORE: ${passed} / ${goldenDataset.length}`);
    console.log(`============================`);
};

runEval();
