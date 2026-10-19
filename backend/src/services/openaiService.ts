/*

    OPENAI SERVICE

    What this file does:
    The specialist that talks to the AI. Its ONE job: take the resume text + job posting,
    send them to OpenAI (with our prompt), and return the AI's response.

    (for the shared concepts - dotenv, the filePath→text flow - see services/README)

    NOTE: we use the RESPONSES API (openai.responses.create) - OpenAI's newer, recommended
    API. (the older one is Chat Completions / openai.chat.completions.create, which uses a
    messages array instead. we picked Responses - just make sure the team is consistent.)


    THIS FILE'S PIECES:

    1. SETUP
       - load the .env (so OPENAI_API_KEY is available)
       - import the OpenAI library + create the client (our connection, using the key)
       - import the prompt from prompt.ts (the AI's instructions)

    2. getAnalysis(resumeText, jobText)
       Takes BOTH the resume text and the job posting (the AI needs both to compare them).
       Note: it gets the resume as TEXT - the controller already fetched + extracted it
       before calling this (see the README for that flow).

       It does 3 things:
         a. SEND    - call openai.responses.create with:
                        model:        'gpt-4o-mini'  (which AI brain)
                        instructions: the prompt      (HOW to analyze - from prompt.ts)
                        input:        the resume + job (WHAT to analyze - the data)
                      (async/await because it's a network request - it takes time)
         b. EXTRACT - get the answer with response.output_text
                      (the Responses API gives a handy output_text helper - no digging
                       through nested objects like the old Chat Completions API needed)
         c. RETURN  - hand back that answer (a JSON string of the structured analysis -
                      the frontend parses it later when displaying)


    THE RESPONSES API CALL (how its pieces map):
        instructions  → the PROMPT (the system-level guidance / how to behave)
        input         → the resume + job (the actual data to analyze)
        response.output_text → the AI's answer (clean, no nested digging)

    (in the OLDER Chat Completions API this was: a 'messages' array with system + user
     roles, and the answer was buried at response.choices[0].message.content. the
     Responses API is simpler: instructions + input + output_text.)

*/

/*

    TODO
    build out getAnalysis:
    1. take in resumeText + jobText (two params)
    2. send to the AI with openai.responses.create:
         - instructions: the prompt (from prompt.ts)
         - input: the resume + job combined
    3. get the answer with response.output_text
    4. return it

    Coordinate with the team on:
    - that we're all using the RESPONSES API (not Chat Completions) - be consistent
    - the prompt (lives in prompt.ts - this service USES it, the team writes it)
    - the structured output shape (must match the frontend + history + evals contract)
    - the model + any settings (gpt-4o-mini; for reliable JSON, the Responses API uses
      text.format for structured outputs - look into it when tightening the JSON)

*/



//Vite reads the .env file automatically in the frontend but the back end needs dotenv
//makes your OPENAI_API_KEY available
import 'dotenv/config'

//brings in all the code for talking to OpenAI's AI - specifically creating a client
import OpenAI from 'openai'
import { matchPrompt, prompt, requirementsPrompt } from '../prompt'
import { CandidateMatch, Requirement } from '../types'
import { MAX_REQUIREMENTS } from './scoring'



//STEP ONE - create a function that will handle the AI call - use the client/connection to 'talk to' AI
//apiKey is the user's own OpenAI key (BYOK); it is used for this one call and never stored or logged
const getAnalysis = async (apiKey: string, resumeText: string, jobText: string) => {
    //a client per request, because every user brings their own key
    const openai = new OpenAI({ apiKey })

    //use the client to connect to openai passing it data, instructions and storing the response
    const response = await openai.responses.create({
        //what model you want to run the request on 
        model: 'gpt-4o-mini',
        //additional instructions we want to give openai with our data - our prompt file
        instructions: prompt,
        //give openai the relevant data
        input: `Resume: ${resumeText}, Job posting: ${jobText}`
    })
    
    //return the JSON object response from openAI - this formatting is from the docs 
    return response.output_text
}


export default getAnalysis


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

