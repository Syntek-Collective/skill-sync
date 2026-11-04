// Tests for the ranking controllers: input validation, BYOK, saved-mode ownership, private-mode
// PDF decoding + redaction, the run being started in the background, and owner-only reads.
// Supabase, the PDF parser, the store and the runner are all mocked.

import { Request, Response } from "express";
import { APIError } from "openai";

jest.mock("../services/supabaseService", () => ({ getResumeForUser: jest.fn(), getJobPostingForUser: jest.fn() }));
jest.mock("../services/pdfService", () => ({ textFromPdf: jest.fn() }));
jest.mock("../services/rankingStore", () => ({
  createRun: jest.fn(),
  deleteRunForUser: jest.fn(),
  getLastSeq: jest.fn(),
  getRunForUser: jest.fn(),
}));
jest.mock("../services/rankingRunner", () => ({
  startRun: jest.fn(),
  isRunActive: jest.fn(),
  openaiErrorMessage: jest.requireActual("../services/rankingRunner").openaiErrorMessage,
}));
// rankingRunner's real module (for openaiErrorMessage) imports these; keep them inert
jest.mock("../services/pairwiseJudge", () => ({ judgePair: jest.fn() }));
jest.mock("../realtime/eventBus", () => ({ publish: jest.fn() }));

import {
  createRankingController,
  deleteRankingController,
  getRankingController,
  parseCandidates,
  resumeRankingController,
} from "./rankingController";
import { getJobPostingForUser, getResumeForUser } from "../services/supabaseService";
import { textFromPdf } from "../services/pdfService";
import { createRun, deleteRunForUser, getLastSeq, getRunForUser } from "../services/rankingStore";
import { isRunActive, startRun } from "../services/rankingRunner";

const mockGetResume = getResumeForUser as jest.Mock;
const mockGetJob = getJobPostingForUser as jest.Mock;
const mockDeleteRun = deleteRunForUser as jest.Mock;
const mockTextFromPdf = textFromPdf as jest.Mock;
const mockCreateRun = createRun as jest.Mock;
const mockGetLastSeq = getLastSeq as jest.Mock;
const mockGetRun = getRunForUser as jest.Mock;
const mockStartRun = startRun as jest.Mock;
const mockIsRunActive = isRunActive as jest.Mock;

const requirements = [{ id: "r1", requirement: "Python", importance: "required" }];
const pdf = (text = "resume") => Buffer.from(`%PDF-1.4 ${text}`).toString("base64");

