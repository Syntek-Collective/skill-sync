/*

    WebSocket server for ranking progress (docs/RANKING.md, "WebSocket protocol").
    Attached to the same HTTP server as the API, at path /ws.

    1. AUTH: the first message must be { type: "auth", token } within 10s, else close 4401.
       The token is checked with Supabase exactly like the HTTP authMiddleware does.
    2. SUBSCRIBE: { type: "subscribe", runId, lastSeq } -> owner check, then every stored event
       with seq > lastSeq in order, then live events.

    NO GAPS, NO DUPLICATES on (re)subscribe: we subscribe to the bus BEFORE reading the replay
    from the database and buffer live events meanwhile. The runner stores an event before it
    publishes it, so every event is in the replay, the buffer, or arrives later; a per-socket
    "last seq sent" drops anything already delivered.
    A live event can carry more than its stored twin (a private run's comparison reason is
    published but never stored), so when the same seq is in both the replay and the buffer we
    send the live (buffered) one. Otherwise whichever arrives first wins.

    TOKEN EXPIRY: Supabase access tokens are short-lived (about an hour). After auth the server
    reads the token's `exp` and closes the socket with 4401 when it passes; the client then
    reconnects with a fresh token. (`exp` is only read to schedule that close - the token was
    already verified by Supabase, which rejects expired tokens.)

    Heartbeat: a ping every 30s; a socket that didn't answer the previous ping is terminated.
    Nothing here logs message bodies or tokens.

*/

import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket, type RawData } from "ws";

import { verifyAccessToken } from "../middleware/verifyToken";
import { getRunForUser, listEventsAfter, type StoredEvent } from "../services/rankingStore";
import { subscribe as subscribeToBus, toWireEvent } from "./eventBus";

export const WS_PATH = "/ws";
export const AUTH_CLOSE_CODE = 4401;

export type WsServerOptions = {
  authTimeoutMs?: number;
  heartbeatMs?: number;
};

const MAX_MESSAGE_BYTES = 16 * 1024;
// setTimeout's longest delay (~24.8 days); a later expiry is re-checked when this fires
const MAX_TIMER_MS = 2_147_483_647;

// The `exp` claim (seconds since the epoch) of a JWT, or null if it can't be read. Only
// base64url-decodes the payload: this is NOT a verification. Callers must have verified the
// token already (verifyAccessToken) and use this only to know when it stops being valid.
export function tokenExpiryMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const exp = (claims as { exp?: unknown } | null)?.exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}
const MAX_SUBSCRIPTIONS_PER_SOCKET = 20;

type ClientState = {
  userId: string | null;
  isAlive: boolean;
  closed: boolean;
  // run id -> unsubscribe from the bus
  subscriptions: Map<string, () => void>;
};

