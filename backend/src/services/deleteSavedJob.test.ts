// deleteSavedJob also removes the job's pairwise ranking runs (docs/PRIVACY.md, "Saved jobs and
// deletion"), before the job posting row itself. Supabase is faked with a chainable builder.

type Op = [string, ...unknown[]];
type FakeQuery = { table: string; ops: Op[] };

const mockQueries: FakeQuery[] = [];
const mockResults: unknown[] = [];
const mockCalls: string[] = [];

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
    from: (table: string) => {
      const query: FakeQuery & Record<string, unknown> = { table, ops: [] };
      for (const method of ["select", "delete", "eq", "neq", "in", "maybeSingle"]) {
        query[method] = (...args: unknown[]) => {
          query.ops.push([method, ...args]);
          return query;
        };
      }
      query.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        mockQueries.push(query);
        mockCalls.push(`${table}:${query.ops.some((op) => op[0] === "delete") ? "delete" : "select"}`);
        return Promise.resolve(mockResults.shift() ?? { data: null, error: null }).then(resolve, reject);
      };
      return query;
    },
  })),
}));

jest.mock("./rankingStore", () => ({
  deleteRunsForJob: jest.fn(async () => {
    mockCalls.push("ranking_runs:delete");
  }),
}));

process.env.SUPABASE_URL = "fake-url";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";

import { deleteSavedJob } from "./supabaseService";
import { deleteRunsForJob } from "./rankingStore";

const mockDeleteRuns = deleteRunsForJob as jest.Mock;

beforeEach(() => {
  mockQueries.length = 0;
  mockResults.length = 0;
  mockCalls.length = 0;
  jest.clearAllMocks();
});

describe("deleteSavedJob: ranking runs", () => {
  it("deletes the job's ranking runs before the job posting", async () => {
    mockResults.push({ data: { id: "job-1", file_path: null }, error: null }); // the job
    mockResults.push({ data: [], error: null }); // its analyses

    expect(await deleteSavedJob("job-1", "user-1")).toBe(true);
    expect(mockDeleteRuns).toHaveBeenCalledWith("job-1", "user-1");
    expect(mockCalls.indexOf("ranking_runs:delete")).toBeLessThan(mockCalls.indexOf("job_postings:delete"));
    expect(mockCalls.at(-1)).toBe("job_postings:delete");
  });

  it("touches no ranking data when the job isn't the user's", async () => {
    mockResults.push({ data: null, error: null });

    expect(await deleteSavedJob("job-1", "user-2")).toBe(false);
    expect(mockDeleteRuns).not.toHaveBeenCalled();
  });
});
