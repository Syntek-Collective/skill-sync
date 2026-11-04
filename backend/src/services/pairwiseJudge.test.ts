/*

    Tests for pairwiseJudge - the AI call that compares two resumes.
    OpenAI is MOCKED the same way as in openaiService.test.ts, so nothing hits the API.

*/

// fake responses.create; the variable name starts with "mock" so Jest allows using it in jest.mock
const mockCreate = jest.fn();
// remembers which API key each fake client was created with (to check BYOK)
const mockClientKeys: string[] = [];

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(({ apiKey }: { apiKey: string }) => {
    mockClientKeys.push(apiKey);
    return { responses: { create: mockCreate } };
  }),
}));

import { judgePair } from "./pairwiseJudge";
import { pairwisePrompt } from "../prompt";
import { Requirement } from "../types";

function replyWith(value: unknown) {
  mockCreate.mockResolvedValue({ output_text: JSON.stringify(value) });
}

function lastCallOptions() {
  return mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
}

const requirements: Requirement[] = [
  { id: "r1", requirement: "Python", importance: "required" },
  { id: "r2", requirement: "Docker", importance: "preferred" },
];

const originalModel = process.env.OPENAI_MODEL;

beforeEach(() => {
  jest.clearAllMocks();
  mockClientKeys.length = 0;
  delete process.env.OPENAI_MODEL;
});

afterAll(() => {
  if (originalModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = originalModel;
});

describe("judgePair", () => {
  it("returns the parsed judgment", async () => {
    replyWith({ winner: "B", reason: "B shows 5 years of Python.", decidingRequirementIds: ["r1"] });

    const judgment = await judgePair("sk-user", requirements, "Resume A text", "Resume B text");

    expect(judgment).toEqual({ winner: "B", reason: "B shows 5 years of Python.", decidingRequirementIds: ["r1"] });
  });

  it("sends the requirements and both resumes, labelled A then B", async () => {
    replyWith({ winner: "tie", reason: "Equal.", decidingRequirementIds: [] });

    await judgePair("sk-user", requirements, "FIRST RESUME", "SECOND RESUME");

    const input: string = lastCallOptions().input;
    expect(input).toContain(JSON.stringify(requirements));
    expect(input.indexOf("Candidate A")).toBeLessThan(input.indexOf("FIRST RESUME"));
    expect(input.indexOf("FIRST RESUME")).toBeLessThan(input.indexOf("Candidate B"));
    expect(input.indexOf("Candidate B")).toBeLessThan(input.indexOf("SECOND RESUME"));
    expect(lastCallOptions().instructions).toBe(pairwisePrompt);
  });

  it("uses the user's key, store: false, the shared model settings and a strict schema", async () => {
    replyWith({ winner: "A", reason: "r", decidingRequirementIds: [] });

    await judgePair("sk-user", requirements, "a", "b");

    expect(mockClientKeys).toEqual(["sk-user"]);
    expect(lastCallOptions().store).toBe(false);
    expect(lastCallOptions().model).toBe("gpt-5-mini");
    expect(lastCallOptions().reasoning).toEqual({ effort: "low" });
    expect(lastCallOptions().text.format).toEqual(
      expect.objectContaining({ type: "json_schema", strict: true }),
    );
    expect(lastCallOptions().text.format.schema.properties.winner.enum).toEqual(["A", "B", "tie"]);
  });

  it("follows OPENAI_MODEL like the rest of the app", async () => {
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    replyWith({ winner: "A", reason: "r", decidingRequirementIds: [] });

    await judgePair("sk-user", requirements, "a", "b");

    expect(lastCallOptions().model).toBe("gpt-4o-mini");
    expect(lastCallOptions().reasoning).toBeUndefined();
    expect(lastCallOptions().store).toBe(false);
  });

  it("drops unknown and repeated requirement ids", async () => {
    replyWith({ winner: "A", reason: "r", decidingRequirementIds: ["r2", "r9", "r2", "r1"] });

    const judgment = await judgePair("sk-user", requirements, "a", "b");

    expect(judgment.decidingRequirementIds).toEqual(["r2", "r1"]);
  });

  it("passes errors from OpenAI up to the caller", async () => {
    mockCreate.mockRejectedValue(new Error("OpenAI is down"));

    await expect(judgePair("sk-user", requirements, "a", "b")).rejects.toThrow("OpenAI is down");
  });
});

describe("pairwisePrompt", () => {
  it("covers the fairness and judging rules", () => {
    expect(pairwisePrompt).toMatch(/required.*preferred/i);
    expect(pairwisePrompt).toMatch(/tie/);
    expect(pairwisePrompt).toMatch(/gender/i);
    expect(pairwisePrompt).toMatch(/age/i);
    expect(pairwisePrompt).toMatch(/ethnicity/i);
    expect(pairwisePrompt).toMatch(/prestige/i);
    expect(pairwisePrompt).toMatch(/length/i);
    expect(pairwisePrompt).toMatch(/formatting/i);
  });
});
