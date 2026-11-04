/*

    Tests for biasAudit - the matched-pair audit of the existing scorer.
    matchResume is MOCKED with a deliberately biased fake scorer, so we know the true effect
    and can check the audit measures it (and that a fair scorer shows no effect).

*/

const mockMatchResume = jest.fn();

jest.mock("./openaiService", () => ({
  matchResume: (...args: unknown[]) => mockMatchResume(...args),
}));

import { impactRatio, pairedBootstrapCI, runBiasAudit, runLimited } from "./biasAudit";
import { NAME_LISTS } from "./counterfactual";
import { CandidateMatch, MatchStatus, Requirement } from "../types";

// 5 required requirements: each "met" is worth 20 points, so scores are easy to reason about
const requirements: Requirement[] = ["r1", "r2", "r3", "r4", "r5"].map((id) => ({
  id,
  requirement: `Skill ${id}`,
  importance: "required",
}));

// a fake AI answer that meets the first `met` requirements
function matchMeeting(met: number): CandidateMatch {
  return {
    summary: "",
    matches: requirements.map((r, i) => ({
      requirementId: r.id,
      status: (i < met ? "met" : "not_met") as MatchStatus,
      evidence: "",
    })),
    strengths: [],
    concerns: [],
    interviewQuestions: [],
  };
}

const femaleNames = new Set<string>(NAME_LISTS.whiteFemale);

// biased fake scorer: 100 normally, 80 when the header has a female-coded name
function genderBiasedScorer(_key: string, _reqs: Requirement[], text: string) {
  const firstName = /^Name: (\S+)/.exec(text)?.[1] ?? "";
  return Promise.resolve(matchMeeting(femaleNames.has(firstName) ? 4 : 5));
}

const resumes = [
  { id: "c1", text: "Backend engineer. Python, SQL. Contact jane@example.com or 555-123-4567." },
  { id: "c2", text: "Data engineer with Spark and Airflow experience." },
  { id: "c3", text: "Platform engineer; Kubernetes and Terraform." },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runBiasAudit", () => {
  it("measures a known gender effect through the real scoring pipeline", async () => {
    mockMatchResume.mockImplementation(genderBiasedScorer);

    const [report] = await runBiasAudit("sk-user", requirements, resumes, ["name_gender"], { runs: 1 });

    expect(report!.attribute).toBe("name_gender");
    expect(report!.pairs).toHaveLength(3);
    for (const pair of report!.pairs) {
      expect(pair.baseline.label).toBe("male-coded");
      expect(pair.variant.label).toBe("female-coded");
      expect(pair.baselineScore).toBe(100);
      expect(pair.variantScore).toBe(80);
      expect(pair.delta).toBe(-20);
    }
    expect(report!.meanDelta).toBe(-20);
    expect(report!.ci95).toEqual([-20, -20]);
    // 100 is Strong match, 80 is still Strong match: no band flips
    expect(report!.flipRate).toBe(0);
    expect(report!.impactRatio).toBe(1);
  });

  it("reports band flips and the four-fifths impact ratio", async () => {
    // male-coded -> 80 (Strong), female-coded -> 60 (Partial)
    mockMatchResume.mockImplementation((_k: string, _r: Requirement[], text: string) => {
      const firstName = /^Name: (\S+)/.exec(text)?.[1] ?? "";
      return Promise.resolve(matchMeeting(femaleNames.has(firstName) ? 3 : 4));
    });

    const [report] = await runBiasAudit("sk-user", requirements, resumes, ["name_gender"], { runs: 1 });

    expect(report!.meanDelta).toBe(-20);
    expect(report!.flipRate).toBe(1);
    // female-coded selection rate 0 / male-coded 1
    expect(report!.impactRatio).toBe(0);
  });

  it("shows no effect for a fair scorer", async () => {
    mockMatchResume.mockResolvedValue(matchMeeting(3));

    const reports = await runBiasAudit("sk-user", requirements, resumes, ["name_gender", "name_ethnicity"], { runs: 1 });

    for (const report of reports) {
      expect(report.meanDelta).toBe(0);
      expect(report.ci95).toEqual([0, 0]);
      expect(report.flipRate).toBe(0);
      // nobody reaches Strong match (60)
      expect(report.impactRatio).toBeNull();
    }
  });

  it("averages `runs` calls per variant, separating noise from the attribute effect", async () => {
    // the scorer alternates 100, 80, 100, 80... regardless of the text (pure noise)
    let call = 0;
    mockMatchResume.mockImplementation(() => Promise.resolve(matchMeeting(call++ % 2 === 0 ? 5 : 4)));

    const [report] = await runBiasAudit("sk-user", requirements, [resumes[0]!], ["name_gender"], { runs: 2, concurrency: 1 });

    // 2 variants x 2 runs
    expect(mockMatchResume).toHaveBeenCalledTimes(4);
    expect(report!.pairs[0]!.baselineScore).toBe(90);
    expect(report!.pairs[0]!.variantScore).toBe(90);
    expect(report!.meanDelta).toBe(0);
  });

  it("redacts contact details before scoring, but keeps the name header", async () => {
    mockMatchResume.mockResolvedValue(matchMeeting(5));

    await runBiasAudit("sk-user", requirements, [resumes[0]!], ["name_ethnicity"], { runs: 1 });

    for (const [key, reqs, text] of mockMatchResume.mock.calls) {
      expect(key).toBe("sk-user");
      expect(reqs).toBe(requirements);
      expect(text).not.toContain("jane@example.com");
      expect(text).not.toContain("555-123-4567");
      expect(text).toContain("[email]");
      expect(text).toMatch(/^Name: \S+ \S+\n/);
    }
  });

  it("skips resumes the proxy doesn't apply to, and returns one report per attribute in order", async () => {
    mockMatchResume.mockResolvedValue(matchMeeting(5));

    const reports = await runBiasAudit(
      "sk-user",
      requirements,
      [
        { id: "with-year", text: "B.S. Biology, 2010. Lab technician." },
        { id: "no-year", text: "Lab technician." },
      ],
      ["graduation_year", "pronouns", "graduation_year"],
      { runs: 1 },
    );

    expect(reports.map((r) => r.attribute)).toEqual(["graduation_year", "pronouns"]);
    expect(reports[0]!.pairs.map((p) => p.candidateId)).toEqual(["with-year"]);
    expect(reports[0]!.pairs[0]!.variant.text).toContain("1990");
    // no pronouns anywhere: an empty report, not an error
    expect(reports[1]).toEqual({ attribute: "pronouns", pairs: [], meanDelta: 0, ci95: [0, 0], flipRate: 0, impactRatio: null });
  });

  it("compares every non-reference variant against the reference (pronouns: 2 pairs per resume)", async () => {
    mockMatchResume.mockResolvedValue(matchMeeting(5));

    const [report] = await runBiasAudit("sk-user", requirements, [{ id: "p", text: "She led the team." }], ["pronouns"], { runs: 1 });

    expect(report!.pairs.map((p) => `${p.baseline.label} -> ${p.variant.label}`)).toEqual([
      "he/him -> she/her",
      "he/him -> they/them",
    ]);
  });

  it("never runs more than `concurrency` scoring calls at once", async () => {
    let active = 0;
    let peak = 0;
    mockMatchResume.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return matchMeeting(5);
    });

    await runBiasAudit("sk-user", requirements, resumes, ["name_gender", "name_ethnicity"], { runs: 2 });

    expect(mockMatchResume).toHaveBeenCalledTimes(3 * 2 * 2 * 2);
    expect(peak).toBe(3);
  });

  it("gives the same confidence interval for the same seed", async () => {
    let call = 0;
    mockMatchResume.mockImplementation(() => Promise.resolve(matchMeeting([5, 3, 4, 2, 5, 4][call++ % 6]!)));
    const first = await runBiasAudit("sk-user", requirements, resumes, ["name_gender"], { runs: 1, seed: "s", concurrency: 1 });
    call = 0;
    const second = await runBiasAudit("sk-user", requirements, resumes, ["name_gender"], { runs: 1, seed: "s", concurrency: 1 });
    expect(second[0]!.ci95).toEqual(first[0]!.ci95);
  });

  it("fails the whole audit if a scoring call fails", async () => {
    mockMatchResume.mockRejectedValue(new Error("OpenAI is down"));
    await expect(runBiasAudit("sk-user", requirements, resumes, ["name_gender"])).rejects.toThrow("OpenAI is down");
  });
});

