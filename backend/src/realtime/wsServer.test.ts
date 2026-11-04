// Tests for the WebSocket server, with a real `ws` client against an ephemeral port.
// Supabase auth and the ranking store are mocked; the event bus is the real one.
// Covers: the auth handshake (timeout, bad token, subscribe-before-auth -> 4401), ownership,
// replay after lastSeq then live events with no gaps or duplicates, heartbeat, and cleanup.

import http from "http";
import type { AddressInfo } from "net";
import WebSocket, { type WebSocketServer } from "ws";

jest.mock("../middleware/verifyToken", () => ({ verifyAccessToken: jest.fn() }));
jest.mock("../services/rankingStore", () => ({
  getRunForUser: jest.fn(),
  listEventsAfter: jest.fn(),
}));

import { attachWsServer, AUTH_CLOSE_CODE, tokenExpiryMs } from "./wsServer";
import { listenerCount, publish } from "./eventBus";
import { verifyAccessToken } from "../middleware/verifyToken";
import { getRunForUser, listEventsAfter, type StoredEvent } from "../services/rankingStore";

const mockVerify = verifyAccessToken as jest.Mock;
const mockGetRun = getRunForUser as jest.Mock;
const mockList = listEventsAfter as jest.Mock;

let server: http.Server;
let wss: WebSocketServer;
let url: string;
const sockets: WebSocket[] = [];

function event(seq: number, type: StoredEvent["type"] = "comparison", runId = "run-1"): StoredEvent {
  return { runId, seq, type, payload: { winner: "a" } };
}

async function startServer(options: { authTimeoutMs?: number; heartbeatMs?: number } = {}) {
  server = http.createServer();
  wss = attachWsServer(server, options);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
}

