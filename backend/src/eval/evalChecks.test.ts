import { checkCase, requirementMentions } from "./evalChecks";
import { GoldenDatasetCase } from "./goldenDataset";
import { Requirement, RequirementMatch } from "../types";

describe("requirementMentions", () => {
  it("matches short keywords only as whole words", () => {
    expect(requirementMentions("Experience with C", "C")).toBe(true);
    expect(requirementMentions("C++ experience", "C")).toBe(false);
    expect(requirementMentions("SQL databases", "SQL")).toBe(true);
    expect(requirementMentions("NoSQL databases", "SQL")).toBe(false);
    expect(requirementMentions("200-hour yoga teacher training", "200")).toBe(true);
  });

  it("matches longer keywords anywhere, ignoring case", () => {
    expect(requirementMentions("Mat Pilates teaching", "pilates")).toBe(true);
    expect(requirementMentions("CI/CD pipelines", "CI/CD")).toBe(true);
  });
});

describe("checkCase", () => {
  const testCase: GoldenDatasetCase = {
    label: "example",
    resume: "",
    jobPosting: "",
    expectedBand: "Partial match",
    expectedScoreRange: [50, 79],
    shouldMeet: ["Yin"],
    shouldNotMeet: ["Pilates"],
    expectedImportance: { Pilates: "required" },
    expectedBehavior: "",
  };

  const requirements: Requirement[] = [
    { id: "r1", requirement: "Teach Yin yoga", importance: "required" },
    { id: "r2", requirement: "Pilates certification", importance: "required" },
  ];

  const matches = (r1: RequirementMatch["status"], r2: RequirementMatch["status"]) => [
    { requirementId: "r1", status: r1, evidence: "" },
    { requirementId: "r2", status: r2, evidence: "" },
  ];

  it("passes when everything lines up", () => {
    expect(
      checkCase(testCase, {
        requirements,
        matches: matches("met", "not_met"),
        score: 50,
        band: "Partial match",
      }),
    ).toEqual([]);
  });

  it("reports each problem", () => {
    const failures = checkCase(testCase, {
      requirements: [requirements[0]!, { ...requirements[1]!, importance: "preferred" }],
      matches: matches("not_met", "partial"),
      score: 90,
      band: "Strong match",
    });

    expect(failures).toEqual([
      "Score: expected 50-79, got 90",
      'Band: expected "Partial match", got "Strong match"',
      'Should meet "Yin": marked not met',
      'Should not meet "Pilates": marked met or partial',
      'Importance of "Pilates": expected required',
    ]);
  });

  it("fails when a keyword isn't among the requirements", () => {
    const failures = checkCase(
      { ...testCase, shouldMeet: ["Hatha"], shouldNotMeet: [], expectedImportance: {} },
      { requirements, matches: matches("met", "not_met"), score: 50, band: "Partial match" },
    );

    expect(failures).toEqual(['Should meet "Hatha": no requirement mentions it']);
  });
});