function send(socket: WebSocket, message: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function parseMessage(data: RawData): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(data.toString());
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function attachWsServer(server: HttpServer, options: WsServerOptions = {}): WebSocketServer {
  const authTimeoutMs = options.authTimeoutMs ?? 10_000;
  const heartbeatMs = options.heartbeatMs ?? 30_000;

  const wss = new WebSocketServer({ server, path: WS_PATH, maxPayload: MAX_MESSAGE_BYTES });
  const clients = new Map<WebSocket, ClientState>();

  // ===== heartbeat =====
  const heartbeat = setInterval(() => {
    for (const [socket, state] of clients) {
      if (!state.isAlive) {
        socket.terminate();
        continue;
      }
      state.isAlive = false;
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, heartbeatMs);
  heartbeat.unref();

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  wss.on("connection", (socket: WebSocket, _req: IncomingMessage) => {
    const state: ClientState = { userId: null, isAlive: true, closed: false, subscriptions: new Map() };
    clients.set(socket, state);

    const authTimer = setTimeout(() => {
      if (!state.userId) socket.close(AUTH_CLOSE_CODE, "Authentication required");
    }, authTimeoutMs);

    // closes the socket once the access token it authenticated with expires
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    const closeAtExpiry = (expiresAt: number) => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        socket.close(AUTH_CLOSE_CODE, "Token expired");
        return;
      }
      expiryTimer = setTimeout(() => closeAtExpiry(expiresAt), Math.min(remaining, MAX_TIMER_MS));
      expiryTimer.unref?.();
    };

    const cleanup = () => {
      state.closed = true;
      clearTimeout(authTimer);
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimer = null;
      for (const unsubscribe of state.subscriptions.values()) unsubscribe();
      state.subscriptions.clear();
      clients.delete(socket);
    };

    socket.on("pong", () => {
      state.isAlive = true;
    });
    socket.on("close", cleanup);
    socket.on("error", () => {
      // the close event follows and cleans up; nothing worth logging (no message contents)
    });

    socket.on("message", (data: RawData) => {
      void handleMessage(data).catch(() => {
        send(socket, { type: "error", message: "Something went wrong. Please try again." });
      });
    });

    async function handleMessage(data: RawData): Promise<void> {
      const message = parseMessage(data);
      if (!message) {
        send(socket, { type: "error", message: "Invalid message" });
        return;
      }

      if (message.type === "auth") {
        if (state.userId) {
          send(socket, { type: "auth_ok" });
          return;
        }
        const token = typeof message.token === "string" ? message.token.trim() : "";
        const user = token ? await verifyAccessToken(token).catch(() => null) : null;
        if (state.closed) return;
        if (!user) {
          socket.close(AUTH_CLOSE_CODE, "Unauthorized");
          return;
        }
        state.userId = user.id;
        clearTimeout(authTimer);
        send(socket, { type: "auth_ok" });
        const expiresAt = tokenExpiryMs(token);
        if (expiresAt !== null) closeAtExpiry(expiresAt);
        return;
      }

      if (!state.userId) {
        socket.close(AUTH_CLOSE_CODE, "Authentication required");
        return;
      }

      if (message.type === "subscribe") {
        await handleSubscribe(state.userId, message);
        return;
      }

      if (message.type === "unsubscribe" && typeof message.runId === "string") {
        state.subscriptions.get(message.runId)?.();
        state.subscriptions.delete(message.runId);
        return;
      }

      send(socket, { type: "error", message: "Unknown message type" });
    }

    async function handleSubscribe(userId: string, message: Record<string, unknown>): Promise<void> {
      const runId = typeof message.runId === "string" ? message.runId : "";
      const rawLastSeq = message.lastSeq ?? 0;
      const lastSeq = typeof rawLastSeq === "number" && Number.isInteger(rawLastSeq) && rawLastSeq >= 0 ? rawLastSeq : null;

      if (!runId || runId.length > 100 || lastSeq === null) {
        send(socket, { type: "error", message: "Invalid subscribe message" });
        return;
      }

      const run = await getRunForUser(runId, userId);
      if (state.closed) return;
      if (!run) {
        send(socket, { type: "error", message: "Run not found", runId });
        return;
      }

      // re-subscribing to the same run replaces the old subscription
      state.subscriptions.get(runId)?.();
      state.subscriptions.delete(runId);
      if (state.subscriptions.size >= MAX_SUBSCRIPTIONS_PER_SOCKET) {
        send(socket, { type: "error", message: "Too many subscriptions", runId });
        return;
      }

      let lastSent = lastSeq;
      let replaying = true;
      const buffered: StoredEvent[] = [];

      const deliver = (event: StoredEvent) => {
        if (event.seq <= lastSent) return; // already sent (replay/live overlap)
        lastSent = event.seq;
        send(socket, toWireEvent(event));
      };

      // 1. listen first, buffering, so nothing published during the replay read is lost
      const unsubscribe = subscribeToBus(runId, (event) => {
        if (replaying) buffered.push(event);
        else deliver(event);
      });
      state.subscriptions.set(runId, unsubscribe);

      let stored: StoredEvent[];
      try {
        // 2. replay what's stored
        stored = (await listEventsAfter(runId, userId, lastSeq)) ?? [];
      } catch (error) {
        unsubscribe();
        if (state.subscriptions.get(runId) === unsubscribe) state.subscriptions.delete(runId);
        throw error;
      }

      // the socket closed, or a newer subscribe for this run replaced this one, while we read
      if (state.closed || state.subscriptions.get(runId) !== unsubscribe) {
        unsubscribe();
        return;
      }

      // prefer the live payload for a seq seen both ways (it may hold a reason that isn't stored)
      const liveBySeq = new Map(buffered.map((event) => [event.seq, event]));
      for (const event of stored) deliver(liveBySeq.get(event.seq) ?? event);

      // 3. flush what arrived meanwhile (in seq order), then go live
      buffered.sort((x, y) => x.seq - y.seq);
      for (const event of buffered) deliver(event);
      buffered.length = 0;
      replaying = false;
    }
  });

  return wss;
}
