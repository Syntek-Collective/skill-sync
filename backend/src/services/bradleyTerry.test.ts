/*

    Tests for bradleyTerry - the strength fit behind pairwise ranking.
    The key test simulates a tournament from KNOWN strengths (with a seeded random generator,
    so it's repeatable) and checks the fit recovers them.

*/

import { fitBradleyTerry, kendallTau, Outcome, winProbability } from "./bradleyTerry";
import { mulberry32 } from "./pairSchedule";

// plays every pair `games` times; i beats j with the true Bradley-Terry probability
function simulate(trueStrengths: Record<string, number>, games: number, seed: number): Outcome[] {
  const random = mulberry32(seed);
  const ids = Object.keys(trueStrengths);
  const outcomes: Outcome[] = [];
  for (let g = 0; g < games; g++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const p = winProbability(trueStrengths[a]!, trueStrengths[b]!);
        outcomes.push({ a, b, result: random() < p ? "a" : "b" });
      }
    }
  }
  return outcomes;
}

const byId = (fit: ReturnType<typeof fitBradleyTerry>) =>
  Object.fromEntries(fit.strengths.map((s) => [s.id, s]));

describe("fitBradleyTerry", () => {
  it("recovers a known strength ordering from simulated outcomes", () => {
    const truth = { c1: 8, c2: 4, c3: 2, c4: 1, c5: 0.5, c6: 0.25 };
    const truthRanking = Object.keys(truth);

    const fit = fitBradleyTerry(truthRanking, simulate(truth, 40, 12345));
    const fitted = fit.strengths.map((s) => s.id);

    expect(fit.converged).toBe(true);
    expect(kendallTau(fitted, truthRanking)).toBeGreaterThanOrEqual(0.85);
    expect(fitted[0]).toBe("c1");
    expect(fitted[fitted.length - 1]).toBe("c6");

    // log strengths are on the right scale too: each true step is a factor of 2 (log 2 ≈ 0.69)
    const strengths = byId(fit);
    const spread = strengths.c1!.logStrength - strengths.c6!.logStrength;
    expect(spread).toBeGreaterThan(5 * Math.log(2) * 0.6);
    expect(spread).toBeLessThan(5 * Math.log(2) * 1.4);
  });

  it("recovers the ordering across several random seeds", () => {
    const truth = { a: 5, b: 2.5, c: 1.2, d: 0.6, e: 0.3 };
    for (const seed of [1, 2, 3, 4, 5]) {
      const fit = fitBradleyTerry(Object.keys(truth), simulate(truth, 30, seed));
      expect(kendallTau(fit.strengths.map((s) => s.id), Object.keys(truth))).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("normalises strengths to a geometric mean of 1 (mean logStrength 0)", () => {
    const fit = fitBradleyTerry(["a", "b", "c"], [
      { a: "a", b: "b", result: "a" },
      { a: "b", b: "c", result: "b" },
      { a: "a", b: "c", result: "a" },
    ]);
    const meanLog = fit.strengths.reduce((sum, s) => sum + s.logStrength, 0) / fit.strengths.length;
    expect(meanLog).toBeCloseTo(0, 10);
    for (const s of fit.strengths) expect(s.logStrength).toBeCloseTo(Math.log(s.strength), 12);
  });

  it("returns strengths sorted strongest first, with win/loss/tie counts", () => {
    const fit = fitBradleyTerry(["low", "mid", "high"], [
      { a: "low", b: "high", result: "b" },
      { a: "mid", b: "high", result: "b" },
      { a: "low", b: "mid", result: "tie" },
    ]);
    // low and mid have identical records, so equal strengths keep their input order
    expect(fit.strengths.map((s) => s.id)).toEqual(["high", "low", "mid"]);
    const s = byId(fit);
    expect(s.high).toMatchObject({ wins: 2, losses: 0, ties: 0 });
    expect(s.low).toMatchObject({ wins: 0, losses: 1, ties: 1 });
    expect(s.mid).toMatchObject({ wins: 0, losses: 1, ties: 1 });
  });

  it("counts a tie as half a win: all ties give equal strengths", () => {
    const fit = fitBradleyTerry(["a", "b", "c"], [
      { a: "a", b: "b", result: "tie" },
      { a: "b", b: "c", result: "tie" },
      { a: "a", b: "c", result: "tie" },
    ]);
    for (const s of fit.strengths) expect(s.strength).toBeCloseTo(1, 8);
  });

  it("treats one win + one loss the same as two ties", () => {
    const split = fitBradleyTerry(["a", "b", "c"], [
      { a: "a", b: "b", result: "a" },
      { a: "a", b: "b", result: "b" },
      { a: "a", b: "c", result: "a" },
    ]);
    const tied = fitBradleyTerry(["a", "b", "c"], [
      { a: "a", b: "b", result: "tie" },
      { a: "a", b: "b", result: "tie" },
      { a: "a", b: "c", result: "a" },
    ]);
    expect(byId(split).a!.strength).toBeCloseTo(byId(tied).a!.strength, 8);
    expect(byId(split).b!.strength).toBeCloseTo(byId(tied).b!.strength, 8);
  });

  it("keeps undefeated and winless candidates finite thanks to the prior", () => {
    const outcomes: Outcome[] = [
      { a: "champ", b: "mid", result: "a" },
      { a: "champ", b: "last", result: "a" },
      { a: "mid", b: "last", result: "a" },
    ];
    const fit = fitBradleyTerry(["champ", "mid", "last"], outcomes);
    for (const s of fit.strengths) {
      expect(Number.isFinite(s.strength)).toBe(true);
      expect(Number.isFinite(s.logStrength)).toBe(true);
      expect(s.strength).toBeGreaterThan(0);
    }
    expect(fit.converged).toBe(true);
    expect(fit.strengths.map((s) => s.id)).toEqual(["champ", "mid", "last"]);

    // a bigger prior pulls everyone closer together
    const strongPrior = fitBradleyTerry(["champ", "mid", "last"], outcomes, { prior: 5 });
    expect(byId(strongPrior).champ!.strength).toBeLessThan(byId(fit).champ!.strength);
  });

  it("places candidates from disconnected groups on one finite scale", () => {
    const fit = fitBradleyTerry(["a", "b", "c", "d"], [
      { a: "a", b: "b", result: "a" },
      { a: "c", b: "d", result: "a" },
    ]);
    expect(fit.converged).toBe(true);
    const s = byId(fit);
    expect(s.a!.strength).toBeCloseTo(s.c!.strength, 8);
    expect(s.b!.strength).toBeCloseTo(s.d!.strength, 8);
  });

  it("gives everyone strength 1 with no outcomes, and handles 0 or 1 candidates", () => {
    const none = fitBradleyTerry(["a", "b"], []);
    for (const s of none.strengths) expect(s.strength).toBeCloseTo(1, 10);

    expect(fitBradleyTerry([], [])).toEqual({ strengths: [], iterations: 0, converged: true });
    const one = fitBradleyTerry(["solo"], []);
    expect(one.strengths).toEqual([{ id: "solo", strength: 1, logStrength: 0, wins: 0, losses: 0, ties: 0 }]);
    expect(one.converged).toBe(true);
  });

  it("ignores outcomes about unknown ids or self-comparisons, and duplicate ids", () => {
    const fit = fitBradleyTerry(["a", "b", "a"], [
      { a: "a", b: "zzz", result: "a" },
      { a: "a", b: "a", result: "a" },
      { a: "a", b: "b", result: "a" },
    ]);
    expect(fit.strengths).toHaveLength(2);
    expect(byId(fit).a).toMatchObject({ wins: 1, losses: 0, ties: 0 });
  });

  it("reports converged: false when it runs out of iterations", () => {
    const outcomes = simulate({ a: 4, b: 2, c: 1 }, 5, 7);
    const capped = fitBradleyTerry(["a", "b", "c"], outcomes, { maxIterations: 1, tolerance: 1e-15 });
    expect(capped.converged).toBe(false);
    expect(capped.iterations).toBe(1);

    const full = fitBradleyTerry(["a", "b", "c"], outcomes);
    expect(full.converged).toBe(true);
    expect(full.iterations).toBeGreaterThan(1);
    expect(full.iterations).toBeLessThan(1000);
  });

  it("is deterministic and doesn't depend on the order of outcomes", () => {
    const outcomes = simulate({ a: 3, b: 1, c: 0.5, d: 2 }, 3, 99);
    const forward = fitBradleyTerry(["a", "b", "c", "d"], outcomes);
    const backward = fitBradleyTerry(["a", "b", "c", "d"], [...outcomes].reverse());
    expect(backward.strengths.map((s) => s.id)).toEqual(forward.strengths.map((s) => s.id));
    forward.strengths.forEach((s, i) => expect(backward.strengths[i]!.strength).toBeCloseTo(s.strength, 8));
  });
});

describe("winProbability", () => {
  it("is s_i / (s_i + s_j)", () => {
    expect(winProbability(1, 1)).toBe(0.5);
    expect(winProbability(3, 1)).toBe(0.75);
    expect(winProbability(1, 3)).toBe(0.25);
    expect(winProbability(2, 5) + winProbability(5, 2)).toBeCloseTo(1, 12);
  });

  it("matches the fitted model: a 2:1 record with no prior gives a 2:1 strength ratio", () => {
    const fit = fitBradleyTerry(["a", "b"], [
      { a: "a", b: "b", result: "a" },
      { a: "a", b: "b", result: "a" },
      { a: "a", b: "b", result: "b" },
    ], { prior: 0 });
    const s = byId(fit);
    expect(winProbability(s.a!.strength, s.b!.strength)).toBeCloseTo(2 / 3, 6);
  });
});

describe("kendallTau", () => {
  it("is 1 for the same order and -1 for the reverse", () => {
    expect(kendallTau(["a", "b", "c", "d"], ["a", "b", "c", "d"])).toBe(1);
    expect(kendallTau(["a", "b", "c", "d"], ["d", "c", "b", "a"])).toBe(-1);
  });

  it("counts concordant minus discordant pairs", () => {
    // one swap of neighbours among 4 items: 5 concordant, 1 discordant -> 4/6
    expect(kendallTau(["a", "b", "c", "d"], ["a", "c", "b", "d"])).toBeCloseTo(4 / 6, 12);
    // 3 items, first moved to last: pairs (a,b) D, (a,c) D, (b,c) C -> -1/3
    expect(kendallTau(["a", "b", "c"], ["b", "c", "a"])).toBeCloseTo(-1 / 3, 12);
  });

  it("only uses ids both rankings share", () => {
    expect(kendallTau(["a", "x", "b", "c"], ["a", "b", "y", "c"])).toBe(1);
    expect(kendallTau(["a", "b"], ["c", "d"])).toBe(0);
    expect(kendallTau(["a"], ["a"])).toBe(0);
  });
});
