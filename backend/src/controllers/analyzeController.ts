/*

    What feature is it for?
    The recruiter skill match - checking up to 10 resumes against one job posting and ranking them.

    What does this controller do?
    This is the "doer" for analyze. It has two handlers:
    - requirementsController: pulls the requirement list out of a job posting (once per job)
    - analyzeController: checks ONE resume against that list, scores it, and saves the result
      (the frontend calls it once per resume, a few at a time, so a big batch never hits a
       request timeout and one bad resume doesn't sink the rest)

    The flow:
    Receive → Do the work (call the services) → Respond

    (see controllers/README for how controllers work in general)

*/

import { Request, Response } from 'express'
import { APIError } from 'openai'

import { extractRequirements, matchResume } from '../services/openaiService'
import {
  countAnalysesForJob,
  fetchResumeFile,
  getJobPostingForUser,
  getResumeForUser,
  saveAnalysis,
} from '../services/supabaseService'
import { textFromPdf } from '../services/pdfService'
import { redactContactInfo } from '../services/redact'
import { computeScore, normalizeMatches, parseRequirements, scoreBand } from '../services/scoring'
import { CandidateResult } from '../types'

export const MAX_CANDIDATES_PER_JOB = 10


// BYOK - the user's own OpenAI key, sent per request in a header; never stored or logged
function readApiKey(req: Request): string | null {
  const apiKey = req.headers['x-openai-key']
  return typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null
}

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

// shared error reply for both handlers
function sendError(res: Response, label: string, error: unknown) {
  // OpenAI errors are about the user's key, so tell them what to fix.
  // only the status is logged - OpenAI's error message can echo part of the key
  if (error instanceof APIError && error.status) {
    console.error(`${label} failed: OpenAI returned`, error.status)
    const openaiError = openaiErrorResponse(error.status)
    return res.status(openaiError.status).json({ error: openaiError.message })
  }

  // any other step failed (fetch, extract, save) - send an error instead of crashing
  console.error(`${label} failed:`, error)
  return res.status(500).json({ error: "Something went wrong. Please try again." })
}


// POST /api/analyze/requirements  { jobPostingId } -> { requirements }
export const requirementsController = async (req: Request, res: Response) => {
  // the user comes from the token authMiddleware verified, never from the body
  const userId: string = res.locals.user.id
  const { jobPostingId } = req.body ?? {}

  if (typeof jobPostingId !== 'string' || !jobPostingId) {
    return res.status(400).json({ error: "jobPostingId is required." })
  }

  const apiKey = readApiKey(req)
  if (!apiKey) {
    return res.status(400).json({ error: "Add your OpenAI API key to run an analysis." })
  }

  try {
    const jobPosting = await getJobPostingForUser(jobPostingId, userId)
    if (!jobPosting) {
      return res.status(404).json({ error: "Job posting not found." })
    }

    const requirements = await extractRequirements(apiKey, jobPosting.extracted_text)
    res.json({ requirements })
  } catch (error) {
    sendError(res, "Requirements", error)
  }
}


// POST /api/analyze  { resumeId, jobPostingId, requirements } -> { result, id, createdAt }
const analyzeController = async (req: Request, res: Response) => {
  // the user comes from the token authMiddleware verified, never from the body -
  // the backend uses the service-role key, which skips Supabase's row-level security
  const userId: string = res.locals.user.id

  // RECEIVE - which resume + job posting to use, and the job's requirement list from step 1
  const { resumeId, jobPostingId } = req.body ?? {}

  if (typeof resumeId !== 'string' || typeof jobPostingId !== 'string' || !resumeId || !jobPostingId) {
    return res.status(400).json({ error: "resumeId and jobPostingId are required." })
  }

  const requirements = parseRequirements(req.body?.requirements)
  if (!requirements) {
    return res.status(400).json({ error: "A valid requirements list is required." })
  }

  const apiKey = readApiKey(req)
  if (!apiKey) {
    return res.status(400).json({ error: "Add your OpenAI API key to run an analysis." })
  }

  try {
    // LOOK UP - only rows this user owns; another user's ids come back as null
    const resume = await getResumeForUser(resumeId, userId)
    const jobPosting = await getJobPostingForUser(jobPostingId, userId)

    if (!resume || !jobPosting) {
      return res.status(404).json({ error: "Resume or job posting not found." })
    }

    // LIMIT - a job takes at most 10 candidates
    const alreadyAnalyzed = await countAnalysesForJob(jobPostingId, userId)
    if (alreadyAnalyzed >= MAX_CANDIDATES_PER_JOB) {
      return res.status(409).json({
        error: `This job already has ${MAX_CANDIDATES_PER_JOB} candidates analyzed.`,
      })
    }

    // FETCH + EXTRACT - get the resume PDF and turn it into text, minus contact details
    const resumePDF = await fetchResumeFile(resume.file_path)
    const resumeText = redactContactInfo(await textFromPdf(resumePDF))

    // MATCH - the AI judges each requirement; the score is calculated here in code
    const candidateMatch = await matchResume(apiKey, requirements, resumeText)
    const matches = normalizeMatches(requirements, candidateMatch.matches)
    const score = computeScore(requirements, matches)

    const result: CandidateResult = {
      version: 2,
      requirements,
      ...candidateMatch,
      matches,
      score,
      band: scoreBand(score),
    }

    // SAVE - store the result so it shows in history
    const saved = await saveAnalysis({ userId, resumeId, jobPostingId, result })

    // RESPOND - send the result back (real id + createdAt from the saved row)
    res.json({
      result,
      id: saved.id,
      createdAt: saved.created_at
    })
  } catch (error) {
    sendError(res, "Analyze", error)
  }
}


export default analyzeController
