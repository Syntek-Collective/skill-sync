/*

    OPENAI SERVICE

    What this file does:
    The specialist that talks to the AI, for the two steps of the skill match:
      - extractRequirements(apiKey, jobText) - the job's requirement list (once per job)
      - matchResume(apiKey, requirements, resumeText) - one resume against that list

    Notes:
    - apiKey is the user's own key (BYOK), so a client is created per call; it's never stored or logged
    - we use the RESPONSES API (openai.responses.create) with strict JSON schemas (text.format),
      so the answer always parses into the expected shape
    - the model comes from OPENAI_MODEL (default below), so it can be swapped or compared with the evals
    - the score is NOT calculated here - see scoring.ts

*/


//Vite reads the .env file automatically in the frontend but the back end needs dotenv
//makes OPENAI_MODEL (and the eval script's OPENAI_API_KEY) available
import 'dotenv/config'

//brings in all the code for talking to OpenAI's AI - specifically creating a client
import OpenAI from 'openai'
import { matchPrompt, requirementsPrompt } from '../prompt'
import { CandidateMatch, Requirement } from '../types'
import { MAX_REQUIREMENTS } from './scoring'






// ===== SKILL MATCH (recruiter flow) =====

//the model is a setting so it can be swapped (or compared with the evals) without code changes
const DEFAULT_MODEL = 'gpt-5-mini'

//reasoning models (gpt-5 family, o-series) accept a reasoning effort; low keeps a batch of resumes quick.
//older models like gpt-4o-mini reject the setting, so only send it when it applies
function modelSettings() {
    const model = process.env.OPENAI_MODEL || DEFAULT_MODEL
    const isReasoningModel = /^(gpt-5|o\d)/.test(model)
    return isReasoningModel ? { model, reasoning: { effort: 'low' as const } } : { model }
}

//strict JSON schemas make OpenAI return exactly this shape, so parsing can't fail on stray text
const requirementsSchema = {
    type: 'object',
    properties: {
        requirements: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    requirement: { type: 'string' },
                    importance: { type: 'string', enum: ['required', 'preferred'] },
                },
                required: ['requirement', 'importance'],
                additionalProperties: false,
            },
        },
    },
    required: ['requirements'],
    additionalProperties: false,
}

const stringList = { type: 'array', items: { type: 'string' } }

const matchSchema = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        matches: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    requirementId: { type: 'string' },
                    status: { type: 'string', enum: ['met', 'partial', 'not_met'] },
                    evidence: { type: 'string' },
                },
                required: ['requirementId', 'status', 'evidence'],
                additionalProperties: false,
            },
        },
        strengths: stringList,
        concerns: stringList,
        interviewQuestions: stringList,
    },
    required: ['summary', 'matches', 'strengths', 'concerns', 'interviewQuestions'],
    additionalProperties: false,
}

//Step 1: pull the requirement list out of a job posting (once per job).
//Ids are assigned here, not by the AI, so they're always unique and short.
export async function extractRequirements(apiKey: string, jobText: string): Promise<Requirement[]> {
    const openai = new OpenAI({ apiKey })

    const response = await openai.responses.create({
        ...modelSettings(),
        instructions: requirementsPrompt,
        input: `Job posting:\n${jobText}`,
        text: { format: { type: 'json_schema', name: 'job_requirements', strict: true, schema: requirementsSchema } },
    })

    const parsed = JSON.parse(response.output_text) as {
        requirements: Omit<Requirement, 'id'>[]
    }

    return parsed.requirements
        .slice(0, MAX_REQUIREMENTS)
        .map((item, index) => ({ id: `r${index + 1}`, ...item }))
}

//Step 2: check one resume against the requirement list (once per resume).
//resumeText should already have contact details redacted.
export async function matchResume(
    apiKey: string,
    requirements: Requirement[],
    resumeText: string,
): Promise<CandidateMatch> {
    const openai = new OpenAI({ apiKey })

    const response = await openai.responses.create({
        ...modelSettings(),
        instructions: matchPrompt,
        input: `Requirements:\n${JSON.stringify(requirements)}\n\nResume:\n${resumeText}`,
        text: { format: { type: 'json_schema', name: 'candidate_match', strict: true, schema: matchSchema } },
    })

    return JSON.parse(response.output_text) as CandidateMatch
}

