/*

    What feature is it for?
    The recruiter skill match - checking up to 10 resumes against one job posting and ranking them.

    What does this controller do?
    This is the "doer" for analyze. It has two handlers:
    - requirementsController: pulls the requirement list out of a job posting (once per job)
    - analyzeController: checks ONE resume against that list and scores it
      (the frontend calls it once per resume, a few at a time, so a big batch never hits a
       request timeout and one bad resume doesn't sink the rest)

    TWO MODES - private by default:
    - UNSAVED (the default): the frontend sends the job text and each resume PDF in the request.
      The PDF is read in memory, matched, and thrown away. Nothing is written to Supabase.
      The recruiter downloads the results; leaving the page clears them.
    - SAVED (the recruiter ticked "Save this job"): the job posting and resumes were already stored
      in Supabase by the frontend, so the request sends their ids. The result is saved too, so the
      job shows up in Past jobs.
    The request body decides the mode: ids -> saved, PDF data -> unsaved.

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
import { CandidateResult, Requirement } from '../types'

export const MAX_CANDIDATES_PER_JOB = 10

// limits for the unsaved mode, where the frontend sends the raw job text and PDF
export const MAX_JOB_TEXT_LENGTH = 20000
export const MAX_RESUME_BYTES = 5 * 1024 * 1024


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

// Decodes the base64 PDF the frontend sends in unsaved mode and checks it's a real, reasonably
// sized PDF. Returns an error message for the user, or the file bytes.
// (base64 lets the PDF travel inside a normal JSON request, so no upload library is needed)
function decodeResumePdf(value: unknown): { buffer: Buffer } | { error: string } {
  if (typeof value !== 'string' || !value) {
    return { error: "resumePdf is required." }
  }

  const buffer = Buffer.from(value, 'base64')

  if (buffer.length > MAX_RESUME_BYTES) {
    return { error: "Resumes must be 5 MB or smaller." }
  }
  // every PDF file starts with "%PDF-"; this catches renamed non-PDF files
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { error: "That file isn't a readable PDF." }
  }

  return { buffer }
}

// The part both modes share: redact the resume text, ask the AI to judge each requirement,
// then calculate the score in code.
async function buildCandidateResult(
  apiKey: string,
  requirements: Requirement[],
  resumeText: string,
): Promise<CandidateResult> {
  const candidateMatch = await matchResume(apiKey, requirements, redactContactInfo(resumeText))
  const matches = normalizeMatches(requirements, candidateMatch.matches)
  const score = computeScore(requirements, matches)

  return {
    version: 2,
    requirements,
    ...candidateMatch,
    matches,
    score,
    band: scoreBand(score),
  }
}


// POST /api/analyze/requirements -> { requirements }
//   unsaved mode: { jobText }       - the posting text itself, not stored
//   saved mode:   { jobPostingId }  - a posting this user saved
export const requirementsController = async (req: Request, res: Response) => {
  // the user comes from the token authMiddleware verified, never from the body
  const userId: string = res.locals.user.id
  const { jobPostingId, jobText } = req.body ?? {}

  const hasJobId = typeof jobPostingId === 'string' && jobPostingId.length > 0
  const hasJobText = typeof jobText === 'string' && jobText.trim().length > 0

  if (!hasJobId && !hasJobText) {
    return res.status(400).json({ error: "jobText or jobPostingId is required." })
  }
  if (hasJobText && jobText.length > MAX_JOB_TEXT_LENGTH) {
    return res.status(400).json({ error: "The job posting is too long (20,000 characters max)." })
  }

  const apiKey = readApiKey(req)
  if (!apiKey) {
    return res.status(400).json({ error: "Add your OpenAI API key to run an analysis." })
  }

  try {
    let postingText: string = jobText

    // saved mode: load the posting, but only if it belongs to this user
    if (hasJobId) {
      const jobPosting = await getJobPostingForUser(jobPostingId, userId)
      if (!jobPosting) {
        return res.status(404).json({ error: "Job posting not found." })
      }
      postingText = jobPosting.extracted_text
    }

    const requirements = await extractRequirements(apiKey, postingText)

    // a vague posting can yield zero requirements; there'd be nothing to match resumes against
    // (and analyze rejects an empty list), so say what to fix instead of failing every resume
    if (requirements.length === 0) {
      return res.status(422).json({
        error: "Couldn't find concrete requirements in this posting. Paste the full job description, including required skills and experience.",
      })
    }

    res.json({ requirements })
  } catch (error) {
    sendError(res, "Requirements", error)
  }
}


// POST /api/analyze -> { result } (unsaved) or { result, id, createdAt } (saved)
//   unsaved mode: { resumePdf (base64), requirements }
//   saved mode:   { resumeId, jobPostingId, requirements }
const analyzeController = async (req: Request, res: Response) => {
  // the user comes from the token authMiddleware verified, never from the body -
  // the backend uses the service-role key, which skips Supabase's row-level security
  const userId: string = res.locals.user.id

  // the job's requirement list from step 1, sent back with every resume
  const requirements = parseRequirements(req.body?.requirements)
  if (!requirements) {
    return res.status(400).json({ error: "A valid requirements list is required." })
  }

  const apiKey = readApiKey(req)
  if (!apiKey) {
    return res.status(400).json({ error: "Add your OpenAI API key to run an analysis." })
  }

  const { resumeId, jobPostingId, resumePdf } = req.body ?? {}

  // ===== UNSAVED MODE (default): the PDF is in the request; nothing is stored =====
  if (resumePdf !== undefined) {
    const decoded = decodeResumePdf(resumePdf)
    if ('error' in decoded) {
      return res.status(400).json({ error: decoded.error })
    }

    try {
      const resumeText = await textFromPdf(decoded.buffer)
      const result = await buildCandidateResult(apiKey, requirements, resumeText)
      // no id / createdAt: there's no saved row
      return res.json({ result })
    } catch (error) {
      return sendError(res, "Analyze", error)
    }
  }

  // ===== SAVED MODE: the resume and posting are stored rows this user owns =====
  if (typeof resumeId !== 'string' || typeof jobPostingId !== 'string' || !resumeId || !jobPostingId) {
    return res.status(400).json({ error: "Send a resumePdf, or a resumeId and jobPostingId." })
  }

  try {
    // LOOK UP - only rows this user owns; another user's ids come back as null
    const resume = await getResumeForUser(resumeId, userId)
    const jobPosting = await getJobPostingForUser(jobPostingId, userId)

    if (!resume || !jobPosting) {
      return res.status(404).json({ error: "Resume or job posting not found." })
    }

    // LIMIT - a saved job takes at most 10 candidates
    const alreadyAnalyzed = await countAnalysesForJob(jobPostingId, userId)
    if (alreadyAnalyzed >= MAX_CANDIDATES_PER_JOB) {
      return res.status(409).json({
        error: `This job already has ${MAX_CANDIDATES_PER_JOB} candidates analyzed.`,
      })
    }

    // FETCH + EXTRACT + MATCH - get the stored PDF, read it, and score it
    const resumePDF = await fetchResumeFile(resume.file_path)
    const resumeText = await textFromPdf(resumePDF)
    const result = await buildCandidateResult(apiKey, requirements, resumeText)

    // SAVE - store the result so it shows in Past jobs
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
