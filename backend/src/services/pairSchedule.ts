/*

    PAIR SCHEDULE

    What this file does:
    Decides which pairs of candidates the AI compares, in what order, and who is shown first.
      - buildSchedule(ids, rounds, seed) - every unordered pair once per round
      - hashSeed / mulberry32 / shuffle   - a tiny seeded random generator (also used by biasAudit)

    Notes:
    - pure and deterministic: the same ids, rounds and seed always give the same schedule.
      That matters because a run that resumes after a restart rebuilds its schedule and skips
      the tasks it already has - the schedule must come out identical.
    - POSITION BIAS: language models tend to prefer whichever candidate is shown first (or second).
      Each pair's presentation order is picked at random once, then FLIPPED on every odd round,
      so with 2 rounds every pair is judged once in each order and the bias cancels out.
    - task order is shuffled per round so no candidate gets all its comparisons in a row.
    - seq is the task's position in the returned array (0, 1, 2, ...), stable for a given seed.

*/

export type PairTask = { seq: number; a: string; b: string } // a is shown first ("Candidate A")

export function buildSchedule(ids: string[], rounds: number, seed: string): PairTask[] {
    const unique = [...new Set(ids)]
    const roundCount = Math.max(0, Math.floor(rounds))
    if (unique.length < 2 || roundCount === 0) return []

    const random = mulberry32(hashSeed(`schedule:${seed}`))

    //every unordered pair once, with a random (but seeded) base presentation order
    const pairs: [string, string][] = []
    for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
            const first = unique[i]!
            const second = unique[j]!
            pairs.push(random() < 0.5 ? [first, second] : [second, first])
        }
    }

    const tasks: PairTask[] = []
    for (let round = 0; round < roundCount; round++) {
        const flip = round % 2 === 1
        for (const [first, second] of shuffle(pairs, random)) {
            const [a, b] = flip ? [second, first] : [first, second]
            tasks.push({ seq: tasks.length, a, b })
        }
    }

    return tasks
}

// ===== seeded randomness (no dependencies) =====

//32-bit string hash (FNV-1a), turns a text seed like a run id into a number seed
export function hashSeed(text: string): number {
    let hash = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}

//mulberry32: a small, fast PRNG with good enough statistics for shuffling and bootstrapping.
//Returns a function giving floats in [0, 1).
export function mulberry32(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

//Fisher-Yates shuffle into a new array (the input is left alone)
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        const temp = copy[i]!
        copy[i] = copy[j]!
        copy[j] = temp
    }
    return copy
}
