import {
  kendallTauB,
  mean,
  meanPairwiseTau,
  perCandidateStdDev,
  standardDeviation,
  top1Agreement,
  topIds,
} from "./stabilityStats";

describe("mean and standardDeviation", () => {
  it("computes the sample std-dev", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBe(0);
    // deviations -2, 0, 2 -> 8 / (3 - 1) = 4 -> 2
    expect(standardDeviation([2, 4, 6])).toBe(2);
    expect(standardDeviation([5, 5, 5])).toBe(0);
    expect(standardDeviation([7])).toBe(0);
  });
});

describe("perCandidateStdDev", () => {
  it("gives each candidate's spread across runs", () => {
    const runs = [{ a: 50, b: 80 }, { a: 70, b: 80 }, { a: 60, b: 80 }];
    expect(perCandidateStdDev(runs)).toEqual({ a: 10, b: 0 });
  });

  it("skips candidates missing from a run", () => {
    expect(perCandidateStdDev([{ a: 1, b: 2 }, { a: 3 }])).toEqual({ a: Math.SQRT2 });
  });
});

describe("kendallTauB", () => {
  it("is 1 for the same order, -1 for reversed", () => {
    expect(kendallTauB({ a: 3, b: 2, c: 1 }, { a: 30, b: 20, c: 10 })).toBe(1);
    expect(kendallTauB({ a: 3, b: 2, c: 1 }, { a: 1, b: 2, c: 3 })).toBe(-1);
  });

  it("corrects for ties instead of breaking them", () => {
    // x: a>b, a>c, b=c ; y: strict a>b>c -> 2 concordant, 1 pair tied in x only
    // tau-b = 2 / sqrt(2 * 3)
    expect(kendallTauB({ a: 2, b: 1, c: 1 }, { a: 3, b: 2, c: 1 })).toBeCloseTo(2 / Math.sqrt(6), 12);
  });

  it("handles the all-tied edge cases", () => {
    expect(kendallTauB({ a: 1, b: 1 }, { a: 5, b: 5 })).toBe(1);
    expect(kendallTauB({ a: 1, b: 1 }, { a: 5, b: 4 })).toBe(0);
    expect(kendallTauB({ a: 1 }, { a: 1 })).toBe(0);
  });
});

describe("meanPairwiseTau", () => {
  it("averages tau over every pair of runs", () => {
    const up = { a: 3, b: 2, c: 1 };
    const down = { a: 1, b: 2, c: 3 };
    // pairs: (up, up) = 1, (up, down) = -1, (up, down) = -1 -> -1/3
    expect(meanPairwiseTau([up, up, down])).toBeCloseTo(-1 / 3, 12);
    expect(meanPairwiseTau([up])).toBe(1);
  });
});

describe("top1Agreement", () => {
  it("is 1 when every run has the same unique top", () => {
    expect(top1Agreement([{ a: 9, b: 1 }, { a: 5, b: 4 }, { a: 2, b: 1 }])).toBe(1);
  });

  it("is the share of run pairs that agree", () => {
    // tops: a, a, b -> pairs agree, disagree, disagree
    expect(top1Agreement([{ a: 2, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 2 }])).toBeCloseTo(1 / 3, 12);
  });

  it("treats a tie at the top as a coin flip", () => {
    expect(topIds({ a: 5, b: 5, c: 1 }).sort()).toEqual(["a", "b"]);
    // {a, b} vs {a}: chance a random pick from each agrees = 1 / (2 * 1)
    expect(top1Agreement([{ a: 5, b: 5, c: 1 }, { a: 5, b: 1, c: 1 }])).toBe(0.5);
  });
});
