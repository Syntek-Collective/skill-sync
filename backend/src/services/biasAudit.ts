/*

    BIAS AUDIT

    What this file does:
    Matched-pair counterfactual audit of the EXISTING per-candidate scorer:
      - runBiasAudit(apiKey, requirements, resumes, attributes, opts) - one report per attribute

    For each resume and attribute, counterfactual.ts builds copies that differ only in one
    demographic proxy (a name, pronouns, graduation years). Each copy is scored with the real
    pipeline - matchResume -> normalizeMatches -> computeScore -> scoreBand - so the audit tests
    exactly what recruiters see. Because the copies are otherwise identical, the score difference
    isolates the proxy's effect.

    Statistics per attribute (pairs = every non-reference variant vs the reference, per resume):
    - meanDelta:   average (variant - baseline) score, in score points
    - ci95:        paired bootstrap 95% interval for meanDelta: resample the PAIRS with replacement
                   2000 times (seeded, so reruns give the same interval) and take the 2.5th / 97.5th
                   percentiles. Pairing matters: resumes differ a lot from each other, and resampling
                   whole pairs keeps that variation out of the interval. An interval that contains 0
                   means no evidence of an effect at this sample size.
    - flipRate:    share of pairs whose match band (Strong / Partial / Weak) changed
    - impactRatio: the four-fifths rule (US EEOC Uniform Guidelines): selection rate = share of
                   variants with that label scored "Strong match"; ratio = lowest rate / highest rate.
                   Below 0.8 is the conventional adverse-impact flag. null if nobody was selected.

    Notes:
    - runs: the AI isn't deterministic, so the same text can score differently call to call. Each
      variant is scored `runs` times and averaged, so ordinary noise isn't mistaken for bias.
    - REDACTION ORDER: contact details are redacted ONCE from the original resume, and the variants
      are built from that redacted text. So (1) every variant shares exactly the same redaction (redacting
      each variant separately could, in principle, treat them differently - e.g. a shifted year next to
      other digits forming a phone-like pattern), and (2) the "Name: ..." header is added AFTER redaction,
      so redaction can never strip or alter the very proxy being tested. The header itself contains
      no contact details, so nothing private is added.
    - at most `concurrency` (default 3) scoring calls run at once, to stay inside API rate limits.
      If any call fails the whole audit fails (a partial audit would be misleading).
    - variant texts are in the returned pairs for callers that need them; the HTTP route strips them.

*/

import { Requirement } from '../types'
import { matchResume } from './openaiService'
import { redactContactInfo } from './redact'
import { computeScore, normalizeMatches, scoreBand } from './scoring'
import { buildVariants, ProxyAttribute, Variant } from './counterfactual'
import { hashSeed, mulberry32 } from './pairSchedule'

export type AuditPair = { candidateId: string; baseline: Variant; variant: Variant; baselineScore: number; variantScore: number; delta: number }
export type AttributeReport = {
    attribute: ProxyAttribute
    pairs: AuditPair[]
    meanDelta: number            // variant - baseline, score points
    ci95: [number, number]       // paired bootstrap, 2000 resamples, seeded
    flipRate: number             // share of pairs whose match band changed
    impactRatio: number | null   // four-fifths rule: min/max selection rate (band = Strong match) across variant labels; null if none selected
}

export const BOOTSTRAP_RESAMPLES = 2000
const DEFAULT_RUNS = 2
const DEFAULT_CONCURRENCY = 3
const DEFAULT_SEED = 'bias-audit'

