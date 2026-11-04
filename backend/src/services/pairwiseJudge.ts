/*

    PAIRWISE JUDGE

    What this file does:
    Asks the AI which of two resumes better shows the job's requirements:
      - judgePair(apiKey, requirements, resumeA, resumeB) - "A", "B" or "tie", with a reason

    Notes:
    - same pattern as openaiService: the user's own key (BYOK) with a client per call,
      store: false and the shared modelSettings(), Responses API with a strict JSON schema
    - both resume texts must already be redacted (redactContactInfo) - this file never sees contact details
    - the prompt is pairwisePrompt in prompt.ts
    - decidingRequirementIds is cleaned up in code: unknown or repeated ids are dropped, so
      events stored later only ever reference real requirements

*/

import OpenAI from 'openai'
import { pairwisePrompt } from '../prompt'
import { Requirement } from '../types'
import { modelSettings } from './openaiService'

export type PairJudgment = { winner: 'A' | 'B' | 'tie'; reason: string; decidingRequirementIds: string[] }

const pairSchema = {
    type: 'object',
    properties: {
        winner: { type: 'string', enum: ['A', 'B', 'tie'] },
        reason: { type: 'string' },
        decidingRequirementIds: { type: 'array', items: { type: 'string' } },
    },
    required: ['winner', 'reason', 'decidingRequirementIds'],
    additionalProperties: false,
}

export async function judgePair(
    apiKey: string,
    requirements: Requirement[],
    resumeA: string,
    resumeB: string,
): Promise<PairJudgment> {
    const openai = new OpenAI({ apiKey })

    const response = await openai.responses.create({
        ...modelSettings(),
        instructions: pairwisePrompt,
        input:
            `Requirements:\n${JSON.stringify(requirements)}\n\n` +
            `Candidate A resume:\n${resumeA}\n\n` +
            `Candidate B resume:\n${resumeB}`,
        text: { format: { type: 'json_schema', name: 'pair_judgment', strict: true, schema: pairSchema } },
    })

    const parsed = JSON.parse(response.output_text) as PairJudgment

    const knownIds = new Set(requirements.map((requirement) => requirement.id))
    const decidingRequirementIds = [...new Set(parsed.decidingRequirementIds)].filter((id) => knownIds.has(id))

    return { winner: parsed.winner, reason: parsed.reason, decidingRequirementIds }
}
