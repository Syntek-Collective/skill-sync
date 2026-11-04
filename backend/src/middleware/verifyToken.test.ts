// Tests for the shared token check and the authMiddleware that uses it (same responses as before).

import { Request, Response } from "express";

const mockGetUser = jest.fn();
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

process.env.SUPABASE_URL = "fake-url";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";

import { verifyAccessToken } from "./verifyToken";
import { authMiddleware } from "./authMiddleware";

function setup(authorization?: string) {
  const req = { headers: authorization === undefined ? {} : { authorization } } as unknown as Request;
  const res = {
    locals: {} as Record<string, unknown>,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn();
  return { req, res, next };
}

beforeEach(() => jest.clearAllMocks());

describe("verifyAccessToken", () => {
  it("returns the user for a valid token", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    expect(await verifyAccessToken("tok")).toEqual({ id: "user-1" });
    expect(mockGetUser).toHaveBeenCalledWith("tok");
  });

  it("returns null for a rejected or empty token", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    expect(await verifyAccessToken("bad")).toBeNull();
    expect(await verifyAccessToken("")).toBeNull();
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });
});

describe("authMiddleware", () => {
  it.each([
    [undefined, "Missing authentication header"],
    ["Basic abc", "Invalid authorization header"],
    ["Bearer   ", "Missing authentication token"],
  ])("401s for header %p", async (header, error) => {
    const { req, res, next } = setup(header);
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error });
    expect(next).not.toHaveBeenCalled();
  });

  it("401s when Supabase rejects the token", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    const { req, res, next } = setup("Bearer tok");
    await authMiddleware(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("sets res.locals.user and calls next for a valid token", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const { req, res, next } = setup("Bearer tok");
    await authMiddleware(req, res, next);
    expect(res.locals.user).toEqual({ id: "user-1" });
    expect(next).toHaveBeenCalled();
  });
});
