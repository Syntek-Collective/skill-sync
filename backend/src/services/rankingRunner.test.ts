// Tests for the ranking runner: event order (store first, then publish), concurrency 3,
// resuming a run that already has comparisons, failures, and the privacy guarantees (no resume
// text in events or logs; private texts dropped when the run ends). Every dependency is mocked:
// the store is an in-memory fake, and the BT/schedule/judge modules are stand-ins.

import { APIError } from "openai";

jest.mock("./rankingStore", () => ({
  appendEvent: jest.fn(),
  listEventsAfter: jest.fn(),
  updateRun: jest.fn(),
}));
jest.mock("./pairSchedule", () => ({ buildSchedule: jest.fn() }));
jest.mock("./bradleyTerry", () => ({ fitBradleyTerry: jest.fn() }));
jest.mock("./pairwiseJudge", () => ({ judgePair: jest.fn() }));
jest.mock("./supabaseService", () => ({ getResumeForUser: jest.fn(), fetchResumeFile: jest.fn() }));
jest.mock("./pdfService", () => ({ textFromPdf: jest.fn() }));
jest.mock("../realtime/eventBus", () => ({ publish: jest.fn() }));

import { executeRun, hasPrivateTexts, isRunActive } from "./rankingRunner";
import { appendEvent, listEventsAfter, updateRun, type RankingRunRow, type StoredEvent } from "./rankingStore";
import { buildSchedule } from "./pairSchedule";
import { fitBradleyTerry } from "./bradleyTerry";
import { judgePair } from "./pairwiseJudge";
import { fetchResumeFile, getResumeForUser } from "./supabaseService";
import { textFromPdf } from "./pdfService";
import { publish } from "../realtime/eventBus";

const mockAppend = appendEvent as jest.Mock;
const mockList = listEventsAfter as jest.Mock;
const mockUpdate = updateRun as jest.Mock;
const mockSchedule = buildSchedule as jest.Mock;
const mockFit = fitBradleyTerry as jest.Mock;
const mockJudge = judgePair as jest.Mock;
const mockGetResume = getResumeForUser as jest.Mock;
const mockFetchFile = fetchResumeFile as jest.Mock;
const mockTextFromPdf = textFromPdf as jest.Mock;
const mockPublish = publish as jest.Mock;

const SECRET = "Jane Secret, 10 years of Python";
const requirements = [{ id: "r1", requirement: "Python", importance: "required" as const }];

let stored: StoredEvent[];
let logged: string[];

function makeRun(overrides: Partial<RankingRunRow> = {}): RankingRunRow {
  return {
    id: "run-1",
    user_id: "user-1",
    job_posting_id: null,
    mode: "private",
    status: "queued",
    candidate_ids: ["c1", "c2", "c3"],
    resume_ids: null,
    rounds: 1,
    total_tasks: 3,
    completed_tasks: 0,
    requirements,
    result: null,
    error: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function schedule(ids: string[]) {
  const tasks: { seq: number; a: string; b: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) tasks.push({ seq: tasks.length, a: ids[i]!, b: ids[j]! });
  }
  return tasks;
}

function privateTexts() {
  return new Map([
    ["c1", `${SECRET} one`],
    ["c2", `${SECRET} two`],
    ["c3", `${SECRET} three`],
    ["c4", `${SECRET} four`],
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  stored = [];
  logged = [];
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });

  mockAppend.mockImplementation(async (runId: string, type: string, payload: Record<string, unknown>) => {
    const event = { runId, seq: stored.length + 1, type, payload } as StoredEvent;
    stored.push(event);
    return event;
  });
  mockList.mockImplementation(async (_runId: string, _userId: string, lastSeq: number) =>
    stored.filter((event) => event.seq > lastSeq),
  );
  mockUpdate.mockResolvedValue(undefined);
  mockSchedule.mockImplementation((ids: string[]) => schedule(ids));
  mockFit.mockImplementation((ids: string[], outcomes: unknown[]) => ({
    strengths: ids.map((id) => ({ id, strength: 1, logStrength: 0, wins: 0, losses: 0, ties: 0 })),
    iterations: outcomes.length,
    converged: true,
  }));
  mockJudge.mockResolvedValue({ winner: "A", reason: "More Python evidence.", decidingRequirementIds: ["r1"] });
});

