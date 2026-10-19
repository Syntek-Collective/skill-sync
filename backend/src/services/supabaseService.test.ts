// Fake Supabase functions we control in the tests.
const mockDownload = jest.fn();
const mockInsert = jest.fn();
const mockSingle = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();

// Replace the real Supabase client with a fake one.
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        download: mockDownload,
      })),
    },

    from: jest.fn(() => ({
      insert: mockInsert,
      select: mockSelect,
    })),
  })),
}));

// Fake env vars so supabaseService.ts can load.
process.env.SUPABASE_URL = "fake-url";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";

// Import the real functions we are testing.
import {
  fetchResumeFile,
  saveJobPosting,
  saveAnalysis,
  getAnalysesForUser,
} from "./supabaseService";

describe("fetchResumeFile", () => {
  it("downloads a resume file and returns it as a Buffer", async () => {
    const fakeFile = new Uint8Array([1, 2, 3]).buffer;

    mockDownload.mockResolvedValue({
      data: {
        arrayBuffer: async () => fakeFile,
      },
      error: null,
    });

    const result = await fetchResumeFile("my-resume.pdf");

    expect(Buffer.isBuffer(result)).toBe(true);
  });
});

describe("saveJobPosting", () => {
  it("saves a job posting and returns the saved row", async () => {
    const fakeSavedJobPosting = {
      id: "job-123",
      extracted_text: "We need a React developer",
    };

    mockInsert.mockReturnValue({
      select: () => ({
        single: mockSingle,
      }),
    });

    mockSingle.mockResolvedValue({
      data: fakeSavedJobPosting,
      error: null,
    });

    const result = await saveJobPosting({
      userId: "user-123",
      jobTitle: "Frontend Developer",
      companyName: "Acme",
      fileName: "job-posting.txt",
      filePath: "jobs/job-posting.txt",
      extractedText: "We need a React developer",
    });

    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "user-123",
      job_title: "Frontend Developer",
      company_name: "Acme",
      file_name: "job-posting.txt",
      file_path: "jobs/job-posting.txt",
      extracted_text: "We need a React developer",
    });

    expect(result).toBe(fakeSavedJobPosting);
  });
});

describe("saveAnalysis", () => {
  it("saves an analysis and returns the saved row", async () => {
    const fakeSavedAnalysis = {
      id: "analysis-123",
      result: '{"matchScore":70,"fitLevel":"Good Fit with Gaps"}',
    };

    mockInsert.mockReturnValue({
      select: () => ({
        single: mockSingle,
      }),
    });

    mockSingle.mockResolvedValue({
      data: fakeSavedAnalysis,
      error: null,
    });

    // the whole analysis is now ONE field (result) instead of separate columns
    const fakeResult = JSON.stringify({
      matchScore: 70,
      fitLevel: "Good Fit with Gaps",
      fitMessage: "Strong candidate with a few gaps.",
      matchedSkills: ["React", "TypeScript"],
      missingSkills: [{ skill: "Testing", importance: "critical" }],
      suggestions: ["Practice writing tests"],
      timeToReady: "1-2 months",
    });

    const result = await saveAnalysis({
      userId: "user-123",
      resumeId: "resume-123",
      jobPostingId: "job-123",
      result: fakeResult,
    });

    expect(mockInsert).toHaveBeenCalledWith({
      user_id: "user-123",
      resume_id: "resume-123",
      job_posting_id: "job-123",
      result: fakeResult,
    });

    expect(result).toBe(fakeSavedAnalysis);
  });
});

describe("getAnalysesforUser", () => {
  it("fetches saved analyses for one user", async () => {
    const fakeAnalyses = [
      {
        id: "analysis-123",
        user_id: "user-123",
        result: '{"matchScore":70,"fitLevel":"Good Fit with Gaps"}',
      },
    ];

    // Fake the Supabase chain:
    // select().eq().order()
    mockSelect.mockReturnValue({
      eq: mockEq,
    });

    mockEq.mockReturnValue({
      order: mockOrder,
    });

    mockOrder.mockResolvedValue({
      data: fakeAnalyses,
      error: null,
    });

    const result = await getAnalysesForUser("user-123");

    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockEq).toHaveBeenCalledWith("user_id", "user-123");
    expect(mockOrder).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });

    expect(result).toBe(fakeAnalyses);
  });
});
// ===== getResumeForUser: the stored file path must be inside the user's own folder =====
import { getResumeForUser } from "./supabaseService";

describe("getResumeForUser", () => {
  // fakes .select().eq().eq().maybeSingle() returning one resume row
  function mockResumeRow(row: { id: string; file_path: string } | null) {
    mockSelect.mockReturnValue({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    });
  }

  it("returns the row when its file is in the user's folder", async () => {
    mockResumeRow({ id: "r1", file_path: "user-1/123-0.pdf" });

    await expect(getResumeForUser("r1", "user-1")).resolves.toEqual({
      id: "r1",
      file_path: "user-1/123-0.pdf",
    });
  });

  it("refuses a row whose file path points into another user's folder", async () => {
    mockResumeRow({ id: "r1", file_path: "user-2/their-resume.pdf" });

    await expect(getResumeForUser("r1", "user-1")).resolves.toBeNull();
  });
});
