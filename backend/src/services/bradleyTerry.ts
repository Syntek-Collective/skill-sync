/*

    BRADLEY-TERRY

    What this file does:
    Turns a pile of pairwise outcomes ("A beat B", "B beat C", "A and C tied") into one latent
    strength per candidate. Under the Bradley-Terry model, P(i beats j) = s_i / (s_i + s_j).
      - fitBradleyTerry(ids, outcomes) - fits the strengths
      - winProbability(si, sj)         - the model's P(i beats j)
      - kendallTau(rankingA, rankingB) - how much two rankings agree (-1..1)

    Notes:
    - pure: no I/O, no randomness, so the same outcomes always give the same fit
    - fitted with the MM algorithm (Hunter 2004, "MM algorithms for generalized Bradley-Terry models"):
        s_i <- W_i / sum_j ( n_ij / (s_i + s_j) )
      where W_i is i's (weighted) wins and n_ij the number of comparisons between i and j.
      Each update provably increases the likelihood, so no step size to tune.
    - ties count as half a win to each side
    - a small symmetric PRIOR: one virtual tie of weight `prior` (default 0.5) between every pair.
      Without it a candidate that wins (or loses) every comparison has infinite (or zero)
      strength, and candidates in disconnected parts of the comparison graph can't be placed
      on one scale. The prior pulls everyone gently towards "equal", like add-k smoothing.
    - strengths are only defined up to a common factor, so they're normalised to a geometric
      mean of 1 (mean logStrength = 0). A strength of 2 means "twice the odds of the average".

*/

export type Outcome = { a: string; b: string; result: 'a' | 'b' | 'tie' }
export type BTStrength = { id: string; strength: number; logStrength: number; wins: number; losses: number; ties: number }
export type BTFit = { strengths: BTStrength[]; iterations: number; converged: boolean }

const DEFAULT_PRIOR = 0.5
const DEFAULT_MAX_ITERATIONS = 1000
//stop when no log-strength moves more than this between iterations
const DEFAULT_TOLERANCE = 1e-9
//floor so a candidate with zero wins and prior 0 can't produce log(0) = -Infinity / NaN
const MIN_STRENGTH = 1e-12

export function fitBradleyTerry(
    ids: string[],
    outcomes: Outcome[],
    opts: { prior?: number; maxIterations?: number; tolerance?: number } = {},
): BTFit {
    const prior = Math.max(0, opts.prior ?? DEFAULT_PRIOR)
    const maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS
    const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE

    //unique ids, first occurrence order (used as the tie-break when sorting the result)
    const order = [...new Set(ids)]
    const n = order.length
    const index = new Map(order.map((id, i) => [id, i]))

    //comparisons[i][j] = n_ij, winsW[i] = W_i (ties = 0.5 each)
    const comparisons = order.map(() => new Array<number>(n).fill(0))
    const winsW = new Array<number>(n).fill(0)
    const tally = order.map(() => ({ wins: 0, losses: 0, ties: 0 }))

    for (const outcome of outcomes) {
        const i = index.get(outcome.a)
        const j = index.get(outcome.b)
        //outcomes about unknown candidates or a candidate against itself carry no information
        if (i === undefined || j === undefined || i === j) continue

        comparisons[i]![j]! += 1
        comparisons[j]![i]! += 1

        if (outcome.result === 'a') {
            winsW[i]! += 1
            tally[i]!.wins++
            tally[j]!.losses++
        } else if (outcome.result === 'b') {
            winsW[j]! += 1
            tally[j]!.wins++
            tally[i]!.losses++
        } else {
            winsW[i]! += 0.5
            winsW[j]! += 0.5
            tally[i]!.ties++
            tally[j]!.ties++
        }
    }

    //the prior: one virtual tie of weight `prior` with every other candidate
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) continue
            comparisons[i]![j]! += prior
            winsW[i]! += prior / 2
        }
    }

    let strengths = new Array<number>(n).fill(1)
    let iterations = 0
    let converged = n <= 1

    while (!converged && iterations < maxIterations) {
        iterations++

        const next = strengths.map((si, i) => {
            let denominator = 0
            for (let j = 0; j < n; j++) {
                const nij = comparisons[i]![j]!
                if (i === j || nij === 0) continue
                denominator += nij / (si + strengths[j]!)
            }
            //no comparisons at all (only possible with prior 0): nothing moves it, keep it put
            if (denominator === 0) return si
            return Math.max(winsW[i]! / denominator, MIN_STRENGTH)
        })

        const normalised = normaliseGeometric(next)
        const maxChange = Math.max(...normalised.map((s, i) => Math.abs(Math.log(s) - Math.log(strengths[i]!))))
        strengths = normalised
        if (maxChange < tolerance) converged = true
    }

    const result: BTStrength[] = order.map((id, i) => ({
        id,
        strength: strengths[i]!,
        logStrength: Math.log(strengths[i]!),
        ...tally[i]!,
    }))

    //strongest first; Array.prototype.sort is stable, so equal strengths keep input order
    result.sort((x, y) => y.strength - x.strength)

    return { strengths: result, iterations, converged }
}

//rescales so the geometric mean is 1 (the mean of the logs is 0)
function normaliseGeometric(strengths: number[]): number[] {
    if (strengths.length === 0) return strengths
    const meanLog = strengths.reduce((sum, s) => sum + Math.log(s), 0) / strengths.length
    const factor = Math.exp(meanLog)
    return strengths.map((s) => s / factor)
}

//the model's probability that a candidate with strength si beats one with strength sj
export function winProbability(si: number, sj: number): number {
    const total = si + sj
    return total > 0 ? si / total : 0.5
}

//Kendall's tau between two rankings (best first), over the ids they share.
//+1 = same order, -1 = reversed, 0 = unrelated. Rankings are strict orders, so there are no ties.
//Returns 0 when fewer than 2 ids are shared (no pairs to compare = no evidence either way).
export function kendallTau(rankingA: string[], rankingB: string[]): number {
    const positionB = new Map<string, number>()
    rankingB.forEach((id, position) => {
        if (!positionB.has(id)) positionB.set(id, position)
    })

    const seen = new Set<string>()
    const shared = rankingA.filter((id) => {
        if (seen.has(id) || !positionB.has(id)) return false
        seen.add(id)
        return true
    })
    if (shared.length < 2) return 0

    //shared is in A's order, so a pair is concordant when B keeps that order
    let concordant = 0
    let discordant = 0
    for (let i = 0; i < shared.length; i++) {
        for (let j = i + 1; j < shared.length; j++) {
            if (positionB.get(shared[i]!)! < positionB.get(shared[j]!)!) concordant++
            else discordant++
        }
    }

    return (concordant - discordant) / (concordant + discordant)
}