describe("executeRun (private)", () => {
  it("emits run_started, comparison+standings per task, then completed, storing before publishing", async () => {
    // publishing must only ever happen for an event that's already stored (same seq and type;
    // a private comparison's live payload additionally carries the reason)
    mockPublish.mockImplementation((event: StoredEvent) => {
      const twin = stored.find((s) => s.seq === event.seq);
      expect(twin).toBeDefined();
      expect(twin!.type).toBe(event.type);
      expect(event.payload).toEqual(event.type === "comparison" ? { ...twin!.payload, reason: event.payload.reason } : twin!.payload);
    });

    await executeRun(makeRun(), "sk-test", privateTexts());

    expect(stored.map((event) => event.type)).toEqual([
      "run_started",
      "comparison",
      "standings",
      "comparison",
      "standings",
      "comparison",
      "standings",
      "completed",
    ]);
    expect(stored.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(mockPublish.mock.calls.map(([event]) => event.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const comparison = stored[1]!;
    expect(comparison.payload).toEqual({
      task: { seq: expect.any(Number), a: expect.any(String), b: expect.any(String) },
      winner: "a",
      reason: null,
      decidingRequirementIds: ["r1"],
      completedTasks: 1,
      totalTasks: 3,
    });
    expect(stored[7]!.payload).toEqual({ result: { strengths: expect.any(Array), iterations: 3, converged: true } });

    // BT refit after every comparison (3) + the final fit
    expect(mockFit).toHaveBeenCalledTimes(4);
    expect(mockUpdate).toHaveBeenCalledWith("run-1", "user-1", expect.objectContaining({ status: "running" }));
    expect(mockUpdate).toHaveBeenLastCalledWith(
      "run-1",
      "user-1",
      expect.objectContaining({ status: "completed", completedTasks: 3, result: expect.any(Object) }),
    );
  });

  it("publishes the reason live but never stores it (it can paraphrase the resume)", async () => {
    mockJudge.mockResolvedValue({ winner: "A", reason: "Jane led the Python migration.", decidingRequirementIds: ["r1"] });

    await executeRun(makeRun(), "sk-test", privateTexts());

    const storedComparisons = stored.filter((event) => event.type === "comparison");
    expect(storedComparisons).toHaveLength(3);
    for (const event of storedComparisons) {
      expect(event.payload.reason).toBeNull();
      expect(event.payload.winner).toBe("a");
      expect(event.payload.decidingRequirementIds).toEqual(["r1"]);
    }
    expect(JSON.stringify(stored)).not.toContain("Jane led");

    const published = mockPublish.mock.calls.map(([event]) => event as StoredEvent);
    const liveComparisons = published.filter((event) => event.type === "comparison");
    expect(liveComparisons.map((event) => event.seq)).toEqual(storedComparisons.map((event) => event.seq));
    for (const event of liveComparisons) expect(event.payload.reason).toBe("Jane led the Python migration.");
  });

  it("judges with the redacted texts but never puts resume text in events", async () => {
    await executeRun(makeRun(), "sk-test", privateTexts());

    expect(mockJudge).toHaveBeenCalledWith("sk-test", requirements, `${SECRET} one`, `${SECRET} two`);
    expect(JSON.stringify(stored)).not.toContain("Jane Secret");
  });

  it("drops the private texts when the run ends", async () => {
    const texts = privateTexts();
    await executeRun(makeRun(), "sk-test", texts);

    expect(texts.size).toBe(0);
    expect(hasPrivateTexts("run-1")).toBe(false);
    expect(isRunActive("run-1")).toBe(false);
  });

  it("maps winner B and tie", async () => {
    mockJudge
      .mockResolvedValueOnce({ winner: "B", reason: "r", decidingRequirementIds: [] })
      .mockResolvedValueOnce({ winner: "tie", reason: "r", decidingRequirementIds: [] })
      .mockResolvedValueOnce({ winner: "A", reason: "r", decidingRequirementIds: [] });

    await executeRun(makeRun(), "sk-test", privateTexts());

    const winners = stored.filter((event) => event.type === "comparison").map((event) => event.payload.winner);
    expect(winners.sort()).toEqual(["a", "b", "tie"]);
  });

  it("judges at most 3 pairs at a time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockJudge.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return { winner: "A", reason: "r", decidingRequirementIds: [] };
    });

    // 4 candidates -> 6 pairs
    await executeRun(makeRun({ candidate_ids: ["c1", "c2", "c3", "c4"], total_tasks: 6 }), "sk-test", privateTexts());

    expect(mockJudge).toHaveBeenCalledTimes(6);
    expect(maxInFlight).toBe(3);
    expect(stored.filter((event) => event.type === "comparison").map((event) => event.payload.completedTasks)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("fails with a safe message on an OpenAI error, logging only the status", async () => {
    mockJudge.mockRejectedValue(new APIError(401, {}, `Incorrect API key sk-te****test ${SECRET}`, new Headers()));
    const texts = privateTexts();

    await executeRun(makeRun(), "sk-test", texts);

    const failed = stored.find((event) => event.type === "failed");
    expect(failed?.payload).toEqual({ error: "OpenAI rejected your API key. Check it and try again." });
    expect(stored.some((event) => event.type === "completed")).toBe(false);
    expect(mockUpdate).toHaveBeenLastCalledWith("run-1", "user-1", {
      status: "failed",
      error: "OpenAI rejected your API key. Check it and try again.",
    });
    expect(logged.join("\n")).toContain("401");
    expect(logged.join("\n")).not.toContain("sk-te");
    expect(logged.join("\n")).not.toContain("Jane Secret");
    expect(texts.size).toBe(0);
  });

  it("never echoes a non-OpenAI error's message (it could hold model output)", async () => {
    mockJudge.mockRejectedValue(new SyntaxError(`Unexpected token in ${SECRET}`));

    await executeRun(makeRun(), "sk-test", privateTexts());

    expect(stored.find((event) => event.type === "failed")?.payload).toEqual({
      error: "The ranking failed. Please try again.",
    });
    expect(logged.join("\n")).not.toContain("Jane Secret");
  });

  it("fails when a private run has no texts in memory (e.g. after a restart)", async () => {
    await executeRun(makeRun(), "sk-test");

    expect(mockJudge).not.toHaveBeenCalled();
    expect(stored.map((event) => event.type)).toEqual(["failed"]);
    expect(String(stored[0]!.payload.error)).toMatch(/Run it again/);
  });
});

describe("executeRun (resume)", () => {
  it("skips tasks that already have comparison events and doesn't repeat run_started", async () => {
    const tasks = schedule(["c1", "c2", "c3"]);
    stored = [
      { runId: "run-1", seq: 1, type: "run_started", payload: { totalTasks: 3 } },
      {
        runId: "run-1",
        seq: 2,
        type: "comparison",
        payload: { task: tasks[0], winner: "b", reason: "r", decidingRequirementIds: [], completedTasks: 1, totalTasks: 3 },
      },
      { runId: "run-1", seq: 3, type: "standings", payload: { strengths: [] } },
    ];

    await executeRun(makeRun({ status: "running", completed_tasks: 1 }), "sk-test", privateTexts());

    expect(mockJudge).toHaveBeenCalledTimes(2);
    expect(stored.filter((event) => event.type === "run_started")).toHaveLength(1);
    // the resume is announced once, before any new comparison
    const resumed = stored.filter((event) => event.type === "run_resumed");
    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toMatchObject({ seq: 4, payload: { completedTasks: 1, totalTasks: 3 } });
    const newComparisons = stored.filter((event) => event.type === "comparison" && event.seq > 3);
    expect(newComparisons.map((event) => event.payload.completedTasks)).toEqual([2, 3]);
    // the old outcome is part of the fit
    const finalOutcomes = mockFit.mock.calls.at(-1)?.[1] as { a: string; b: string; result: string }[];
    expect(finalOutcomes).toHaveLength(3);
    expect(finalOutcomes[0]).toEqual({ a: tasks[0]!.a, b: tasks[0]!.b, result: "b" });
    expect(stored.at(-1)?.type).toBe("completed");
  });

  it("does nothing for a run that already completed", async () => {
    stored = [{ runId: "run-1", seq: 1, type: "completed", payload: { result: {} } }];

    await executeRun(makeRun(), "sk-test", privateTexts());

    expect(mockJudge).not.toHaveBeenCalled();
    expect(stored).toHaveLength(1);
  });
});

describe("executeRun (saved)", () => {
  const savedRun = () =>
    makeRun({ mode: "saved", candidate_ids: ["c1", "c2"], resume_ids: ["res-1", "res-2"], total_tasks: 1 });

  it("reads the user's own stored resumes and redacts them", async () => {
    mockGetResume.mockImplementation(async (id: string) => ({ id, file_path: `user-1/${id}.pdf` }));
    mockFetchFile.mockResolvedValue(Buffer.from("%PDF-"));
    mockTextFromPdf.mockResolvedValue("Python dev, email jo@example.com");

    await executeRun(savedRun(), "sk-test");

    expect(mockGetResume).toHaveBeenCalledWith("res-1", "user-1");
    expect(mockGetResume).toHaveBeenCalledWith("res-2", "user-1");
    expect(mockJudge).toHaveBeenCalledWith("sk-test", requirements, "Python dev, email [email]", "Python dev, email [email]");
    expect(stored.at(-1)?.type).toBe("completed");
  });

  it("stores the reason for saved runs, capped at 500 characters", async () => {
    mockGetResume.mockImplementation(async (id: string) => ({ id, file_path: `user-1/${id}.pdf` }));
    mockFetchFile.mockResolvedValue(Buffer.from("%PDF-"));
    mockTextFromPdf.mockResolvedValue("Python dev");
    mockJudge.mockResolvedValue({ winner: "B", reason: "x".repeat(800), decidingRequirementIds: [] });

    await executeRun(savedRun(), "sk-test");

    const comparison = stored.find((event) => event.type === "comparison");
    expect(comparison?.payload.reason).toBe("x".repeat(500));
    const published = mockPublish.mock.calls.map(([event]) => event as StoredEvent).find((e) => e.type === "comparison");
    expect(published).toEqual(comparison);
  });

  it("fails if a resume is gone or no longer the user's", async () => {
    mockGetResume.mockResolvedValue(null);

    await executeRun(savedRun(), "sk-test");

    expect(mockJudge).not.toHaveBeenCalled();
    expect(stored.at(-1)?.payload).toEqual({ error: "A resume in this run is no longer available." });
  });
});
