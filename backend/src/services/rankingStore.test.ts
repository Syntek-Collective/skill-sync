// Tests for the ranking store: every user-facing read is filtered by user id, event seqs are
// assigned max+1 with a retry when another writer took the number, and private runs (only)
// are marked interrupted on boot. Supabase is faked with a chainable query builder.

type Op = [string, ...unknown[]];
type FakeQuery = { table: string; ops: Op[] };

const mockQueries: FakeQuery[] = [];
const mockResults: unknown[] = [];

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: (table: string) => {
      const query: FakeQuery & Record<string, unknown> = { table, ops: [] };
      for (const method of ["select", "insert", "update", "delete", "eq", "gt", "in", "order", "limit", "single", "maybeSingle"]) {
        query[method] = (...args: unknown[]) => {
          query.ops.push([method, ...args]);
          return query;
        };
      }
      // awaiting the builder runs the "query" and returns the next queued result
      query.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        mockQueries.push(query);
        return Promise.resolve(mockResults.shift()).then(resolve, reject);
      };
      return query;
    },
  })),
}));

process.env.SUPABASE_URL = "fake-url";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";

import {
  appendEvent,
  createRun,
  deleteRunForUser,
  deleteRunsForJob,
  getLastSeq,
  getRunForUser,
  listEventsAfter,
  markInterruptedRuns,
  markInterruptedRunsOnBoot,
  updateRun,
} from "./rankingStore";

const requirements = [{ id: "r1", requirement: "Python", importance: "required" as const }];

function ops(query: FakeQuery | undefined, name: string) {
  return (query?.ops ?? []).filter((op) => op[0] === name).map((op) => op.slice(1));
}

beforeEach(() => {
  mockQueries.length = 0;
  mockResults.length = 0;
});

describe("createRun", () => {
  it("stores a saved run with its resume ids, queued", async () => {
    mockResults.push({ data: { id: "run-1" }, error: null });

    const run = await createRun({
      userId: "user-1",
      mode: "saved",
      candidateIds: ["c1", "c2"],
      resumeIds: ["res-1", "res-2"],
      rounds: 2,
      totalTasks: 2,
      requirements,
    });

    expect(run.id).toBe("run-1");
    const [insert] = ops(mockQueries[0], "insert");
    expect(insert?.[0]).toMatchObject({
      user_id: "user-1",
      mode: "saved",
      status: "queued",
      candidate_ids: ["c1", "c2"],
      resume_ids: ["res-1", "res-2"],
      job_posting_id: null,
    });
  });

  it("never stores resume ids for a private run", async () => {
    mockResults.push({ data: { id: "run-2" }, error: null });

    await createRun({
      userId: "user-1",
      mode: "private",
      candidateIds: ["c1", "c2"],
      resumeIds: ["should-not-be-saved"],
      rounds: 1,
      totalTasks: 1,
      requirements,
    });

    expect(ops(mockQueries[0], "insert")[0]?.[0]).toMatchObject({ mode: "private", resume_ids: null });
  });

  it("throws when Supabase fails", async () => {
    mockResults.push({ data: null, error: { message: "boom" } });
    await expect(
      createRun({ userId: "u", mode: "private", candidateIds: [], rounds: 1, totalTasks: 0, requirements }),
    ).rejects.toThrow("Could not create ranking run");
  });
});

