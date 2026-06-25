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

import getAnalysis from '../services/openaiService'
import { fetchResumeFile, saveAnalysis } from '../services/supabaseService'
import { textFromPdf } from '../services/pdfService'
import { prompt } from '../prompt'


// controllers are doers: receive data, do the work, send a response
const analyzeController = async (req: Request, res: Response) => {
  // RECEIVE - get everything the frontend sends
  // (frontend now also sends the IDs needed for saving)
  const { resume, jobPosting, userId, resumeId, jobPostingId } = req.body
  // resume is a filePath string

  try {
    // FETCH - get the resume PDF from storage using the filePath (returns a Buffer)
    const resumePDF = await fetchResumeFile(resume)

    // EXTRACT - turn the PDF Buffer into text
    const resumeText = await textFromPdf(resumePDF)

    // ANALYZE - send the text + job posting to the AI, get the analysis
    const analysis = await getAnalysis(resumeText, jobPosting)

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
    // if any step failed (fetch, extract, AI, save), send an error instead of crashing
    console.error("Analyze failed:", error)
    res.status(500).json({ error: "Something went wrong. Please try again." })
  }
}


export default analyzeController