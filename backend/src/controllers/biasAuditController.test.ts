// Tests for the bias-audit controller: validation (attributes, runs, 1-5 candidates), saved and
// private resume loading with redaction, and that variant TEXTS never reach the response.

import { Request, Response } from "express";

jest.mock("../services/biasAudit", () => ({ runBiasAudit: jest.fn() }));
jest.mock("../services/rankingRunner", () => ({
  loadSavedResumeText: jest.fn(),
  openaiErrorMessage: () => "OpenAI error",
}));
jest.mock("../services/supabaseService", () => ({ getResumeForUser: jest.fn() }));
jest.mock("../services/pdfService", () => ({ textFromPdf: jest.fn() }));
jest.mock("../services/rankingStore", () => ({}));

import biasAuditController from "./biasAuditController";
import { runBiasAudit } from "../services/biasAudit";
import { loadSavedResumeText } from "../services/rankingRunner";
import { textFromPdf } from "../services/pdfService";

const mockRunBiasAudit = runBiasAudit as jest.Mock;
const mockLoadSaved = loadSavedResumeText as jest.Mock;
const mockTextFromPdf = textFromPdf as jest.Mock;

const requirements = [{ id: "r1", requirement: "Python", importance: "required" }];
const pdf = () => Buffer.from("%PDF-1.4 resume").toString("base64");

function setup(body: unknown, headers: Record<string, string> = { "x-openai-key": "sk-test" }) {
  const req = { body, headers } as unknown as Request;
  const res = {
    locals: { user: { id: "user-1" } },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

const report = {
  attribute: "pronouns",
  pairs: [
    {
      candidateId: "a",
      baseline: { label: "he", text: "SECRET RESUME he/him" },
      variant: { label: "she", text: "SECRET RESUME she/her" },
      baselineScore: 80,
      variantScore: 75,
      delta: -5,
    },
  ],
  meanDelta: -5,
  ci95: [-5, -5],
  flipRate: 1,
  impactRatio: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockRunBiasAudit.mockResolvedValue([report]);
  mockLoadSaved.mockResolvedValue("Saved resume text [email]");
  mockTextFromPdf.mockResolvedValue("Private resume, jo@example.com");
});

describe("biasAuditController", () => {
  it.each([
    [{ requirements, attributes: [], candidates: [{ id: "a", resumeId: "r1" }] }, /attributes/],
    [{ requirements, attributes: ["race"], candidates: [{ id: "a", resumeId: "r1" }] }, /attributes/],
    [{ requirements, attributes: ["pronouns", "pronouns"], candidates: [{ id: "a", resumeId: "r1" }] }, /attributes/],
    [{ requirements, attributes: ["pronouns"], runs: 4, candidates: [{ id: "a", resumeId: "r1" }] }, /runs/],
    [{ requirements, attributes: ["pronouns"], runs: 1.5, candidates: [{ id: "a", resumeId: "r1" }] }, /runs/],
    [{ requirements, attributes: ["pronouns"], candidates: [] }, /between 1 and 5/],
    [
      { requirements, attributes: ["pronouns"], candidates: Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, resumeId: "r" })) },
      /between 1 and 5/,
    ],
    [{ attributes: ["pronouns"], candidates: [{ id: "a", resumeId: "r1" }] }, /requirements/],
  ])("rejects invalid input %#", async (body, message) => {
    const { req, res } = setup(body);
    await biasAuditController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toMatch(message);
    expect(mockRunBiasAudit).not.toHaveBeenCalled();
  });

  it("requires the OpenAI key", async () => {
    const { req, res } = setup({ requirements, attributes: ["pronouns"], candidates: [{ id: "a", resumeId: "r1" }] }, {});
    await biasAuditController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("saved mode: loads the user's resumes and returns labels and scores only", async () => {
    const { req, res } = setup({ requirements, attributes: ["pronouns", "graduation_year"], candidates: [{ id: "a", resumeId: "r1" }] });

    await biasAuditController(req, res);

    expect(mockLoadSaved).toHaveBeenCalledWith("r1", "user-1");
    expect(mockRunBiasAudit).toHaveBeenCalledWith(
      "sk-test",
      requirements,
      [{ id: "a", text: "Saved resume text [email]" }],
      ["pronouns", "graduation_year"],
      { runs: 2 },
    );
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain("SECRET RESUME");
    expect(body.reports[0].pairs[0]).toEqual({
      candidateId: "a",
      baseline: { label: "he" },
      variant: { label: "she" },
      baselineScore: 80,
      variantScore: 75,
      delta: -5,
    });
    expect(body.reports[0]).toMatchObject({ attribute: "pronouns", meanDelta: -5, ci95: [-5, -5], flipRate: 1, impactRatio: 0 });
  });

  it("saved mode: 404 when the resume isn't the user's", async () => {
    mockLoadSaved.mockResolvedValue(null);
    const { req, res } = setup({ requirements, attributes: ["pronouns"], candidates: [{ id: "a", resumeId: "r9" }] });

    await biasAuditController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockRunBiasAudit).not.toHaveBeenCalled();
  });

  it("private mode: decodes the PDF and redacts the text before auditing", async () => {
    const { req, res } = setup({ requirements, attributes: ["name_gender"], runs: 3, candidates: [{ id: "a", resumePdf: pdf() }] });

    await biasAuditController(req, res);

    expect(mockRunBiasAudit).toHaveBeenCalledWith(
      "sk-test",
      requirements,
      [{ id: "a", text: "Private resume, [email]" }],
      ["name_gender"],
      { runs: 3 },
    );
    expect(res.json).toHaveBeenCalledWith({ reports: expect.any(Array) });
  });

  it("private mode: rejects a file that isn't a PDF", async () => {
    const { req, res } = setup({
      requirements,
      attributes: ["pronouns"],
      candidates: [{ id: "a", resumePdf: Buffer.from("hello").toString("base64") }],
    });

    await biasAuditController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "That file isn't a readable PDF." });
  });

  it("returns 500 without echoing the error", async () => {
    mockRunBiasAudit.mockRejectedValue(new SyntaxError("Unexpected token in SECRET RESUME"));
    const { req, res } = setup({ requirements, attributes: ["pronouns"], candidates: [{ id: "a", resumeId: "r1" }] });

    await biasAuditController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toContain("SECRET");
  });
});
