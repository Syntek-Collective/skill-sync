/*

    What is this file for?
    Tests for the openaiService - checks that the AI service works correctly.
    (CODE test - does it call the AI the right way and return the right shape - separate
     from the golden dataset evals, which judge the QUALITY of the AI's answers)

    How the OpenAI call is MOCKED:
    jest.mock('openai') swaps the real OpenAI library for a fake class, so these tests never
    hit the API or cost money. mockCreate stands in for openai.responses.create - each test
    decides what it "returns" and then checks what our service sent to it.

    (see services/zNOTES.md for how services work in general)

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

import { extractRequirements, matchResume } from "./openaiService";
import { Requirement } from "../types";

// what the fake AI "replies" - the service reads response.output_text and JSON.parses it
function replyWith(value: unknown) {
  mockCreate.mockResolvedValue({ output_text: JSON.stringify(value) });
}

// the options our service passed to responses.create on its most recent call
function lastCallOptions() {
  return mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0];
}

const originalModel = process.env.OPENAI_MODEL;

beforeEach(() => {
  jest.clearAllMocks();
  mockClientKeys.length = 0;
  // each test starts with the default model unless it sets one
  delete process.env.OPENAI_MODEL;
});

afterAll(() => {
  if (originalModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = originalModel;
});

describe("extractRequirements", () => {
  it("assigns ids r1, r2, ... in code (the AI never picks ids)", async () => {
    replyWith({
      requirements: [
        { requirement: "Python", importance: "required" },
        { requirement: "Docker", importance: "preferred" },
      ],
    });

    const requirements = await extractRequirements("sk-user", "We need Python and Docker.");

    expect(requirements).toEqual([
      { id: "r1", requirement: "Python", importance: "required" },
      { id: "r2", requirement: "Docker", importance: "preferred" },
    ]);
  });

  it("keeps at most 12 requirements", async () => {
    replyWith({
      requirements: Array.from({ length: 15 }, (_, i) => ({
        requirement: `Skill ${i + 1}`,
        importance: "required",
      })),
    });

    const requirements = await extractRequirements("sk-user", "A long posting");

    expect(requirements).toHaveLength(12);
    expect(requirements[11]?.id).toBe("r12");
  });

  it("uses the user's own key and a strict JSON schema", async () => {
    replyWith({ requirements: [] });

    await extractRequirements("sk-user", "Job text");

    // BYOK: the client is created with the key passed in, not one from .env
    expect(mockClientKeys).toEqual(["sk-user"]);
    expect(lastCallOptions().text.format).toEqual(
      expect.objectContaining({ type: "json_schema", strict: true }),
    );
    expect(lastCallOptions().input).toContain("Job text");
  });

  it("defaults to gpt-5-mini with low reasoning effort", async () => {
    replyWith({ requirements: [] });

    await extractRequirements("sk-user", "Job text");

    expect(lastCallOptions().model).toBe("gpt-5-mini");
    expect(lastCallOptions().reasoning).toEqual({ effort: "low" });
  });

  it("uses OPENAI_MODEL, and skips reasoning for models that don't support it", async () => {
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    replyWith({ requirements: [] });

    await extractRequirements("sk-user", "Job text");

    expect(lastCallOptions().model).toBe("gpt-4o-mini");
    expect(lastCallOptions().reasoning).toBeUndefined();
  });

  it("passes errors from OpenAI up to the controller", async () => {
    mockCreate.mockRejectedValue(new Error("OpenAI is down"));

    await expect(extractRequirements("sk-user", "Job text")).rejects.toThrow("OpenAI is down");
  });
});

describe("matchResume", () => {
  const requirements: Requirement[] = [
    { id: "r1", requirement: "Python", importance: "required" },
  ];

  it("sends the requirements and resume text, and returns the parsed match", async () => {
    const match = {
      summary: "Strong Python background.",
      matches: [{ requirementId: "r1", status: "met", evidence: "5 years of Python" }],
      strengths: ["Python"],
      concerns: [],
      interviewQuestions: ["Tell me about a Python project."],
    };
    replyWith(match);

    const result = await matchResume("sk-user", requirements, "5 years of Python");

    expect(result).toEqual(match);
    expect(mockClientKeys).toEqual(["sk-user"]);
    // the AI needs the requirement ids to answer per requirement
    expect(lastCallOptions().input).toContain(JSON.stringify(requirements));
    expect(lastCallOptions().input).toContain("5 years of Python");
    expect(lastCallOptions().text.format).toEqual(
      expect.objectContaining({ type: "json_schema", strict: true }),
    );
  });
});
