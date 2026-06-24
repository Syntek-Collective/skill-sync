/*

    OPENAI SERVICE

    What this file does:
    The specialist that talks to the AI. Its ONE job: take the resume text + job posting,
    send them to OpenAI (with our prompt), and return the AI's response.

    (for the shared concepts - dotenv, the filePath→text flow, the system/user roles -
     see services/README)


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
         a. SEND    - call openai.chat.completions.create with:
                        model: 'gpt-4o-mini'
                        messages: [ system = the prompt, user = the resume + job ]
                      (async/await because it's a network request - it takes time)
         b. EXTRACT - pull the answer out of the nested response:
                        response.choices[0].message.content
         c. RETURN  - hand back that answer (a JSON string of the structured analysis -
                      the frontend parses it later when displaying)

*/

/*

    TODO
    build out getAnalysis:
    1. take in resumeText + jobText (two params)
    2. send them to the AI: system message = the prompt (from prompt.ts),
       user message = the resume + job combined
    3. extract the answer (response.choices[0].message.content)
    4. return it

    Coordinate with the team on:
    - the prompt (lives in prompt.ts - this service USES it, the team writes it)
    - the structured output shape (must match the frontend + history + evals contract)
    - the model + any settings (gpt-4o-mini; maybe response_format for reliable JSON)

*/



//Vite reads the .env file automatically in the frontend but the back end needs dotenv
//makes your OPENAI_API_KEY available
import 'dotenv/config'

//brings in all the code for talking to OpenAI's AI - specifically creating a client
import OpenAI from 'openai'
import { prompt } from '../prompt'



//openai is our connection to AI - a client is your personal connection to OpenAI
const openai = new OpenAI({
    //authenticated connection - we use our API key as a way for openAI to identify us 
    apiKey: process.env.OPENAI_API_KEY
})

//STEP ONE - create a function that will handle the AI call - use the client/connection to 'talk to' AI
const getAnalysis = async (resumeText: string, jobText: string) => {
    
}