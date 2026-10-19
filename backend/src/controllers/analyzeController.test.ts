// Tests for analyzeController: auth/ownership checks and the success response.
// All services are mocked, so nothing calls Supabase, parses a PDF or hits OpenAI.

import { Request, Response } from "express";

jest.mock("../services/supabaseService", () => ({
  fetchResumeFile: jest.fn(),
  getResumeForUser: jest.fn(),
  getJobPostingForUser: jest.fn(),
  saveAnalysis: jest.fn(),
}));
jest.mock("../services/pdfService", () => ({ textFromPdf: jest.fn() }));
jest.mock("../services/openaiService", () => ({ __esModule: true, default: jest.fn() }));

import analyzeController from "./analyzeController";
import {
  fetchResumeFile,
  getJobPostingForUser,
  getResumeForUser,
  saveAnalysis,
} from "../services/supabaseService";
import { textFromPdf } from "../services/pdfService";
import getAnalysis from "../services/openaiService";

const mockGetResume = getResumeForUser as jest.Mock;
const mockGetJobPosting = getJobPostingForUser as jest.Mock;
const mockFetchResumeFile = fetchResumeFile as jest.Mock;
const mockTextFromPdf = textFromPdf as jest.Mock;
const mockGetAnalysis = getAnalysis as jest.Mock;
const mockSaveAnalysis = saveAnalysis as jest.Mock;

// Builds a fake request/response pair with the signed-in user set the way authMiddleware does.
function setup(body: unknown) {
  const req = { body } as Request;
  const res = {
    locals: { user: { id: "user-1" } },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("analyzeController", () => {
  it("returns 400 when resumeId or jobPostingId is missing", async () => {
    const { req, res } = setup({ resumeId: "resume-1" });

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGetResume).not.toHaveBeenCalled();
  });

  it("returns 404 when the resume does not belong to the user", async () => {
    mockGetResume.mockResolvedValue(null);
    mockGetJobPosting.mockResolvedValue({ id: "job-1", extracted_text: "Job text" });
    const { req, res } = setup({ resumeId: "someone-elses-resume", jobPostingId: "job-1" });

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockFetchResumeFile).not.toHaveBeenCalled();
    expect(mockGetAnalysis).not.toHaveBeenCalled();
  });

  it("returns 404 when the job posting does not belong to the user", async () => {
    mockGetResume.mockResolvedValue({ id: "resume-1", file_path: "user-1/resume.pdf" });
    mockGetJobPosting.mockResolvedValue(null);
    const { req, res } = setup({ resumeId: "resume-1", jobPostingId: "someone-elses-job" });

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockGetAnalysis).not.toHaveBeenCalled();
  });

  it("uses the verified user and saved rows, ignoring ids and paths in the body", async () => {
    mockGetResume.mockResolvedValue({ id: "resume-1", file_path: "user-1/resume.pdf" });
    mockGetJobPosting.mockResolvedValue({ id: "job-1", extracted_text: "Saved job text" });
    mockFetchResumeFile.mockResolvedValue(Buffer.from("pdf"));
    mockTextFromPdf.mockResolvedValue("Resume text");
    mockGetAnalysis.mockResolvedValue('{"matchScore":80}');
    mockSaveAnalysis.mockResolvedValue({ id: "analysis-1", created_at: "2026-10-19T00:00:00Z" });

    const { req, res } = setup({
      resumeId: "resume-1",
      jobPostingId: "job-1",
      userId: "attacker",
      resume: "victim/resume.pdf",
      jobPosting: "Injected job text",
    });

    await analyzeController(req, res);

    expect(mockGetResume).toHaveBeenCalledWith("resume-1", "user-1");
    expect(mockGetJobPosting).toHaveBeenCalledWith("job-1", "user-1");
    expect(mockFetchResumeFile).toHaveBeenCalledWith("user-1/resume.pdf");
    expect(mockGetAnalysis).toHaveBeenCalledWith("Resume text", "Saved job text");
    expect(mockSaveAnalysis).toHaveBeenCalledWith({
      userId: "user-1",
      resumeId: "resume-1",
      jobPostingId: "job-1",
      result: '{"matchScore":80}',
    });
    expect(res.json).toHaveBeenCalledWith({
      result: '{"matchScore":80}',
      id: "analysis-1",
      createdAt: "2026-10-19T00:00:00Z",
    });
  });

  it("returns 500 when a service fails", async () => {
    mockGetResume.mockRejectedValue(new Error("db down"));
    mockGetJobPosting.mockResolvedValue({ id: "job-1", extracted_text: "Job text" });
    const { req, res } = setup({ resumeId: "resume-1", jobPostingId: "job-1" });

    await analyzeController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
