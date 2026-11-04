/*

    What is this file for?
    The pure statistics behind the stability eval (stabilityEval.ts), kept separate so they can be
    unit tested without calling the AI.

    Each "run" is a map of candidate id -> score from one full pass over the candidates:
    - pointwise: the 0-100 score from computeScore
    - pairwise:  the Bradley-Terry logStrength

    Why compare SCORES rather than rankings?
    Pointwise scores are integers that often tie (two candidates both at 50). Turning ties into a
    strict ranking would break them arbitrarily, and the same arbitrary tie-break in every run would
    make pointwise look more stable than it is. Kendall's tau-b over the scores themselves handles
    ties honestly, and top-1 agreement treats a tie at the top as a coin flip.

*/

export type ScoreRun = Record<string, number>

export function mean(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

//sample standard deviation (n - 1); 0 for fewer than 2 values
export function standardDeviation(values: number[]): number {
    if (values.length < 2) return 0
    const average = mean(values)
    const squares = values.reduce((sum, value) => sum + (value - average) ** 2, 0)
    return Math.sqrt(squares / (values.length - 1))
}

//per candidate: the std-dev of its score across runs (only candidates present in every run)
export function perCandidateStdDev(runs: ScoreRun[]): Record<string, number> {
    const result: Record<string, number> = {}
    for (const id of sharedIds(runs)) {
        result[id] = standardDeviation(runs.map((run) => run[id]!))
    }
    return result
}

//Kendall's tau-b between two score maps over their shared ids (-1..1).
//Pairs tied in either run count towards the tie corrections, not as agreement or disagreement.
//Returns 1 if both runs tie everything (identical), 0 if only one does or fewer than 2 ids are shared.
export function kendallTauB(x: ScoreRun, y: ScoreRun): number {
    const ids = sharedIds([x, y])
    let concordant = 0
    let discordant = 0
    let tiedXOnly = 0
    let tiedYOnly = 0
    let tiedBoth = 0

    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const dx = Math.sign(x[ids[i]!]! - x[ids[j]!]!)
            const dy = Math.sign(y[ids[i]!]! - y[ids[j]!]!)
            if (dx === 0 && dy === 0) tiedBoth++
            else if (dx === 0) tiedXOnly++
            else if (dy === 0) tiedYOnly++
            else if (dx === dy) concordant++
            else discordant++
        }
    }

    const pairs = concordant + discordant + tiedXOnly + tiedYOnly + tiedBoth
    if (pairs === 0) return 0

    const untiedX = pairs - tiedXOnly - tiedBoth
    const untiedY = pairs - tiedYOnly - tiedBoth
    if (untiedX === 0 && untiedY === 0) return 1
    if (untiedX === 0 || untiedY === 0) return 0

    return (concordant - discordant) / Math.sqrt(untiedX * untiedY)
}

//mean Kendall tau-b over every pair of runs; 1 for fewer than 2 runs (nothing to disagree with)
export function meanPairwiseTau(runs: ScoreRun[]): number {
    const taus: number[] = []
    for (let i = 0; i < runs.length; i++) {
        for (let j = i + 1; j < runs.length; j++) taus.push(kendallTauB(runs[i]!, runs[j]!))
    }
    return taus.length > 0 ? mean(taus) : 1
}

//the ids sharing the highest score in a run
export function topIds(run: ScoreRun): string[] {
    const entries = Object.entries(run)
    if (entries.length === 0) return []
    const best = Math.max(...entries.map(([, score]) => score))
    return entries.filter(([, score]) => score === best).map(([id]) => id)
}

//Top-1 agreement over every pair of runs: the chance that both runs pick the same top candidate
//when ties at the top are broken at random, i.e. |A ∩ B| / (|A| * |B|) for top sets A and B.
//1 for fewer than 2 runs.
export function top1Agreement(runs: ScoreRun[]): number {
    const agreements: number[] = []
    for (let i = 0; i < runs.length; i++) {
        for (let j = i + 1; j < runs.length; j++) {
            const a = topIds(runs[i]!)
            const b = new Set(topIds(runs[j]!))
            if (a.length === 0 || b.size === 0) {
                agreements.push(0)
                continue
            }
            const shared = a.filter((id) => b.has(id)).length
            agreements.push(shared / (a.length * b.size))
        }
    }
    return agreements.length > 0 ? mean(agreements) : 1
}

function sharedIds(runs: ScoreRun[]): string[] {
    if (runs.length === 0) return []
    return Object.keys(runs[0]!).filter((id) => runs.every((run) => id in run))
}
