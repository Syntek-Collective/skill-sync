/*

    What is this file for?
    Tests for the historyController - checks that fetching past analyses works.

    What does it test?
    That the controller pulls the right user's history and responds with the
    list in the right shape.

    What to verify:
    - it fetches the correct user's past analyses
    - it responds with the list in the shape the frontend's HistoryModal expects
    - it handles no history / a fetch failure

    (see controllers/README for how controllers work in general)

*/

/*

    TODO
    write the tests once historyController is built.

    Coordinate with the team on:
    - test framework (Jest or Vitest?)
    - how to MOCK the database
    - the history item shape (must match the frontend's HistoryModal: id, jobListing,
      result, createdAt - and we decided id & createdAt are STRINGS)

*/

// ===== deleteJobController (DELETE /api/history/:jobPostingId) =====
// The supabase service is mocked, so these tests check the controller's checks and responses only.

import { Request, Response } from "express";

jest.mock("../services/supabaseService", () => ({
  deleteSavedJob: jest.fn(),
  getAnalysesForUser: jest.fn(),
}));

import { deleteJobController } from "./historyController";
import { deleteSavedJob } from "../services/supabaseService";

const mockDeleteSavedJob = deleteSavedJob as jest.Mock;

// fake request/response, with the signed-in user set the way authMiddleware does
function setup(jobPostingId: string) {
  const req = { params: { jobPostingId } } as unknown as Request;
  const res = {
    locals: { user: { id: "user-1" } },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteJobController", () => {
  it("deletes the signed-in user's job and returns 204", async () => {
    mockDeleteSavedJob.mockResolvedValue(true);
    const { req, res } = setup("job-1");

    await deleteJobController(req, res);

    // the user id comes from the verified token, so nobody can delete another user's job
    expect(mockDeleteSavedJob).toHaveBeenCalledWith("job-1", "user-1");
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("returns 404 when the job doesn't exist or isn't theirs", async () => {
    mockDeleteSavedJob.mockResolvedValue(false);
    const { req, res } = setup("someone-elses-job");

    await deleteJobController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 500 when the delete fails", async () => {
    mockDeleteSavedJob.mockRejectedValue(new Error("db down"));
    const { req, res } = setup("job-1");

    await deleteJobController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
