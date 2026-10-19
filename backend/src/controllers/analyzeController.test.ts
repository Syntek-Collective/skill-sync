// Tests for the analyze controllers: auth/ownership checks, BYOK, the 10-candidate cap,
// requirements validation, and the saved result. All services are mocked, so nothing
// calls Supabase, parses a PDF or hits OpenAI.

import { Request, Response } from "express";
import { APIError } from "openai";

jest.mock("../services/supabaseService", () => ({
  countAnalysesForJob: jest.fn(),
  fetchResumeFile: jest.fn(),
  getResumeForUser: jest.fn(),
  getJobPostingForUser: jest.fn(),
  saveAnalysis: jest.fn(),
}));
jest.mock("../services/pdfService", () => ({ textFromPdf: jest.fn() }));
jest.mock("../services/openaiService", () => ({
  extractRequirements: jest.fn(),
  matchResume: jest.fn(),
}));

import analyzeController, { requirementsController } from "./analyzeController";
import {
  countAnalysesForJob,
  fetchResumeFile,
  getJobPostingForUser,
  getResumeForUser,
  saveAnalysis,
} from "../services/supabaseService";
import { textFromPdf } from "../services/pdfService";
import { extractRequirements, matchResume } from "../services/openaiService";

const mockCount = countAnalysesForJob as jest.Mock;
const mockGetResume = getResumeForUser as jest.Mock;
const mockGetJobPosting = getJobPostingForUser as jest.Mock;
const mockFetchResumeFile = fetchResumeFile as jest.Mock;
const mockTextFromPdf = textFromPdf as jest.Mock;
const mockExtractRequirements = extractRequirements as jest.Mock;
const mockMatchResume = matchResume as jest.Mock;
const mockSaveAnalysis = saveAnalysis as jest.Mock;

const requirements = [
  { id: "r1", requirement: "Python", importance: "required" },
  { id: "r2", requirement: "Docker", importance: "preferred" },
];

