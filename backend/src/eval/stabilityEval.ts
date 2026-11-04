/*

    What is this file for?
    The STABILITY EVAL - measures how consistent each ranking method is when run again on the
    same candidates. A recruiter should get the same shortlist on Tuesday as on Monday.

    It compares:
    - POINTWISE: the original flow - each resume scored alone (matchResume + computeScore)
    - PAIRWISE:  candidates judged two at a time (judgePair) and ranked with Bradley-Terry

    What it does:
    1. takes one job posting from the golden dataset and uses EVERY golden resume as a candidate
       (a mix of strong and weak fits for that job)
    2. extracts the requirements ONCE, so both methods are scored against the same list
       (this measures scoring stability, not requirement extraction)
    3. runs each method K times and prints:
       - per-candidate score std-dev across runs (pointwise)
       - mean Kendall tau-b between every pair of runs, for each method (1 = identical order)
       - top-1 agreement between runs, for each method

    Run it with `npm run eval:stability`. Needs OPENAI_API_KEY in backend/.env. Settings (optional env):
      STABILITY_RUNS=3       K, how many times each method runs
      STABILITY_ROUNDS=2     pairwise rounds (2 = every pair in both orders)
      STABILITY_JOB_INDEX=0  which golden case's job posting to use
    Cost: K * (candidates + rounds * candidates*(candidates-1)/2) AI calls. Not run in CI;
    the statistics are unit tested in stabilityStats.test.ts.

*/

import goldenDataset from './goldenDataset'
import { mean, meanPairwiseTau, perCandidateStdDev, ScoreRun, top1Agreement, topIds } from './stabilityStats'
import { extractRequirements, matchResume } from '../services/openaiService'
import { judgePair } from '../services/pairwiseJudge'
import { buildSchedule } from '../services/pairSchedule'
import { fitBradleyTerry, Outcome } from '../services/bradleyTerry'
import { runLimited } from '../services/biasAudit'
import { redactContactInfo } from '../services/redact'
import { computeScore, normalizeMatches } from '../services/scoring'
import { Requirement } from '../types'

const CONCURRENCY = 3

function intFromEnv(name: string, fallback: number): number {
    const value = Number(process.env[name])
    return Number.isInteger(value) && value >= 0 ? value : fallback
}

type Candidate = { id: string; text: string }

async function pointwiseRun(apiKey: string, requirements: Requirement[], candidates: Candidate[]): Promise<ScoreRun> {
    const scores = await runLimited(
        candidates.map((candidate) => async () => {
            const match = await matchResume(apiKey, requirements, candidate.text)
            return computeScore(requirements, normalizeMatches(requirements, match.matches))
        }),
        CONCURRENCY,
    )
    return Object.fromEntries(candidates.map((candidate, i) => [candidate.id, scores[i]!]))
}

async function pairwiseRun(apiKey: string, requirements: Requirement[], candidates: Candidate[], rounds: number, seed: string): Promise<ScoreRun> {
    const textById = new Map(candidates.map((candidate) => [candidate.id, candidate.text]))
    const schedule = buildSchedule(candidates.map((candidate) => candidate.id), rounds, seed)

    const outcomes = await runLimited(
        schedule.map((task) => async (): Promise<Outcome> => {
            const judgment = await judgePair(apiKey, requirements, textById.get(task.a)!, textById.get(task.b)!)
            const result = judgment.winner === 'A' ? 'a' : judgment.winner === 'B' ? 'b' : 'tie'
            return { a: task.a, b: task.b, result }
        }),
        CONCURRENCY,
    )

    const fit = fitBradleyTerry(candidates.map((candidate) => candidate.id), outcomes)
    return Object.fromEntries(fit.strengths.map((strength) => [strength.id, strength.logStrength]))
}

const runStabilityEval = async () => {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        console.error('Set OPENAI_API_KEY in backend/.env to run the stability eval.')
        process.exit(1)
    }

    const runs = Math.max(2, intFromEnv('STABILITY_RUNS', 3))
    const rounds = Math.max(1, intFromEnv('STABILITY_ROUNDS', 2))
    const jobCase = goldenDataset[intFromEnv('STABILITY_JOB_INDEX', 0)] ?? goldenDataset[0]!

    const candidates: Candidate[] = goldenDataset.map((testCase, i) => ({
        id: `c${i + 1}`,
        text: redactContactInfo(testCase.resume),
    }))

    console.log(`🚀 Stability eval (model: ${process.env.OPENAI_MODEL || 'default'}, K=${runs}, rounds=${rounds})`)
    console.log(`Job: ${jobCase.label}`)
    console.log(`Candidates: ${candidates.map((candidate, i) => `${candidate.id} = ${goldenDataset[i]!.label.slice(0, 50)}`).join('\n            ')}`)

    const requirements = await extractRequirements(apiKey, jobCase.jobPosting)
    if (requirements.length === 0) {
        console.error('This job posting has no concrete requirements; pick another STABILITY_JOB_INDEX.')
        process.exit(1)
    }
    console.log(`Requirements: ${requirements.map((r) => `${r.requirement} (${r.importance})`).join('; ')}\n`)

    const pointwise: ScoreRun[] = []
    const pairwise: ScoreRun[] = []
    for (let k = 0; k < runs; k++) {
        console.log(`Run ${k + 1}/${runs}...`)
        pointwise.push(await pointwiseRun(apiKey, requirements, candidates))
        //a different seed per run, so the pair order differs too (as it would across real runs)
        pairwise.push(await pairwiseRun(apiKey, requirements, candidates, rounds, `stability-${k}`))
    }

    console.log('\nPointwise scores per run, and std-dev across runs:')
    const stdDevs = perCandidateStdDev(pointwise)
    for (const candidate of candidates) {
        const scores = pointwise.map((run) => run[candidate.id]).join(', ')
        console.log(`  ${candidate.id}: [${scores}]  sd=${stdDevs[candidate.id]!.toFixed(2)}`)
    }
    console.log(`  mean sd: ${mean(Object.values(stdDevs)).toFixed(2)} points`)

    console.log('\nPairwise (Bradley-Terry) top candidate per run:')
    pairwise.forEach((run, k) => console.log(`  run ${k + 1}: ${topIds(run).join(', ')}`))

    console.log(`\n============================`)
    console.log(`                     pointwise   pairwise`)
    console.log(`mean Kendall tau-b   ${meanPairwiseTau(pointwise).toFixed(3).padStart(9)}   ${meanPairwiseTau(pairwise).toFixed(3).padStart(8)}`)
    console.log(`top-1 agreement      ${top1Agreement(pointwise).toFixed(3).padStart(9)}   ${top1Agreement(pairwise).toFixed(3).padStart(8)}`)
    console.log(`============================`)
}

runStabilityEval().catch((error) => {
    console.error('❌ Stability eval failed:', error)
    process.exit(1)
})