function setup(body: unknown, params: Record<string, string> = {}, headers: Record<string, string> = { "x-openai-key": "sk-test" }) {
  const req = { body, params, headers } as unknown as Request;
  const res = {
    locals: { user: { id: "user-1" } },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

const runRow = (overrides: Record<string, unknown> = {}) => ({
  id: "run-1",
  user_id: "user-1",
  mode: "saved",
  status: "running",
  total_tasks: 2,
  completed_tasks: 1,
  result: null,
  error: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockCreateRun.mockImplementation(async (input: Record<string, unknown>) => ({ ...runRow(), ...input, id: "run-1" }));
  mockGetResume.mockImplementation(async (id: string) => ({ id, file_path: `user-1/${id}.pdf` }));
  mockGetJob.mockImplementation(async (id: string, userId: string) => (id === "job-1" && userId === "user-1" ? { id } : null));
  mockTextFromPdf.mockResolvedValue("Python dev, jo@example.com, (555) 123-4567");
});

describe("parseCandidates", () => {
  it("enforces the count, unique ids and a single mode", () => {
    expect(parseCandidates([{ id: "a", resumeId: "r" }], 2, 10)).toEqual({ error: "Send between 2 and 10 candidates." });
    expect(parseCandidates([{ id: "a", resumeId: "r" }, { id: "a", resumeId: "s" }], 2, 10)).toEqual({
      error: "Candidate ids must be unique.",
    });
    expect(parseCandidates([{ id: "a", resumeId: "r" }, { id: "b", resumePdf: pdf() }], 2, 10)).toMatchObject({
      error: expect.stringContaining("not a mix"),
    });
    expect(parseCandidates([{ id: "a" }, { id: "b" }], 2, 10)).toMatchObject({ error: expect.stringContaining("resumeId or a resumePdf") });
    expect(parseCandidates([{ id: "a", resumePdf: "aGVsbG8=" }, { id: "b", resumePdf: pdf() }], 2, 10)).toEqual({
      error: "That file isn't a readable PDF.",
    });
  });
});

describe("createRankingController", () => {
  it("rejects a missing requirements list, bad rounds and too many candidates", async () => {
    const candidates = [{ id: "a", resumeId: "r1" }, { id: "b", resumeId: "r2" }];

    let { req, res } = setup({ candidates });
    await createRankingController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    ({ req, res } = setup({ requirements, candidates, rounds: 3 }));
    await createRankingController(req, res);
    expect(res.json).toHaveBeenCalledWith({ error: "rounds must be 1 or 2." });

    const eleven = Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, resumeId: `r${i}` }));
    ({ req, res } = setup({ requirements, candidates: eleven }));
    await createRankingController(req, res);
    expect(res.json).toHaveBeenCalledWith({ error: "Send between 2 and 10 candidates." });

    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("requires the OpenAI key", async () => {
    const { req, res } = setup({ requirements, candidates: [{ id: "a", resumeId: "r1" }, { id: "b", resumeId: "r2" }] }, {}, {});
    await createRankingController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Add your OpenAI API key to run a ranking." });
  });

  it("saved mode: checks every resume is the user's, stores the run and starts it", async () => {
    const { req, res } = setup({
      requirements,
      candidates: [{ id: "a", resumeId: "r1" }, { id: "b", resumeId: "r2" }, { id: "c", resumeId: "r3" }],
    });

    await createRankingController(req, res);

    expect(mockGetResume).toHaveBeenCalledWith("r1", "user-1");
    expect(mockCreateRun).toHaveBeenCalledWith({
      userId: "user-1",
      jobPostingId: null,
      mode: "saved",
      candidateIds: ["a", "b", "c"],
      resumeIds: ["r1", "r2", "r3"],
      rounds: 2,
      totalTasks: 6,
      requirements,
    });
    expect(mockStartRun).toHaveBeenCalledWith(expect.objectContaining({ id: "run-1" }), "sk-test");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ runId: "run-1", totalTasks: 6 });
  });

  it("saved mode: links the run to the user's saved job", async () => {
    const { req, res } = setup({
      requirements,
      jobPostingId: "job-1",
      candidates: [{ id: "a", resumeId: "r1" }, { id: "b", resumeId: "r2" }],
    });

    await createRankingController(req, res);

    expect(mockGetJob).toHaveBeenCalledWith("job-1", "user-1");
    expect(mockCreateRun).toHaveBeenCalledWith(expect.objectContaining({ jobPostingId: "job-1", mode: "saved" }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("saved mode: 404 for someone else's job, 400 for a non-string jobPostingId", async () => {
    const other = setup({ requirements, jobPostingId: "job-2", candidates: [{ id: "a", resumeId: "r1" }, { id: "b", resumeId: "r2" }] });
    await createRankingController(other.req, other.res);
    expect(other.res.status).toHaveBeenCalledWith(404);

    const bad = setup({ requirements, jobPostingId: 42, candidates: [{ id: "a", resumeId: "r1" }, { id: "b", resumeId: "r2" }] });
    await createRankingController(bad.req, bad.res);
    expect(bad.res.status).toHaveBeenCalledWith(400);

    expect(mockCreateRun).not.toHaveBeenCalled();
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  it("saved mode: 404 when a resume isn't the user's", async () => {
    mockGetResume.mockResolvedValueOnce({ id: "r1", file_path: "user-1/r1.pdf" }).mockResolvedValueOnce(null);
    const { req, res } = setup({ requirements, candidates: [{ id: "a", resumeId: "r1" }, { id: "b", resumeId: "r2" }] });

    await createRankingController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockCreateRun).not.toHaveBeenCalled();
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  it("private mode: reads and redacts PDFs in memory; only the runner gets the text", async () => {
    const { req, res } = setup({ requirements, rounds: 1, candidates: [{ id: "a", resumePdf: pdf() }, { id: "b", resumePdf: pdf() }] });

    await createRankingController(req, res);

    const input = mockCreateRun.mock.calls[0][0];
    expect(input).toEqual({ userId: "user-1", mode: "private", candidateIds: ["a", "b"], rounds: 1, totalTasks: 1, requirements });
    expect(JSON.stringify(input)).not.toContain("Python dev");

    const texts = mockStartRun.mock.calls[0][2] as Map<string, string>;
    expect(texts.get("a")).toBe("Python dev, [email], [phone]");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ runId: "run-1", totalTasks: 1 });
  });

  it("private mode: 400 when a PDF has no readable text", async () => {
    mockTextFromPdf.mockRejectedValueOnce(new Error("bad xref"));
    const { req, res } = setup({ requirements, candidates: [{ id: "a", resumePdf: pdf() }, { id: "b", resumePdf: pdf() }] });

    await createRankingController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking the error when the store fails", async () => {
    mockCreateRun.mockRejectedValue(new Error("Could not create ranking run: boom"));
    const { req, res } = setup({ requirements, candidates: [{ id: "a", resumeId: "r1" }, { id: "b", resumeId: "r2" }] });

    await createRankingController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Something went wrong. Please try again." });
  });
});

describe("getRankingController", () => {
  it("returns the run and the last seq for the owner", async () => {
    mockGetRun.mockResolvedValue(runRow());
    mockGetLastSeq.mockResolvedValue(7);
    const { req, res } = setup(undefined, { runId: "run-1" });

    await getRankingController(req, res);

    expect(mockGetRun).toHaveBeenCalledWith("run-1", "user-1");
    expect(res.json).toHaveBeenCalledWith({
      run: { id: "run-1", status: "running", mode: "saved", totalTasks: 2, completedTasks: 1, result: null, error: null },
      lastSeq: 7,
    });
  });

  it("404s for someone else's run", async () => {
    mockGetRun.mockResolvedValue(null);
    const { req, res } = setup(undefined, { runId: "run-x" });

    await getRankingController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockGetLastSeq).not.toHaveBeenCalled();
  });
});

describe("resumeRankingController", () => {
  it("restarts a stopped saved run", async () => {
    mockGetRun.mockResolvedValue(runRow({ status: "running" }));
    mockIsRunActive.mockReturnValue(false);
    const { req, res } = setup(undefined, { runId: "run-1" });

    await resumeRankingController(req, res);

    expect(mockStartRun).toHaveBeenCalledWith(expect.objectContaining({ id: "run-1" }), "sk-test");
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("refuses private, completed and already-active runs", async () => {
    for (const [row, active] of [
      [runRow({ mode: "private", status: "interrupted" }), false],
      [runRow({ status: "completed" }), false],
      [runRow(), true],
    ] as const) {
      mockGetRun.mockResolvedValue(row);
      mockIsRunActive.mockReturnValue(active);
      const { req, res } = setup(undefined, { runId: "run-1" });
      await resumeRankingController(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    }
    expect(mockStartRun).not.toHaveBeenCalled();
  });

  it("maps OpenAI-style errors by status only", async () => {
    mockGetRun.mockRejectedValue(new APIError(429, {}, "quota sk-te****", new Headers()));
    const { req, res } = setup(undefined, { runId: "run-1" });

    await resumeRankingController(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toContain("sk-te");
  });
});

describe("deleteRankingController", () => {
  function deleteSetup() {
    const { req, res } = setup(undefined, { runId: "run-1" });
    (res as unknown as { end: jest.Mock }).end = jest.fn().mockReturnThis();
    return { req, res };
  }

  it("deletes the owner's finished run -> 204", async () => {
    mockGetRun.mockResolvedValue(runRow({ status: "completed" }));
    mockIsRunActive.mockReturnValue(false);
    mockDeleteRun.mockResolvedValue(true);
    const { req, res } = deleteSetup();

    await deleteRankingController(req, res);

    expect(mockDeleteRun).toHaveBeenCalledWith("run-1", "user-1");
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("404s for someone else's run and 409s for a run still executing", async () => {
    mockGetRun.mockResolvedValue(null);
    const missing = deleteSetup();
    await deleteRankingController(missing.req, missing.res);
    expect(missing.res.status).toHaveBeenCalledWith(404);

    mockGetRun.mockResolvedValue(runRow());
    mockIsRunActive.mockReturnValue(true);
    const active = deleteSetup();
    await deleteRankingController(active.req, active.res);
    expect(active.res.status).toHaveBeenCalledWith(409);

    expect(mockDeleteRun).not.toHaveBeenCalled();
  });
});
