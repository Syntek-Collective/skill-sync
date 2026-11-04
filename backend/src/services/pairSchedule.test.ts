/*

    Tests for pairSchedule - which pairs get compared, in what order, who is shown first.

*/

import { buildSchedule, hashSeed, mulberry32, shuffle } from "./pairSchedule";

const ids = ["c1", "c2", "c3", "c4", "c5"];
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

describe("buildSchedule", () => {
  it("has every unordered pair exactly once per round", () => {
    const schedule = buildSchedule(ids, 1, "seed");
    expect(schedule).toHaveLength(10); // 5 choose 2

    const keys = schedule.map((task) => pairKey(task.a, task.b));
    expect(new Set(keys).size).toBe(10);
    for (const task of schedule) expect(task.a).not.toBe(task.b);
  });

  it("numbers tasks 0, 1, 2, ... in order", () => {
    const schedule = buildSchedule(ids, 2, "seed");
    expect(schedule.map((task) => task.seq)).toEqual(schedule.map((_task, i) => i));
  });

  it("shows each pair in both orders across 2 rounds (cancels position bias)", () => {
    const schedule = buildSchedule(ids, 2, "seed");
    expect(schedule).toHaveLength(20);

    const round1 = schedule.slice(0, 10).map((task) => `${task.a}>${task.b}`);
    const round2 = schedule.slice(10).map((task) => `${task.b}>${task.a}`);
    // round 2 is exactly round 1 with every pair flipped (in a different order)
    expect([...round2].sort()).toEqual([...round1].sort());
  });

  it("alternates order across further rounds", () => {
    const schedule = buildSchedule(["a", "b", "c"], 4, "x");
    const firstShown = (round: number) =>
      new Map(schedule.slice(round * 3, round * 3 + 3).map((task) => [pairKey(task.a, task.b), task.a]));
    for (const key of firstShown(0).keys()) {
      expect(firstShown(2).get(key)).toBe(firstShown(0).get(key));
      expect(firstShown(3).get(key)).toBe(firstShown(1).get(key));
      expect(firstShown(1).get(key)).not.toBe(firstShown(0).get(key));
    }
  });

  it("is deterministic for a seed, and differs between seeds", () => {
    expect(buildSchedule(ids, 2, "run-1")).toEqual(buildSchedule(ids, 2, "run-1"));
    expect(buildSchedule(ids, 2, "run-1")).not.toEqual(buildSchedule(ids, 2, "run-2"));
  });

  it("doesn't always show the earlier-listed candidate first", () => {
    const schedule = buildSchedule(["a", "b", "c", "d", "e", "f"], 1, "balance");
    const earlierFirst = schedule.filter((task) => task.a < task.b).length;
    expect(earlierFirst).toBeGreaterThan(0);
    expect(earlierFirst).toBeLessThan(schedule.length);
  });

  it("returns nothing for fewer than 2 candidates or 0 rounds, and ignores duplicate ids", () => {
    expect(buildSchedule([], 2, "s")).toEqual([]);
    expect(buildSchedule(["only"], 2, "s")).toEqual([]);
    expect(buildSchedule(ids, 0, "s")).toEqual([]);
    expect(buildSchedule(["a", "b", "a"], 1, "s")).toHaveLength(1);
  });
});

describe("seeded randomness", () => {
  it("mulberry32 is repeatable and stays in [0, 1)", () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const value = first();
      expect(value).toBe(second());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("hashSeed is stable and spreads different strings", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
    expect(Number.isInteger(hashSeed(""))).toBe(true);
  });

  it("shuffle keeps every item and leaves the input alone", () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const shuffled = shuffle(items, mulberry32(1));
    expect([...shuffled].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
