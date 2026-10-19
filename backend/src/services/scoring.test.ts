import { computeScore, normalizeMatches, parseRequirements, scoreBand } from "./scoring";
import { Requirement, RequirementMatch } from "../types";

const requirements: Requirement[] = [
  { id: "r1", requirement: "Python", importance: "required" },
  { id: "r2", requirement: "SQL", importance: "required" },
  { id: "r3", requirement: "Docker", importance: "preferred" },
];

function match(requirementId: string, status: RequirementMatch["status"]): RequirementMatch {
  return { requirementId, status, evidence: status === "not_met" ? "" : "evidence" };
}

describe("computeScore", () => {
  it("gives 100 when everything is met and 0 when nothing is", () => {
    expect(computeScore(requirements, requirements.map((r) => match(r.id, "met")))).toBe(100);
    expect(computeScore(requirements, requirements.map((r) => match(r.id, "not_met")))).toBe(0);
  });

  it("weights required requirements double and gives partial half credit", () => {
    // earned: r1 met 2 + r2 partial 1 + r3 not met 0 = 3 of 5 possible
    const matches = [match("r1", "met"), match("r2", "partial"), match("r3", "not_met")];
    expect(computeScore(requirements, matches)).toBe(60);
  });

  it("treats missing matches as not met", () => {
    // only r3 (preferred, weight 1) met: 1 of 5
    expect(computeScore(requirements, [match("r3", "met")])).toBe(20);
  });

  it("returns 0 for an empty requirement list", () => {
    expect(computeScore([], [])).toBe(0);
  });
});

describe("scoreBand", () => {
  it("maps scores to bands at 80 and 50", () => {
    expect(scoreBand(80)).toBe("Strong match");
    expect(scoreBand(79)).toBe("Partial match");
    expect(scoreBand(50)).toBe("Partial match");
    expect(scoreBand(49)).toBe("Weak match");
  });
});

describe("normalizeMatches", () => {
  it("returns one match per requirement in order, dropping unknown and duplicate ids", () => {
    const result = normalizeMatches(requirements, [
      match("r3", "met"),
      match("r1", "partial"),
      match("r1", "met"),
      match("r99", "met"),
    ]);

    expect(result).toEqual([
      match("r1", "partial"),
      { requirementId: "r2", status: "not_met", evidence: "" },
      match("r3", "met"),
    ]);
  });
});

describe("parseRequirements", () => {
  it("accepts a valid list and trims requirement text", () => {
    expect(
      parseRequirements([{ id: "r1", requirement: "  Python  ", importance: "required" }]),
    ).toEqual([{ id: "r1", requirement: "Python", importance: "required" }]);
  });

  it("rejects missing, empty, oversized, or malformed lists", () => {
    const valid = { id: "r1", requirement: "Python", importance: "required" };
    const tooMany = Array.from({ length: 13 }, (_, i) => ({ ...valid, id: `r${i + 1}` }));

    expect(parseRequirements(undefined)).toBeNull();
    expect(parseRequirements([])).toBeNull();
    expect(parseRequirements(tooMany)).toBeNull();
    expect(parseRequirements([{ ...valid, importance: "essential" }])).toBeNull();
    expect(parseRequirements([{ ...valid, requirement: "" }])).toBeNull();
    expect(parseRequirements([valid, valid])).toBeNull();
    expect(parseRequirements(["Python"])).toBeNull();
  });
});
