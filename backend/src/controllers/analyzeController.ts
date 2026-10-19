/*

    What feature is it for?
    Handles the analyze feature - comparing a resume to a job posting to find the skill gap.

    What does this controller do?
    This is the "doer" for analyze. The analyze route directs requests here, and this 
    controller handles the whole job: reads the request, calls the services to do the 
    work, and sends the result back.

    The flow:
    Receive → Do the work (call the services) → Respond

    (see controllers/README for how controllers work in general)

*/

/*

    TODO
    build out the analyze handler.

    This file still needs to:
    1. pull the resume filePath + job posting out of the request
    2. use the services (in order) to do the work:
       - get the resume file from storage (supabaseService)
       - turn the PDF into text (pdfService)
       - send the text + job posting to the AI to get the skill gap (openaiService + prompt)
    3. send the result back to the frontend
    4. handle the case where something goes wrong (bad request, a service fails, etc.)

    Coordinate with the team on:
    - the exact field names the frontend sends (resume? jobPosting?)
    - what the response should look like (does it include id / createdAt for history?)
    - whether the result also gets saved to the database here

*/

import { Request, Response } from 'express'
import { APIError } from 'openai'

import getAnalysis from '../services/openaiService'
import {
  fetchResumeFile,
  getJobPostingForUser,
  getResumeForUser,
  saveAnalysis,
} from '../services/supabaseService'
import { textFromPdf } from '../services/pdfService'


// turns an OpenAI error status into a message the user can act on
function openaiErrorResponse(status: number) {
  if (status === 401) {
    return { status: 401, message: "OpenAI rejected your API key. Check it and try again." }
  }
  if (status === 429) {
    return { status: 429, message: "OpenAI rate limit reached, or your key is out of credit. Check your OpenAI billing and try again." }
  }
  if (status === 403 || status === 404) {
    return { status: 400, message: "Your OpenAI key doesn't have access to the model SkillSync uses." }
  }
  return { status: 502, message: "OpenAI couldn't complete the analysis. Please try again." }
}


// controllers are doers: receive data, do the work, send a response
const analyzeController = async (req: Request, res: Response) => {
  // the user comes from the token authMiddleware verified, never from the body -
  // the backend uses the service-role key, which skips Supabase's row-level security
  const userId: string = res.locals.user.id

  // RECEIVE - the frontend only sends which resume + job posting to use
  const { resumeId, jobPostingId } = req.body ?? {}

  if (typeof resumeId !== 'string' || typeof jobPostingId !== 'string' || !resumeId || !jobPostingId) {
    return res.status(400).json({ error: "resumeId and jobPostingId are required." })
  }

  // BYOK - the user's own OpenAI key, sent per request; never stored or logged
  const apiKey = req.headers['x-openai-key']

  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return res.status(400).json({ error: "Add your OpenAI API key to run an analysis." })
  }

  try {
    // LOOK UP - only rows this user owns; another user's ids come back as null
    const resume = await getResumeForUser(resumeId, userId)
    const jobPosting = await getJobPostingForUser(jobPostingId, userId)

    if (!resume || !jobPosting) {
      return res.status(404).json({ error: "Resume or job posting not found." })
    }

    // FETCH - get the resume PDF from storage using its saved filePath (returns a Buffer)
    const resumePDF = await fetchResumeFile(resume.file_path)

    // EXTRACT - turn the PDF Buffer into text
    const resumeText = await textFromPdf(resumePDF)

    // ANALYZE - send the text + saved job posting to the AI, get the analysis
    const analysis = await getAnalysis(apiKey.trim(), resumeText, jobPosting.extracted_text)

    // SAVE - store the analysis in the database (so it shows in history)
    const saved = await saveAnalysis({
      userId,
      resumeId,
      jobPostingId,
      result: analysis
    })

    // RESPOND - send the result back (real id + createdAt from the saved row)
    res.json({
      result: analysis,
      id: saved.id,
      createdAt: saved.created_at
    })
  } catch (error) {
    // OpenAI errors are about the user's key, so tell them what to fix.
    // only the status is logged - OpenAI's error message can echo part of the key
    if (error instanceof APIError && error.status) {
      console.error("Analyze failed: OpenAI returned", error.status)
      const openaiError = openaiErrorResponse(error.status)
      return res.status(openaiError.status).json({ error: openaiError.message })
    }

    // if any other step failed (fetch, extract, save), send an error instead of crashing
    console.error("Analyze failed:", error)
    res.status(500).json({ error: "Something went wrong. Please try again." })
  }
}


export default analyzeController