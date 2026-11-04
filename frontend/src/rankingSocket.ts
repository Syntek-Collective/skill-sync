// Live progress for a pairwise ranking run (docs/RANKING.md, "WebSocket protocol").
//
//   1. open ws(s)://<backend>/ws and send { type: "auth", token }
//   2. after { type: "auth_ok" }, send { type: "subscribe", runId, lastSeq }
//   3. the server replays every stored event with seq > lastSeq, then streams new ones
//
// If the connection drops, it reconnects with exponential backoff (1s, 2s, 4s ... max 15s) and
// subscribes again from the highest seq it has, so nothing is missed or shown twice.
// The pure parts (backoffDelay, deriveWsUrl, SeqTracker) have no browser dependencies.

import { API_BASE_URL } from "./matchApi";
import type { RankingEvent } from "./types";

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 15000;
// a 4401 close means the server didn't accept the token, or the token expired while connected
// (the server closes the socket when the token's exp passes). Either way we reconnect with a
// fresh token from getToken(). Only CONSECUTIVE failures count: a successful auth_ok resets the
// count, so a routine expiry followed by a good reconnect never moves toward this limit.
const MAX_AUTH_FAILURES = 3;

// delay before reconnect attempt n (0-based): 1s, 2s, 4s, 8s, 15s, 15s ...
export function backoffDelay(attempt: number, base = BACKOFF_BASE_MS, max = BACKOFF_MAX_MS): number {
  return Math.min(max, base * 2 ** Math.max(0, attempt));
}

// The socket lives at /ws on the API server. An empty or relative API base means "this same
// site", so it resolves against the page's address; http -> ws and https -> wss.
export function deriveWsUrl(apiBase: string, pageUrl: string): string {
  const url = new URL(apiBase || "/", pageUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/ws`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function rankingSocketUrl(): string {
  return deriveWsUrl(API_BASE_URL, window.location.href);
}

// Remembers which seqs were delivered (a replay after a reconnect can overlap live events)
// and the highest one, which is what a re-subscribe asks to continue from.
export class SeqTracker {
  private seen = new Set<number>();
  // everything at or below the starting lastSeq was already handled before this tracker existed
  private readonly floor: number;
  highest: number;

  constructor(lastSeq = 0) {
    this.floor = lastSeq;
    this.highest = lastSeq;
  }

  // true the first time a seq is seen; false for duplicates and anything already covered by lastSeq
  accept(seq: number): boolean {
    if (!Number.isFinite(seq) || seq <= this.floor || this.seen.has(seq)) return false;
    this.seen.add(seq);
    if (seq > this.highest) this.highest = seq;
    return true;
  }
}

export type SocketStatus = "connecting" | "live" | "reconnecting" | "closed";

type RankingSocketOptions = {
  url: string;
  runId: string;
  // called before every (re)connect, so an expired token is replaced by a fresh one
  getToken: () => Promise<string | null>;
  lastSeq?: number;
};

const EVENT_TYPES = new Set(["run_started", "run_resumed", "comparison", "standings", "completed", "failed"]);

export class RankingSocket {
  private readonly url: string;
  private readonly runId: string;
  private readonly getToken: () => Promise<string | null>;
  private readonly tracker: SeqTracker;
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private authFailures = 0;
  private stopped = false;
  private eventHandlers = new Set<(event: RankingEvent) => void>();
  private statusHandlers = new Set<(status: SocketStatus, problem?: string) => void>();
  status: SocketStatus = "connecting";

  constructor(options: RankingSocketOptions) {
    this.url = options.url;
    this.runId = options.runId;
    this.getToken = options.getToken;
    this.tracker = new SeqTracker(options.lastSeq ?? 0);
  }

  get lastSeq(): number {
    return this.tracker.highest;
  }

  onEvent(handler: (event: RankingEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  // problem is set when the socket gives up for good (e.g. "Run not found")
  onStatus(handler: (status: SocketStatus, problem?: string) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  start(): void {
    void this.connect();
  }

  close(): void {
    this.stop();
  }

  private setStatus(status: SocketStatus, problem?: string) {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status, problem));
  }

  private stop(problem?: string) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000);
    this.setStatus("closed", problem);
  }

  private async connect() {
    if (this.stopped) return;
    let token: string | null = null;
    try {
      token = await this.getToken();
    } catch {
      token = null;
    }
    if (this.stopped) return;
    if (!token) {
      this.stop("Please log in again to follow this ranking.");
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
    ws.onmessage = (message) => {
      if (this.ws === ws) this.handleMessage(ws, message.data);
    };
    // an error is always followed by a close, which handles the reconnect
    ws.onerror = () => {};
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      if (event.code === 4401) {
        this.authFailures += 1;
        if (this.authFailures >= MAX_AUTH_FAILURES) {
          this.stop("The live connection couldn't sign in. Please log in again.");
          return;
        }
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    this.setStatus("reconnecting");
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, delay);
  }

  private handleMessage(ws: WebSocket, raw: unknown) {
    let message: { type?: unknown; runId?: unknown; seq?: unknown; message?: unknown };
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message.type === "auth_ok") {
      this.attempt = 0;
      this.authFailures = 0;
      ws.send(JSON.stringify({ type: "subscribe", runId: this.runId, lastSeq: this.tracker.highest }));
      this.setStatus("live");
      return;
    }

    if (message.type === "error") {
      this.stop(typeof message.message === "string" ? message.message : "The live connection failed.");
      return;
    }

    if (
      typeof message.type === "string" &&
      EVENT_TYPES.has(message.type) &&
      message.runId === this.runId &&
      typeof message.seq === "number" &&
      this.tracker.accept(message.seq)
    ) {
      const event = message as RankingEvent;
      this.eventHandlers.forEach((handler) => handler(event));
    }
  }
}
