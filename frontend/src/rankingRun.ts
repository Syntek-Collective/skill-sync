// State for the pairwise ranking panel (components/PairwiseRanking.tsx), kept free of React and
// the network so it's easy to reason about:
//  - the run remembered in sessionStorage, so a page refresh re-attaches to it
//  - a reducer that folds the GET snapshot and the socket's events into what the panel shows
//  - comparing the pairwise order with the existing score order

import type {
  BTStrength,
  ComparisonEvent,
  RankingEvent,
  RankingResult,
  RankingRun,
  RankingRunStatus,
} from "./types";

// ===== the run remembered for this tab =====
// Only ids, file names and the score order are kept (never resume text), in sessionStorage,
// so they're gone when the tab closes.
export type StoredRankingRun = {
  runId: string;
  rounds: 1 | 2;
  // "saved" runs can be resumed if they stall; older stored entries may not have it
  mode?: "saved" | "private";
  // candidate id -> the name the app shows for it (the resume's file name)
  labels: Record<string, string>;
  // candidate ids, best score first, when the run started
  scoreOrder: string[];
  // score per candidate id at the start, for the final comparison
  scores: Record<string, number>;
};

const RANKING_RUN_STORAGE = "skillsync.pairwiseRun";

export function readStoredRankingRun(): StoredRankingRun | null {
  try {
    const raw = sessionStorage.getItem(RANKING_RUN_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRankingRun;
    return typeof parsed?.runId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredRankingRun(run: StoredRankingRun): void {
  try {
    sessionStorage.setItem(RANKING_RUN_STORAGE, JSON.stringify(run));
  } catch {
    // storage blocked: the run still works, it just won't survive a refresh
  }
}

export function clearStoredRankingRun(): void {
  try {
    sessionStorage.removeItem(RANKING_RUN_STORAGE);
  } catch {
    // nothing stored
  }
}

// ===== what the panel shows =====
export type RankingViewState = {
  // "loading" until the GET snapshot or the first event arrives
  status: RankingRunStatus | "loading";
  totalTasks: number;
  completedTasks: number;
  strengths: BTStrength[];
  // newest last; capped so a long replay doesn't grow without bound
  comparisons: ComparisonEvent[];
  result: RankingResult | null;
  error: string | null;
  // highest event seq applied so far
  lastSeq: number;
  // highest `lastSeq` any GET snapshot reported: an event below it is not the run's latest
  snapshotLastSeq: number;
};

export const MAX_KEPT_COMPARISONS = 50;

export const initialRankingState: RankingViewState = {
  status: "loading",
  totalTasks: 0,
  completedTasks: 0,
  strengths: [],
  comparisons: [],
  result: null,
  error: null,
  lastSeq: 0,
  snapshotLastSeq: 0,
};

export type RankingAction =
  // GET /api/rankings/:runId; lastSeq is the highest stored event seq when it was read
  | { type: "snapshot"; run: RankingRun; lastSeq?: number }
  | { type: "event"; event: RankingEvent }
  // a saved run was resumed on the server: it's running again, even if it had failed
  | { type: "resumed" };

const isTerminal = (status: RankingViewState["status"]) =>
  status === "completed" || status === "failed" || status === "interrupted";

// A `failed` event is the run's state only if nothing came after it. A saved run that failed and
// was then resumed keeps that old `failed` in its log, so a replay from 0 meets it before the
// newer events. It's the latest when its seq is at least the snapshot's lastSeq (the latest
// event when the page loaded), which is also true of every failed event that arrives live.
export function isStaleFailure(event: RankingEvent, snapshotLastSeq: number): boolean {
  return event.type === "failed" && event.seq < snapshotLastSeq;
}

// Whether this event ends the run for the panel (close the socket, allow a new run).
export function isFinalEvent(event: RankingEvent, snapshotLastSeq: number): boolean {
  if (event.type === "completed") return true;
  return event.type === "failed" && !isStaleFailure(event, snapshotLastSeq);
}

// What to do with a GET snapshot taken while following a run (after a reconnect, or when no
// event arrived for a while): "stop" when the run can't send anything more - a private run
// interrupted by a server restart, or a failure at least as new as every event seen (seenSeq) -
// "finished" when it completed (the socket still delivers the rest of the log), else "continue".
export function snapshotOutcome(
  run: Pick<RankingRun, "status">,
  lastSeq: number,
  seenSeq: number,
): "stop" | "finished" | "continue" {
  if (run.status === "interrupted") return "stop";
  if (run.status === "failed" && lastSeq >= seenSeq) return "stop";
  if (run.status === "completed") return "finished";
  return "continue";
}

// The status after an event that shows the run is going. Completed and interrupted runs stay
// that way; a failed run that sends more progress was resumed, so it's running again.
const progressStatus = (status: RankingViewState["status"]): RankingViewState["status"] =>
  status === "completed" || status === "interrupted" ? status : "running";

// The snapshot and the replayed events can arrive in either order and overlap, so every
// update is idempotent: counts only move forward, and "completed" is never undone.
export function rankingReducer(state: RankingViewState, action: RankingAction): RankingViewState {
  if (action.type === "resumed") {
    return state.status === "completed" ? state : { ...state, status: "running", error: null };
  }

  if (action.type === "snapshot") {
    const { run } = action;
    const snapshotSeq = action.lastSeq ?? 0;
    // the snapshot's status wins when it's at least as new as the events seen so far. At the
    // same seq a terminal status wins too: a private run interrupted by a restart, or a run
    // marked failed just before its `failed` event was stored, has no newer event to say so.
    const snapshotIsNewer =
      state.status === "loading" ||
      snapshotSeq > state.lastSeq ||
      (snapshotSeq === state.lastSeq && isTerminal(run.status));
    let status = state.status;
    if (state.status === "completed" || run.status === "completed") status = "completed";
    else if (snapshotIsNewer) status = run.status;
    const fromSnapshot = status !== state.status;
    return {
      ...state,
      status,
      totalTasks: run.totalTasks || state.totalTasks,
      completedTasks: Math.max(state.completedTasks, run.completedTasks),
      result: state.result ?? run.result,
      strengths: state.result ? state.strengths : (run.result?.strengths ?? state.strengths),
      error: status === "completed" ? null : fromSnapshot ? run.error : state.error,
      snapshotLastSeq: Math.max(state.snapshotLastSeq, snapshotSeq),
    };
  }

  const { event } = action;
  const seen = { ...state, lastSeq: Math.max(state.lastSeq, event.seq) };
  switch (event.type) {
    case "run_started":
      return { ...seen, status: progressStatus(state.status), totalTasks: event.totalTasks };
    case "run_resumed":
      if (state.status === "completed") return seen;
      return {
        ...seen,
        status: state.status === "interrupted" ? state.status : "running",
        error: null,
        totalTasks: event.totalTasks || state.totalTasks,
        completedTasks: Math.max(state.completedTasks, event.completedTasks),
      };
    case "comparison":
      return {
        ...seen,
        status: progressStatus(state.status),
        totalTasks: event.totalTasks || state.totalTasks,
        completedTasks: Math.max(state.completedTasks, event.completedTasks),
        comparisons: [...state.comparisons, event].slice(-MAX_KEPT_COMPARISONS),
      };
    case "standings":
      // the final result wins over any standings that arrive after it
      if (state.result) return seen;
      return {
        ...seen,
        status: state.status === "failed" ? "running" : state.status,
        strengths: event.strengths,
      };
    case "completed":
      return {
        ...seen,
        status: "completed",
        error: null,
        result: event.result,
        strengths: event.result.strengths,
        completedTasks: Math.max(state.completedTasks, state.totalTasks),
      };
    case "failed":
      // a failure never overrides a completed run, and an old failure (followed by a resume)
      // doesn't change the status
      if (state.status === "completed" || isStaleFailure(event, state.snapshotLastSeq)) return seen;
      return { ...seen, status: "failed", error: event.error };
    default:
      return seen;
  }
}

// ===== display helpers =====

// strength relative to the strongest candidate (strongest = 100%)
export function relativeStrength(strengths: BTStrength[]): Map<string, number> {
  const top = Math.max(0, ...strengths.map((s) => s.strength));
  return new Map(strengths.map((s) => [s.id, top > 0 ? (s.strength / top) * 100 : 0]));
}

// Kendall's tau-a over the ids both orders share: 1 = same order, -1 = reversed.
export function kendallTau(orderA: string[], orderB: string[]): number {
  const positionInB = new Map(orderB.map((id, index) => [id, index]));
  const shared = orderA.filter((id) => positionInB.has(id));
  const n = shared.length;
  if (n < 2) return 1;
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      // shared is in A's order, so i is ahead of j in A
      const inB = (positionInB.get(shared[i]) as number) - (positionInB.get(shared[j]) as number);
      if (inB < 0) concordant += 1;
      else if (inB > 0) discordant += 1;
    }
  }
  return (concordant - discordant) / ((n * (n - 1)) / 2);
}

export type OrderComparison = {
  tau: number;
  sameTop: boolean;
  // how many candidates hold the same place in both orders
  samePlace: number;
  // the candidate whose place changed most (null when the orders match)
  biggestMove: { id: string; scoreRank: number; pairwiseRank: number } | null;
};

export function compareOrders(pairwiseOrder: string[], scoreOrder: string[]): OrderComparison {
  const scoreRank = new Map(scoreOrder.map((id, index) => [id, index + 1]));
  const shared = pairwiseOrder.filter((id) => scoreRank.has(id));
  let samePlace = 0;
  let biggestMove: OrderComparison["biggestMove"] = null;
  shared.forEach((id, index) => {
    const pairwiseRank = index + 1;
    const byScore = scoreRank.get(id) as number;
    if (byScore === pairwiseRank) samePlace += 1;
    const move = Math.abs(byScore - pairwiseRank);
    if (move > 0 && (!biggestMove || move > Math.abs(biggestMove.scoreRank - biggestMove.pairwiseRank))) {
      biggestMove = { id, scoreRank: byScore, pairwiseRank };
    }
  });
  return {
    tau: kendallTau(shared, scoreOrder),
    sameTop: shared.length > 0 && shared[0] === scoreOrder.find((id) => shared.includes(id)),
    samePlace,
    biggestMove,
  };
}