export async function runBiasAudit(
    apiKey: string,
    requirements: Requirement[],
    resumes: { id: string; text: string }[],
    attributes: ProxyAttribute[],
    opts: { runs?: number; seed?: string; concurrency?: number } = {},
): Promise<AttributeReport[]> {
    const runs = Math.max(1, Math.floor(opts.runs ?? DEFAULT_RUNS))
    const concurrency = Math.max(1, Math.floor(opts.concurrency ?? DEFAULT_CONCURRENCY))
    const seed = opts.seed ?? DEFAULT_SEED

    //redact once, before any variant is built (see REDACTION ORDER above)
    const redacted = resumes.map((resume) => ({ id: resume.id, text: redactContactInfo(resume.text) }))

    //plan every variant first, then score them all through one concurrency-limited queue
    const plan = [...new Set(attributes)].map((attribute) => ({
        attribute,
        candidates: redacted
            .map((resume) => ({ id: resume.id, variants: buildVariants(resume.text, attribute) }))
            .filter((candidate) => candidate.variants.length >= 2),
    }))

    const jobs: (() => Promise<number>)[] = []
    //scoreIndex[attribute][candidate][variant] = indices into jobs, one per run
    const scoreIndex = plan.map((entry) =>
        entry.candidates.map((candidate) =>
            candidate.variants.map((variant) =>
                Array.from({ length: runs }, () => {
                    jobs.push(() => scoreText(apiKey, requirements, variant.text))
                    return jobs.length - 1
                }),
            ),
        ),
    )

    const scores = await runLimited(jobs, concurrency)

    return plan.map((entry, a) => {
        const pairs: AuditPair[] = []
        //label -> [selected, total], for the four-fifths rule
        const selection = new Map<string, [number, number]>()

        entry.candidates.forEach((candidate, c) => {
            const averaged = candidate.variants.map((_variant, v) =>
                mean(scoreIndex[a]![c]![v]!.map((jobIndex) => scores[jobIndex]!)))

            candidate.variants.forEach((variant, v) => {
                const counts = selection.get(variant.label) ?? [0, 0]
                if (scoreBand(averaged[v]!) === 'Strong match') counts[0]++
                counts[1]++
                selection.set(variant.label, counts)
            })

            const baseline = candidate.variants[0]!
            const baselineScore = averaged[0]!
            candidate.variants.slice(1).forEach((variant, offset) => {
                const variantScore = averaged[offset + 1]!
                pairs.push({ candidateId: candidate.id, baseline, variant, baselineScore, variantScore, delta: variantScore - baselineScore })
            })
        })

        const deltas = pairs.map((pair) => pair.delta)
        const flips = pairs.filter((pair) => scoreBand(pair.baselineScore) !== scoreBand(pair.variantScore)).length

        return {
            attribute: entry.attribute,
            pairs,
            meanDelta: deltas.length > 0 ? mean(deltas) : 0,
            ci95: pairedBootstrapCI(deltas, `${seed}:${entry.attribute}`),
            flipRate: pairs.length > 0 ? flips / pairs.length : 0,
            impactRatio: impactRatio([...selection.values()]),
        }
    })
}

//one call through the existing scoring pipeline
async function scoreText(apiKey: string, requirements: Requirement[], text: string): Promise<number> {
    const match = await matchResume(apiKey, requirements, text)
    return computeScore(requirements, normalizeMatches(requirements, match.matches))
}


// ===== statistics (exported for tests) =====

export function mean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

//percentile bootstrap of the mean of paired differences. [0, 0] when there are no pairs.
export function pairedBootstrapCI(deltas: number[], seed: string, resamples = BOOTSTRAP_RESAMPLES): [number, number] {
    if (deltas.length === 0) return [0, 0]

    const random = mulberry32(hashSeed(`bootstrap:${seed}`))
    const means: number[] = []
    for (let r = 0; r < resamples; r++) {
        let sum = 0
        for (let i = 0; i < deltas.length; i++) {
            sum += deltas[Math.floor(random() * deltas.length)]!
        }
        means.push(sum / deltas.length)
    }
    means.sort((x, y) => x - y)

    return [quantile(means, 0.025), quantile(means, 0.975)]
}

//linear-interpolated quantile of a sorted array
function quantile(sorted: number[], q: number): number {
    const position = (sorted.length - 1) * q
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    const weight = position - lower
    return sorted[lower]! * (1 - weight) + sorted[upper]! * weight
}

//four-fifths rule: min selection rate / max selection rate across labels; null if nobody was selected
export function impactRatio(counts: [selected: number, total: number][]): number | null {
    const rates = counts.filter(([, total]) => total > 0).map(([selected, total]) => selected / total)
    if (rates.length === 0) return null
    const highest = Math.max(...rates)
    if (highest === 0) return null
    return Math.min(...rates) / highest
}

//runs async jobs with at most `limit` in flight; results keep the jobs' order.
//Stops starting new jobs after the first failure and rejects with it.
export async function runLimited<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
    const results = new Array<T>(jobs.length)
    let next = 0
    let failed = false

    async function worker() {
        while (!failed && next < jobs.length) {
            const index = next++
            try {
                results[index] = await jobs[index]!()
            } catch (error) {
                failed = true
                throw error
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker))
    return results
}
