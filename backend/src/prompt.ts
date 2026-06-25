/*

    What is this file for?
    Holds the PROMPT - the instructions we give the AI. This is the text that tells the AI 
    what its job is, what to analyze, and how to format its answer.

    What does it do?
    It doesn't DO work itself - it's the instructions that openaiService sends to the AI.
    (prompt = the instructions; openaiService = the thing that sends them to the AI)

    Think of it like a job description we hand the AI:
    "here's your role, here's what to compare, here's how to give back the result."

*/

import { Roles } from "openai/resources/admin/organization/roles"



//who is the AI
const role = ``

//what the AI does clearly 
const task = ``


//give the AI helpful context/background that could make it better at what it is for 
const context = ``


//guidance for how skills should be prioritized 
const prioritization = ``


//a clear rubric for how to calculate the matchScore for the users resume and a job listing 
const scoring = ``


//specific rules/constraints for the response
const rules = ``


//the expectation of how the response should be formatted
const outputFormat = ``


//how to handle situations in which you are uncertain of how to respond
const confidence = ``


//define what to do when someone inputs something unexpected 
const edgeCases = ``


//IMPORTANT - provide examples of good inputs and responses as a reference point
const examples = ``



export const prompt = `
    ${role}
    ${task}
    ${context}
    ${prioritization}
    ${scoring}
    ${rules}
    ${outputFormat}
    ${confidence}
    ${edgeCases}
    ${examples}
`