// Builds a fake request/response pair with the signed-in user set the way authMiddleware does.
function setup(body: unknown, headers: Record<string, string> = { "x-openai-key": "sk-test" }) {
  const req = { body, headers } as unknown as Request;
  const res = {
    locals: { user: { id: "user-1" } },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

// The happy path for one resume; individual tests override pieces of it.
function mockOwnedRowsAndMatch() {
  mockGetResume.mockResolvedValue({ id: "resume-1", file_path: "user-1/resume.pdf" });
  mockGetJobPosting.mockResolvedValue({ id: "job-1", extracted_text: "Saved job text" });
  mockCount.mockResolvedValue(0);
  mockFetchResumeFile.mockResolvedValue(Buffer.from("pdf"));
  mockTextFromPdf.mockResolvedValue("Python developer. Email jo@example.com");
  mockMatchResume.mockResolvedValue({
    summary: "Strong Python background.",
    matches: [{ requirementId: "r1", status: "met", evidence: "Python developer" }],
    strengths: ["Python"],
    concerns: ["No Docker shown"],
    interviewQuestions: ["Have you used Docker?"],
  });
  mockSaveAnalysis.mockResolvedValue({ id: "analysis-1", created_at: "2026-10-19T00:00:00Z" });
}

const validBody = { resumeId: "resume-1", jobPostingId: "job-1", requirements };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("analyzeController", () => {
  it("returns 400 when resumeId or jobPostingId is missing", async () => {
    const { req, res } = setup({ resumeId: "resume-1", requirements });

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGetResume).not.toHaveBeenCalled();
  });

  it("returns 400 when the requirements list is missing or malformed", async () => {
    const { req, res } = setup({
      resumeId: "resume-1",
      jobPostingId: "job-1",
      requirements: [{ id: "r1", requirement: "Python", importance: "essential" }],
    });

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGetResume).not.toHaveBeenCalled();
  });

  it("returns 400 when the OpenAI key header is missing", async () => {
    const { req, res } = setup(validBody, {});

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGetResume).not.toHaveBeenCalled();
  });

  it("returns 404 when the resume does not belong to the user", async () => {
    mockOwnedRowsAndMatch();
    mockGetResume.mockResolvedValue(null);
    const { req, res } = setup({ ...validBody, resumeId: "someone-elses-resume" });

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockFetchResumeFile).not.toHaveBeenCalled();
    expect(mockMatchResume).not.toHaveBeenCalled();
  });

  it("returns 404 when the job posting does not belong to the user", async () => {
    mockOwnedRowsAndMatch();
    mockGetJobPosting.mockResolvedValue(null);
    const { req, res } = setup({ ...validBody, jobPostingId: "someone-elses-job" });

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockMatchResume).not.toHaveBeenCalled();
  });

  it("returns 409 once the job already has 10 candidates", async () => {
    mockOwnedRowsAndMatch();
    mockCount.mockResolvedValue(10);
    const { req, res } = setup(validBody);

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockMatchResume).not.toHaveBeenCalled();
  });

  it("matches the redacted resume, scores in code, and saves under the verified user", async () => {
    mockOwnedRowsAndMatch();
    const { req, res } = setup({ ...validBody, userId: "attacker", resume: "victim/resume.pdf" });

    await analyzeController(req, res);

    expect(mockGetResume).toHaveBeenCalledWith("resume-1", "user-1");
    expect(mockGetJobPosting).toHaveBeenCalledWith("job-1", "user-1");
    expect(mockFetchResumeFile).toHaveBeenCalledWith("user-1/resume.pdf");
    expect(mockMatchResume).toHaveBeenCalledWith(
      "sk-test",
      requirements,
      "Python developer. Email [email]",
    );

    // r1 (required, weight 2) met, r2 (preferred, weight 1) skipped by the AI -> not met: 2/3
    const expectedResult = {
      version: 2,
      requirements,
      summary: "Strong Python background.",
      matches: [
        { requirementId: "r1", status: "met", evidence: "Python developer" },
        { requirementId: "r2", status: "not_met", evidence: "" },
      ],
      strengths: ["Python"],
      concerns: ["No Docker shown"],
      interviewQuestions: ["Have you used Docker?"],
      score: 67,
      band: "Partial match",
    };
    expect(mockSaveAnalysis).toHaveBeenCalledWith({
      userId: "user-1",
      resumeId: "resume-1",
      jobPostingId: "job-1",
      result: expectedResult,
    });
    expect(res.json).toHaveBeenCalledWith({
      result: expectedResult,
      id: "analysis-1",
      createdAt: "2026-10-19T00:00:00Z",
    });
  });

  it("returns 401 with a key message when OpenAI rejects the key, without logging the error text", async () => {
    mockOwnedRowsAndMatch();
    mockMatchResume.mockRejectedValue(
      new APIError(401, {}, "Incorrect API key provided: sk-te****test", new Headers()),
    );
    const { req, res } = setup(validBody);

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining("API key") });
    const logged = JSON.stringify((console.error as jest.Mock).mock.calls);
    expect(logged).not.toContain("sk-te");
  });

  it("returns 429 when the key is rate limited or out of credit", async () => {
    mockOwnedRowsAndMatch();
    mockMatchResume.mockRejectedValue(new APIError(429, {}, "quota", new Headers()));
    const { req, res } = setup(validBody);

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
  });

  it("returns 500 when a service fails", async () => {
    mockOwnedRowsAndMatch();
    mockGetResume.mockRejectedValue(new Error("db down"));
    const { req, res } = setup(validBody);

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("requirementsController", () => {
  it("returns 400 without a jobPostingId or key", async () => {
    const noId = setup({});
    await requirementsController(noId.req, noId.res);
    expect(noId.res.status).toHaveBeenCalledWith(400);

    const noKey = setup({ jobPostingId: "job-1" }, {});
    await requirementsController(noKey.req, noKey.res);
    expect(noKey.res.status).toHaveBeenCalledWith(400);

    expect(mockExtractRequirements).not.toHaveBeenCalled();
  });

  it("returns 404 for a job posting the user doesn't own", async () => {
    mockGetJobPosting.mockResolvedValue(null);
    const { req, res } = setup({ jobPostingId: "someone-elses-job" });

    await requirementsController(req, res);

    expect(mockGetJobPosting).toHaveBeenCalledWith("someone-elses-job", "user-1");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockExtractRequirements).not.toHaveBeenCalled();
  });

  it("extracts requirements from the saved posting text", async () => {
    mockGetJobPosting.mockResolvedValue({ id: "job-1", extracted_text: "Saved job text" });
    mockExtractRequirements.mockResolvedValue(requirements);
    const { req, res } = setup({ jobPostingId: "job-1" });

    await requirementsController(req, res);

    expect(mockExtractRequirements).toHaveBeenCalledWith("sk-test", "Saved job text");
    expect(res.json).toHaveBeenCalledWith({ requirements });
  });
});

// ===== UNSAVED MODE (the default): the PDF travels in the request and nothing is stored =====
describe("analyzeController - unsaved mode", () => {
  // a tiny stand-in PDF: only the "%PDF-" header matters, since parsing is mocked
  const pdfBase64 = Buffer.from("%PDF-1.7 fake pdf body").toString("base64");

  it("reads the PDF in memory, matches it, and saves nothing", async () => {
    mockOwnedRowsAndMatch();
    const { req, res } = setup({ resumePdf: pdfBase64, requirements });

    await analyzeController(req, res);

    // the PDF bytes go straight to the parser - no storage download, no row lookups
    expect(mockTextFromPdf).toHaveBeenCalledWith(Buffer.from("%PDF-1.7 fake pdf body"));
    expect(mockGetResume).not.toHaveBeenCalled();
    expect(mockFetchResumeFile).not.toHaveBeenCalled();
    // contact details are still redacted before the AI sees the text
    expect(mockMatchResume).toHaveBeenCalledWith(
      "sk-test",
      requirements,
      "Python developer. Email [email]",
    );
    expect(mockSaveAnalysis).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      result: expect.objectContaining({ version: 2, score: 67, band: "Partial match" }),
    });
  });

  it("rejects a file that isn't a PDF", async () => {
    const notPdf = Buffer.from("hello, I am a text file").toString("base64");
    const { req, res } = setup({ resumePdf: notPdf, requirements });

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockTextFromPdf).not.toHaveBeenCalled();
  });

  it("rejects a PDF over 5 MB", async () => {
    const huge = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(5 * 1024 * 1024)]);
    const { req, res } = setup({ resumePdf: huge.toString("base64"), requirements });

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockTextFromPdf).not.toHaveBeenCalled();
  });
});

describe("requirementsController - unsaved mode", () => {
  it("extracts requirements from job text sent in the request, without a database lookup", async () => {
    mockExtractRequirements.mockResolvedValue(requirements);
    const { req, res } = setup({ jobText: "We need a Python developer." });

    await requirementsController(req, res);

    expect(mockGetJobPosting).not.toHaveBeenCalled();
    expect(mockExtractRequirements).toHaveBeenCalledWith("sk-test", "We need a Python developer.");
    expect(res.json).toHaveBeenCalledWith({ requirements });
  });

  it("rejects job text over 20,000 characters", async () => {
    const { req, res } = setup({ jobText: "x".repeat(20001) });

    await requirementsController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockExtractRequirements).not.toHaveBeenCalled();
  });
});

describe("requirementsController - posting with no concrete requirements", () => {
  it("returns 422 with a clear message instead of an empty list", async () => {
    mockExtractRequirements.mockResolvedValue([]);
    const { req, res } = setup({ jobText: "Looking for someone great. Must be awesome." });

    await requirementsController(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.stringContaining("Couldn't find concrete requirements"),
    });
  });
});