describe("getRunForUser", () => {
  it("filters by run id AND user id", async () => {
    mockResults.push({ data: { id: "run-1", user_id: "user-1" }, error: null });

    const run = await getRunForUser("run-1", "user-1");

    expect(run?.id).toBe("run-1");
    expect(mockQueries[0]?.table).toBe("ranking_runs");
    expect(ops(mockQueries[0], "eq")).toEqual([
      ["id", "run-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("returns null for another user's run or a non-uuid id", async () => {
    mockResults.push({ data: null, error: null });
    expect(await getRunForUser("run-1", "user-2")).toBeNull();

    mockResults.push({ data: null, error: { code: "22P02", message: "invalid input syntax for type uuid" } });
    expect(await getRunForUser("not-a-uuid", "user-1")).toBeNull();
  });
});

describe("updateRun", () => {
  it("maps the patch to columns and filters by owner", async () => {
    mockResults.push({ error: null });

    await updateRun("run-1", "user-1", { status: "completed", completedTasks: 3, result: { x: 1 }, error: null });

    expect(ops(mockQueries[0], "update")[0]?.[0]).toEqual({
      status: "completed",
      completed_tasks: 3,
      result: { x: 1 },
      error: null,
    });
    expect(ops(mockQueries[0], "eq")).toEqual([
      ["id", "run-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("does nothing for an empty patch", async () => {
    await updateRun("run-1", "user-1", {});
    expect(mockQueries).toHaveLength(0);
  });
});

describe("appendEvent", () => {
  it("assigns seq = current max + 1", async () => {
    mockResults.push({ data: { seq: 3 }, error: null }); // max seq
    mockResults.push({ data: { run_id: "run-1", seq: 4, type: "standings", payload: { strengths: [] } }, error: null });

    const event = await appendEvent("run-1", "standings", { strengths: [] });

    expect(event).toEqual({ runId: "run-1", seq: 4, type: "standings", payload: { strengths: [] } });
    expect(ops(mockQueries[1], "insert")[0]?.[0]).toEqual({
      run_id: "run-1",
      seq: 4,
      type: "standings",
      payload: { strengths: [] },
    });
  });

  it("starts at 1 and retries with the next seq when the primary key conflicts", async () => {
    mockResults.push({ data: null, error: null }); // no events yet
    mockResults.push({ data: null, error: { code: "23505", message: "duplicate key" } }); // seq 1 taken
    mockResults.push({ data: { seq: 1 }, error: null }); // re-read max
    mockResults.push({ data: { run_id: "run-1", seq: 2, type: "run_started", payload: {} }, error: null });

    const event = await appendEvent("run-1", "run_started", { totalTasks: 1 });

    expect(event.seq).toBe(2);
    expect(ops(mockQueries[1], "insert")[0]?.[0]).toMatchObject({ seq: 1 });
    expect(ops(mockQueries[3], "insert")[0]?.[0]).toMatchObject({ seq: 2 });
  });

  it("throws on other errors without retrying", async () => {
    mockResults.push({ data: { seq: 1 }, error: null });
    mockResults.push({ data: null, error: { code: "42501", message: "denied" } });

    await expect(appendEvent("run-1", "completed", {})).rejects.toThrow("Could not save ranking event");
    expect(mockQueries).toHaveLength(2);
  });
});

describe("getLastSeq", () => {
  it("returns 0 for a run with no events", async () => {
    mockResults.push({ data: null, error: null });
    expect(await getLastSeq("run-1")).toBe(0);
  });
});

describe("listEventsAfter", () => {
  it("returns null without reading events when the run isn't the user's", async () => {
    mockResults.push({ data: null, error: null });

    expect(await listEventsAfter("run-1", "user-2", 0)).toBeNull();
    expect(mockQueries).toHaveLength(1);
  });

  it("returns events after lastSeq in order", async () => {
    mockResults.push({ data: { id: "run-1", user_id: "user-1" }, error: null });
    mockResults.push({
      data: [
        { run_id: "run-1", seq: 3, type: "comparison", payload: { winner: "a" } },
        { run_id: "run-1", seq: 4, type: "standings", payload: { strengths: [] } },
      ],
      error: null,
    });

    const events = await listEventsAfter("run-1", "user-1", 2);

    expect(events?.map((event) => event.seq)).toEqual([3, 4]);
    expect(ops(mockQueries[1], "gt")).toEqual([["seq", 2]]);
    expect(ops(mockQueries[1], "order")).toEqual([["seq", { ascending: true }]]);
  });
});

describe("markInterruptedRuns", () => {
  it("marks only private queued/running runs as interrupted", async () => {
    mockResults.push({ data: [{ id: "a" }, { id: "b" }], error: null });

    expect(await markInterruptedRuns()).toBe(2);
    expect(ops(mockQueries[0], "update")[0]?.[0]).toMatchObject({ status: "interrupted" });
    expect(ops(mockQueries[0], "eq")).toEqual([["mode", "private"]]);
    expect(ops(mockQueries[0], "in")).toEqual([["status", ["queued", "running"]]]);
  });
});

describe("markInterruptedRunsOnBoot", () => {
  it("logs one line and resolves when the ranking tables don't exist yet", async () => {
    mockResults.push({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.ranking_runs' in the schema cache" } });
    const log = jest.fn();

    await expect(markInterruptedRunsOnBoot(log)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatch(/Ranking tables not found/);
  });

  it("also treats Postgres's 'relation does not exist' as missing tables", async () => {
    mockResults.push({ data: null, error: { code: "42P01", message: 'relation "public.ranking_runs" does not exist' } });
    const log = jest.fn();

    await markInterruptedRunsOnBoot(log);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/Ranking tables not found/));
  });

  it("logs other errors without rejecting, and the count when runs were marked", async () => {
    mockResults.push({ data: null, error: { code: "08006", message: "connection failure" } });
    const log = jest.fn();
    await expect(markInterruptedRunsOnBoot(log)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/Could not mark interrupted ranking runs/));

    mockResults.push({ data: [{ id: "a" }], error: null });
    log.mockClear();
    await markInterruptedRunsOnBoot(log);
    expect(log).toHaveBeenCalledWith("Marked 1 private ranking run(s) as interrupted");
  });
});

describe("deleteRunForUser", () => {
  it("returns false without deleting anything for another user's run", async () => {
    mockResults.push({ data: null, error: null });

    expect(await deleteRunForUser("run-1", "user-2")).toBe(false);
    expect(mockQueries).toHaveLength(1);
    expect(ops(mockQueries[0], "delete")).toEqual([]);
  });

  it("deletes the owner's events and run", async () => {
    mockResults.push({ data: { id: "run-1", user_id: "user-1" }, error: null });
    mockResults.push({ data: null, error: null });
    mockResults.push({ data: null, error: null });

    expect(await deleteRunForUser("run-1", "user-1")).toBe(true);
    expect(mockQueries[1]?.table).toBe("ranking_events");
    expect(ops(mockQueries[1], "eq")).toEqual([["run_id", "run-1"]]);
    expect(mockQueries[2]?.table).toBe("ranking_runs");
    expect(ops(mockQueries[2], "delete")).toHaveLength(1);
    expect(ops(mockQueries[2], "eq")).toEqual([["id", "run-1"], ["user_id", "user-1"]]);
  });
});

describe("deleteRunsForJob", () => {
  it("deletes the user's runs for that job", async () => {
    mockResults.push({ data: null, error: null });

    await deleteRunsForJob("job-1", "user-1");
    expect(mockQueries[0]?.table).toBe("ranking_runs");
    expect(ops(mockQueries[0], "delete")).toHaveLength(1);
    expect(ops(mockQueries[0], "eq")).toEqual([["job_posting_id", "job-1"], ["user_id", "user-1"]]);
  });

  it("is a no-op when the ranking tables don't exist, and throws on other errors", async () => {
    mockResults.push({ data: null, error: { code: "PGRST205", message: "Could not find the table" } });
    await expect(deleteRunsForJob("job-1", "user-1")).resolves.toBeUndefined();

    mockResults.push({ data: null, error: { code: "57014", message: "timeout" } });
    await expect(deleteRunsForJob("job-1", "user-1")).rejects.toThrow("Could not delete ranking runs");
  });
});
