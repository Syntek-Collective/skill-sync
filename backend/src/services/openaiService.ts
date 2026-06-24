/*

    What is this service for?
    Talks to the AI (OpenAI). This is the specialist for sending text to the AI and 
    getting a response back.


    DOTENV
    Plain Node (the backend) does NOT read .env files automatically (Vite does that 
    for the frontend, but Node doesn't).
    So we use dotenv to LOAD the .env file - this makes our OPENAI_API_KEY available 
    to the code via process.env.OPENAI_API_KEY.
        import 'dotenv/config'   ← loads the .env so the key is usable


    IMPORTING OPENAI
    This brings in the OpenAI library/toolkit (the package we installed) - all the 
    code that knows HOW to talk to OpenAI's AI.
        import OpenAI from 'openai'


    THE CLIENT
    The client is our personal, authenticated CONNECTION to OpenAI.
    We create it using our API key, which is how OpenAI identifies us (and bills our 
    account). The client is like a phone - it's the connection, but it doesn't DO 
    anything on its own until we use it to make a call.
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        - openai          = our connection (the client)
        - apiKey          = our "login" - proves it's us


    THE FUNCTION (getAnalysis)
    The client is just the connection - this FUNCTION is what actually USES it to talk 
    to the AI. It does 3 things:
        1. SEND    - send the text to the AI
        2. EXTRACT - dig the actual answer out of the (messy, nested) response
        3. RETURN  - hand back the clean answer
    It's async because talking to the AI takes time (it's a network request to 
    OpenAI's servers), so we await it.


    THE AI CALL: openai.chat.completions.create({ ... })
    This is the actual "send my message, get a reply" line. In plain English:
    "Hey OpenAI, here's my message - reply to it."
    It takes two pieces of info:

        model: 'gpt-4o-mini'
        → WHICH AI brain to use. OpenAI has different models (different abilities/costs).
            gpt-4o-mini is the one our project uses.

        messages: [ { role: 'user', content: text } ]
        → our actual MESSAGE to the AI.
            - it's an ARRAY [ ] because a conversation can have multiple messages
            - role: 'user'    = WHO is talking ('user' = us)
                                (other roles: 'system' = instructions, 'assistant' = the AI)
            - content: text   = WHAT we're saying (the actual text)

    So the whole call = "use this AI brain (model) + here's my message (messages) → reply."


    AWAIT (why we need it)
    The AI call is a network request to OpenAI's servers - it takes time.
    await = "wait for the reply before moving on."
    (this is why the function must be async)


    THE RESPONSE
    The AI's reply comes back NESTED inside a big response object (lots of extra 
    metadata around the actual answer). The real answer is buried at:
        response.choices[0].message.content
    So we dig in, grab just that, and return it (clean) - so whoever calls this 
    function gets the answer, not the messy response object.


    THE FLOW (start to finish):
        text comes in
        → send it to the AI (openai.chat.completions.create)
        → wait for the reply (await)
        → pull the answer out of the response (response.choices[0].message.content)
        → return the clean answer


*/

/*

    TODO
    build out the AI call.

    This file will need to:
    1. take in the resume text + job posting
    2. build the message to send (using the prompt from prompt.ts)
    3. send it to the OpenAI API (gpt-4o-mini)
    4. return the AI's response (the analysis)

    Coordinate with the team on:
    - the exact prompt (lives in prompt.ts - this service USES it)
    - what shape the AI should return (so the controller can send it back to the frontend)
    - the model + any settings (gpt-4o-mini, etc.)

*/



//Vite reads the .env file automatically in the frontend but the back end needs dotenv
//makes your OPENAI_API_KEY available
import 'dotenv/config'

//brings in all the code for talking to OpenAI's AI - specifically creating a client
import OpenAI from 'openai'



//openai is our connection to AI - a client is your personal connection to OpenAI
const openai = new OpenAI({
    //authenticated connection - we use our API key as a way for openAI to identify us 
    apiKey: process.env.OPENAI_API_KEY
})

//STEP ONE - create a function that will handle the AI call - use the client/connection to 'talk to' AI
const getAnalysis = async (jobText: string) => {

}