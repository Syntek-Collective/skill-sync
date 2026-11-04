/*

    In-process event bus for ranking runs, keyed by run id.

    The runner publishes an event only AFTER it is stored in ranking_events, so anything a
    subscriber receives here can also be found in the database. The WebSocket server relies on
    that to replay missed events and then stream live ones without gaps.

    One process only: with several backend instances, swap this for Postgres LISTEN/NOTIFY or
    Supabase Realtime (same publish/subscribe shape).

*/

import { EventEmitter } from "events";
import type { StoredEvent } from "../services/rankingStore";

// what goes over the WebSocket: { type, runId, seq, ...payload }
export type WireEvent = { type: string; runId: string; seq: number } & Record<string, unknown>;

export type RunEventListener = (event: StoredEvent) => void;

const emitter = new EventEmitter();
// every open subscription is a listener; there's no meaningful cap
emitter.setMaxListeners(0);

function channel(runId: string): string {
  return `run:${runId}`;
}

export function publish(event: StoredEvent): void {
  emitter.emit(channel(event.runId), event);
}

// Returns an unsubscribe function.
export function subscribe(runId: string, listener: RunEventListener): () => void {
  const name = channel(runId);
  emitter.on(name, listener);
  return () => {
    emitter.off(name, listener);
  };
}

export function listenerCount(runId: string): number {
  return emitter.listenerCount(channel(runId));
}

// payload first so a payload can never override type/runId/seq
export function toWireEvent(event: StoredEvent): WireEvent {
  return { ...event.payload, type: event.type, runId: event.runId, seq: event.seq };
}