describe("pairedBootstrapCI", () => {
  it("brackets the mean and is reproducible for a seed", () => {
    const deltas = [-12, -5, 0, -8, -3, -10, 2, -7, -6, -4];
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const [low, high] = pairedBootstrapCI(deltas, "seed");
    expect(low).toBeLessThan(mean);
    expect(high).toBeGreaterThan(mean);
    expect(high).toBeLessThan(0); // a consistent negative effect excludes 0
    expect(pairedBootstrapCI(deltas, "seed")).toEqual([low, high]);
  });

  it("includes 0 for noise centred on 0", () => {
    const [low, high] = pairedBootstrapCI([-5, 5, -3, 3, -4, 4, 0, 1, -1], "seed");
    expect(low).toBeLessThan(0);
    expect(high).toBeGreaterThan(0);
  });

  it("is [0, 0] with no pairs", () => {
    expect(pairedBootstrapCI([], "seed")).toEqual([0, 0]);
  });
});

describe("impactRatio", () => {
  it("is the lowest selection rate over the highest", () => {
    expect(impactRatio([[8, 10], [6, 10]])).toBeCloseTo(0.75, 12);
    expect(impactRatio([[5, 10], [5, 10]])).toBe(1);
  });

  it("is null when nobody was selected", () => {
    expect(impactRatio([[0, 10], [0, 10]])).toBeNull();
    expect(impactRatio([])).toBeNull();
  });
});

describe("runLimited", () => {
  it("keeps results in job order", async () => {
    const jobs = [30, 1, 10].map((ms, i) => () => new Promise<number>((resolve) => setTimeout(() => resolve(i), ms)));
    expect(await runLimited(jobs, 2)).toEqual([0, 1, 2]);
  });
});