// A client that queues every message so tests can await them in order.
function connect(options: WebSocket.ClientOptions = {}) {
  const socket = new WebSocket(url, options);
  sockets.push(socket);
  const messages: Record<string, unknown>[] = [];
  const waiters: (() => void)[] = [];
  socket.on("message", (data) => {
    messages.push(JSON.parse(data.toString()));
    waiters.splice(0).forEach((wake) => wake());
  });

  const next = async (): Promise<Record<string, unknown>> => {
    while (messages.length === 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out waiting for a message")), 2000);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    return messages.shift()!;
  };
  const opened = new Promise<void>((resolve) => socket.once("open", () => resolve()));
  const closed = new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
  const sendJson = (message: unknown) => socket.send(JSON.stringify(message));

  return { socket, messages, next, opened, closed, sendJson };
}

async function authedClient() {
  const client = connect();
  await client.opened;
  client.sendJson({ type: "auth", token: "good-token" });
  expect(await client.next()).toEqual({ type: "auth_ok" });
  return client;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(async () => {
  jest.clearAllMocks();
  mockVerify.mockImplementation(async (token: string) => (token === "good-token" ? { id: "user-1" } : null));
  mockGetRun.mockImplementation(async (runId: string, userId: string) =>
    runId === "run-1" && userId === "user-1" ? { id: "run-1", user_id: "user-1" } : null,
  );
  mockList.mockResolvedValue([]);
  await startServer({ authTimeoutMs: 150 });
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("auth handshake", () => {
  it("closes with 4401 when no auth message arrives in time", async () => {
    const client = connect();
    expect(await client.closed).toBe(AUTH_CLOSE_CODE);
  });

  it("closes with 4401 for a rejected token", async () => {
    const client = connect();
    await client.opened;
    client.sendJson({ type: "auth", token: "bad-token" });
    expect(await client.closed).toBe(AUTH_CLOSE_CODE);
    expect(mockVerify).toHaveBeenCalledWith("bad-token");
  });

  it("closes with 4401 when subscribing before auth", async () => {
    const client = connect();
    await client.opened;
    client.sendJson({ type: "subscribe", runId: "run-1", lastSeq: 0 });
    expect(await client.closed).toBe(AUTH_CLOSE_CODE);
    expect(mockGetRun).not.toHaveBeenCalled();
  });

  it("keeps an authenticated socket open past the auth timeout", async () => {
    const client = await authedClient();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });
});

describe("subscribe", () => {
  it("answers Run not found for another user's run, without reading events", async () => {
    const client = await authedClient();
    client.sendJson({ type: "subscribe", runId: "someone-elses-run", lastSeq: 0 });

    expect(await client.next()).toEqual({ type: "error", message: "Run not found", runId: "someone-elses-run" });
    expect(mockList).not.toHaveBeenCalled();
  });

  it("rejects an invalid lastSeq", async () => {
    const client = await authedClient();
    client.sendJson({ type: "subscribe", runId: "run-1", lastSeq: -1 });
    expect(await client.next()).toEqual({ type: "error", message: "Invalid subscribe message" });
  });

  it("replays stored events after lastSeq, then streams live ones", async () => {
    mockList.mockResolvedValue([event(3), event(4, "standings")]);
    const client = await authedClient();
    client.sendJson({ type: "subscribe", runId: "run-1", lastSeq: 2 });

    expect(await client.next()).toEqual({ type: "comparison", runId: "run-1", seq: 3, winner: "a" });
    expect(await client.next()).toMatchObject({ type: "standings", seq: 4 });
    expect(mockList).toHaveBeenCalledWith("run-1", "user-1", 2);

    publish(event(5));
    expect(await client.next()).toMatchObject({ seq: 5 });
  });

  it("has no gaps or duplicates when events are published while the replay is being read", async () => {
    // While the replay query runs: seq 3 is stored AND published (so it's in both the replay and
    // the live buffer), and seq 4 is published after the query's snapshot (live only).
    mockList.mockImplementation(async () => {
      publish(event(3));
      const snapshot = [event(2), event(3)];
      publish(event(4));
      return snapshot;
    });

    const client = await authedClient();
    client.sendJson({ type: "subscribe", runId: "run-1", lastSeq: 1 });

    const seqs = [];
    for (let i = 0; i < 3; i++) seqs.push((await client.next()).seq);
    publish(event(4)); // a stale duplicate is dropped
    publish(event(5));
    seqs.push((await client.next()).seq);

    expect(seqs).toEqual([2, 3, 4, 5]);
    await tick();
    expect(client.messages).toHaveLength(0);
  });

  it("prefers the live payload when a seq is in both the replay and the live buffer", async () => {
    // a private run's stored comparison has no reason; the live event for the same seq does
    const storedTwin: StoredEvent = { runId: "run-1", seq: 3, type: "comparison", payload: { winner: "a", reason: null } };
    const live: StoredEvent = { ...storedTwin, payload: { winner: "a", reason: "Live reason" } };
    mockList.mockImplementation(async () => {
      publish(live);
      return [event(2), storedTwin];
    });

    const client = await authedClient();
    client.sendJson({ type: "subscribe", runId: "run-1", lastSeq: 1 });

    expect((await client.next()).seq).toBe(2);
    expect(await client.next()).toEqual({ type: "comparison", runId: "run-1", seq: 3, winner: "a", reason: "Live reason" });
    await tick();
    expect(client.messages).toHaveLength(0);
  });

  it("re-subscribing after a reconnect resumes from the highest seq seen", async () => {
    mockList.mockImplementation(async (_runId: string, _userId: string, lastSeq: number) =>
      [event(1, "run_started"), event(2), event(3, "standings")].filter((e) => e.seq > lastSeq),
    );

    const first = await authedClient();
    first.sendJson({ type: "subscribe", runId: "run-1", lastSeq: 0 });
    expect((await first.next()).seq).toBe(1);
    expect((await first.next()).seq).toBe(2);
    expect((await first.next()).seq).toBe(3);
    first.socket.close();
    await first.closed;

    const second = await authedClient();
    second.sendJson({ type: "subscribe", runId: "run-1", lastSeq: 2 });
    expect((await second.next()).seq).toBe(3);
    await tick();
    expect(second.messages).toHaveLength(0);
  });

  it("does not deliver other runs' events", async () => {
    const client = await authedClient();
    client.sendJson({ type: "subscribe", runId: "run-1", lastSeq: 0 });
    await tick();

    publish(event(1, "comparison", "run-2"));
    publish(event(1, "run_started", "run-1"));

    expect(await client.next()).toMatchObject({ runId: "run-1", type: "run_started" });
    await tick();
    expect(client.messages).toHaveLength(0);
  });

  it("unsubscribes from the bus when the socket closes", async () => {
    const client = await authedClient();
    client.sendJson({ type: "subscribe", runId: "run-1", lastSeq: 0 });
    await tick();
    expect(listenerCount("run-1")).toBe(1);

    client.socket.close();
    await client.closed;
    await tick();
    expect(listenerCount("run-1")).toBe(0);
  });

  it("answers invalid JSON with an error and keeps the socket open", async () => {
    const client = await authedClient();
    client.socket.send("not json");
    expect(await client.next()).toEqual({ type: "error", message: "Invalid message" });
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });
});

describe("token expiry", () => {
  // an unsigned JWT-shaped token; the signature doesn't matter, verifyAccessToken is mocked
  const jwt = (claims: Record<string, unknown>) =>
    `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

  it("reads exp from the payload without verifying, and null for anything else", () => {
    expect(tokenExpiryMs(jwt({ exp: 1700000000, sub: "user-1" }))).toBe(1700000000 * 1000);
    expect(tokenExpiryMs(jwt({ sub: "user-1" }))).toBeNull();
    expect(tokenExpiryMs("good-token")).toBeNull();
    expect(tokenExpiryMs("a.!!!not-base64-json.c")).toBeNull();
  });

  it("closes an authenticated socket with 4401 when its token expires", async () => {
    const token = jwt({ exp: Date.now() / 1000 + 0.3, sub: "user-1" });
    mockVerify.mockImplementation(async (value: string) => (value === token ? { id: "user-1" } : null));
    const client = connect();
    await client.opened;
    client.sendJson({ type: "auth", token });
    expect(await client.next()).toEqual({ type: "auth_ok" });

    client.sendJson({ type: "subscribe", runId: "run-1", lastSeq: 0 });
    await tick();
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    expect(listenerCount("run-1")).toBe(1);

    const started = Date.now();
    expect(await client.closed).toBe(AUTH_CLOSE_CODE);
    expect(Date.now() - started).toBeLessThan(1500);
    await tick();
    expect(listenerCount("run-1")).toBe(0);
  });

  it("keeps a socket whose token is still valid open", async () => {
    const token = jwt({ exp: Date.now() / 1000 + 3600, sub: "user-1" });
    mockVerify.mockImplementation(async (value: string) => (value === token ? { id: "user-1" } : null));
    const client = connect();
    await client.opened;
    client.sendJson({ type: "auth", token });
    expect(await client.next()).toEqual({ type: "auth_ok" });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });
});

describe("heartbeat", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await startServer({ authTimeoutMs: 5000, heartbeatMs: 50 });
  });

  it("pings clients and keeps the ones that answer", async () => {
    const client = connect();
    let pings = 0;
    client.socket.on("ping", () => pings++);
    await client.opened;

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(pings).toBeGreaterThanOrEqual(2);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });

  it("terminates a client that stops answering pings", async () => {
    const client = connect({ autoPong: false });
    await client.opened;
    expect(await client.closed).toBe(1006);
  });
});
