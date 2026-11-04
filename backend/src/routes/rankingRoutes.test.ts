// Checks the ranking and bias-audit routers expose the documented routes, and that app.ts runs
// authMiddleware for them BEFORE the 41mb JSON parser (an unauthenticated request is rejected
// without its body being read or parsed).

import http from "http";
import type { AddressInfo } from "net";
import express from "express";

jest.mock("../middleware/verifyToken", () => ({ verifyAccessToken: jest.fn() }));
jest.mock("../controllers/rankingController", () => ({
  createRankingController: jest.fn(),
  getRankingController: jest.fn(),
  deleteRankingController: jest.fn(),
  resumeRankingController: jest.fn(),
}));
jest.mock("../controllers/biasAuditController", () => ({ __esModule: true, default: jest.fn() }));
// the other routers pull in Supabase-backed services; app.ts only needs them to exist
jest.mock("./historyRoutes", () => ({ __esModule: true, default: jest.requireActual("express").Router() }));
jest.mock("./analyzeRoutes", () => ({ __esModule: true, default: jest.requireActual("express").Router() }));

import rankingRouter from "./rankingRoutes";
import biasAuditRouter from "./biasAuditRoutes";
import app from "../app";
import { authMiddleware } from "../middleware/authMiddleware";
import { verifyAccessToken } from "../middleware/verifyToken";
import { createRankingController } from "../controllers/rankingController";
import biasAuditController from "../controllers/biasAuditController";

const mockVerify = verifyAccessToken as jest.Mock;
const mockCreate = createRankingController as jest.Mock;
const mockAudit = biasAuditController as unknown as jest.Mock;

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] } };

function routes(router: { stack: unknown[] }) {
  return (router.stack as Layer[])
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route!.path,
      methods: Object.keys(layer.route!.methods),
      handlers: layer.route!.stack.map((entry) => entry.handle),
    }));
}

describe("ranking routes", () => {
  it("defines POST /, GET /:runId, DELETE /:runId and POST /:runId/resume", () => {
    const list = routes(rankingRouter as unknown as { stack: unknown[] });
    expect(list.map(({ path, methods }) => `${methods.join(",")} ${path}`)).toEqual([
      "post /",
      "get /:runId",
      "delete /:runId",
      "post /:runId/resume",
    ]);
    // auth runs once, in app.ts, before the body parser
    for (const route of list) expect(route.handlers).not.toContain(authMiddleware);
  });

  it("defines POST / for the bias audit", () => {
    const list = routes(biasAuditRouter as unknown as { stack: unknown[] });
    expect(list).toEqual([{ path: "/", methods: ["post"], handlers: [biasAuditController] }]);
  });
});

describe("app: auth before the large body parser", () => {
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerify.mockImplementation(async (token: string) => (token === "good-token" ? { id: "user-1" } : null));
    const echo = (req: express.Request, res: express.Response) =>
      res.status(201).json({ user: res.locals.user?.id, body: req.body });
    mockCreate.mockImplementation(echo);
    mockAudit.mockImplementation(echo);
  });

  it.each(["/api/rankings", "/api/bias-audit"])(
    "%s rejects a request without a valid token before reading its body",
    async (path) => {
      // broken JSON: if the parser ran first this would be a 400, not a 401
      for (const headers of [{}, { Authorization: "Bearer bad-token" }]) {
        const response = await fetch(`${base}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: "{not json",
        });
        expect(response.status).toBe(401);
      }
      expect(mockCreate).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    },
  );

  it.each(["/api/rankings", "/api/bias-audit"])("%s parses the body for a logged-in user", async (path) => {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer good-token" },
      body: JSON.stringify({ hello: "x".repeat(200_000) }), // over the 100kb default limit
    });
    expect(response.status).toBe(201);
    const json = (await response.json()) as { user: string; body: { hello: string } };
    expect(json.user).toBe("user-1");
    expect(json.body.hello).toHaveLength(200_000);
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });
});
