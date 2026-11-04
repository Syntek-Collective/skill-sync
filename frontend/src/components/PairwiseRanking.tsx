/*
  PAIRWISE RANKING

  A second opinion on the order. Instead of scoring each resume on its own (0-100), the model
  compares candidates two at a time against the job's requirements, and a Bradley-Terry model
  turns those wins and losses into a strength for each candidate (see docs/RANKING.md).

  The run happens on the server. This panel starts it, then follows its progress over a
  WebSocket (rankingSocket.ts). The run id is kept in sessionStorage, so after a refresh the
  panel re-attaches: it reads the run (GET /api/rankings/:runId) and replays its events from 0.

  A SAVED run that stalls (no event for 20s, e.g. after a server restart) or fails can be resumed
  (POST /api/rankings/:runId/resume); the server skips the comparisons already done.

  After a socket reconnect, and whenever no event has arrived for 20s, the panel re-reads the run
  (GET) so a run the server stopped meanwhile (a private run interrupted by a restart, a failure)
  shows as such instead of spinning. A finished run can be deleted (DELETE /api/rankings/:runId).
*/

import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";

import Button from "./ui/Button";
import Loading from "./ui/Loading";
import {
  ApiError,
  buildRankingCandidates,
  deleteRanking,
  getRanking,
  privateUploadProblem,
  rankingJobLink,
  resumeRanking,
  startRanking,
} from "../matchApi";
import { getAccessToken } from "../supabaseClient";
import { RankingSocket, rankingSocketUrl, type SocketStatus } from "../rankingSocket";
import {
  clearStoredRankingRun,
  compareOrders,
  initialRankingState,
  isFinalEvent,
  rankingReducer,
  readStoredRankingRun,
  relativeStrength,
  snapshotOutcome,
  writeStoredRankingRun,
  type RankingViewState,
  type StoredRankingRun,
} from "../rankingRun";
import type { Candidate, CandidateResult, Job, Requirement } from "../types";

const MAX_RANKED = 10;
const RECENT_COMPARISONS = 6;
// a running run with no new event for this long is re-read from the server; a saved one also
// offers "Resume run"
const STALL_MS = 20_000;

type PairwiseRankingProps = {
  // null when the panel is only showing a run restored after a page refresh
  job: Job | null;
  candidates: Candidate[];
  requirements: Requirement[] | null;
  openaiKey: string;
  // true while an "Analyze" batch is running; a new ranking waits for it
  isBusy?: boolean;
  // restored view only: hide the panel and forget the run
  onDismiss?: () => void;
};

function PairwiseRanking({
  job,
  candidates,
  requirements,
  openaiKey,
  isBusy = false,
  onDismiss,
}: PairwiseRankingProps) {
  const [stored, setStored] = useState<StoredRankingRun | null>(readStoredRankingRun);
  const [rounds, setRounds] = useState<1 | 2>(2);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState("");
  // set by the run view once the run has finished (or can't be followed), so a new one can start
  const [isFinished, setIsFinished] = useState(false);

  // analyzed candidates, best score first - the order this ranking is compared against
  const ranked = candidates
    .filter((candidate) => candidate.status === "done" && candidate.result)
    .sort((a, b) => (b.result?.score ?? 0) - (a.result?.score ?? 0))
    .slice(0, MAX_RANKED);

  const runInProgress = stored !== null && !isFinished;
  const canStart =
    job !== null &&
    requirements !== null &&
    ranked.length >= 2 &&
    Boolean(openaiKey) &&
    !isBusy &&
    !isStarting &&
    !runInProgress;

  const handleStart = async () => {
    if (!job || !requirements || !canStart) return;
    // private jobs send the PDFs themselves; check the size limits before sending
    const sizeProblem = privateUploadProblem(job, ranked);
    if (sizeProblem) {
      setStartError(sizeProblem);
      return;
    }
    setIsStarting(true);
    setStartError("");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setStartError("Please log in again before running the ranking.");
        return;
      }
      const body = {
        requirements,
        rounds,
        candidates: await buildRankingCandidates(job, ranked),
        // saved jobs: link the run to the job, so deleting the job deletes the run too
        ...rankingJobLink(job),
      };
      const { runId } = await startRanking(accessToken, openaiKey, body);
      const run: StoredRankingRun = {
        runId,
        rounds,
        mode: job.saved && job.id ? "saved" : "private",
        labels: Object.fromEntries(ranked.map((c) => [c.resumeId, c.fileName])),
        scoreOrder: ranked.map((c) => c.resumeId),
        scores: Object.fromEntries(
          ranked.map((c) => [c.resumeId, (c.result as CandidateResult).score]),
        ),
      };
      writeStoredRankingRun(run);
      setIsFinished(false);
      setStored(run);
    } catch (error) {
      setStartError(
        error instanceof ApiError ? error.message : "Couldn't start the ranking. Please try again.",
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleRunGone = () => {
    clearStoredRankingRun();
    setStored(null);
    if (!job) onDismiss?.();
  };

  return (
    <section className="mt-6 w-full max-w-3xl rounded-lg border border-green-900/20 bg-white/80 p-6 text-left shadow-md">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold uppercase tracking-wide text-green-950">
          Pairwise ranking
        </h2>
        {!job && onDismiss && (
          <button
            type="button"
            onClick={() => {
              clearStoredRankingRun();
              onDismiss();
            }}
            className="shrink-0 text-xs text-green-700 underline underline-offset-2 hover:opacity-70"
          >
            Dismiss
          </button>
        )}
      </div>

      {job ? (
        <>
          <p className="mt-1 text-xs text-[#5f6b61]">
            A second opinion on the order: the model compares candidates two at a time against
            this job's requirements, and their wins and losses become a relative strength.
            Side-by-side judgments tend to be more consistent than separate 0-100 scores.
          </p>

          <fieldset className="mt-3 text-sm text-[#4f5f52]" disabled={runInProgress || isStarting}>
            <legend className="text-xs font-semibold uppercase text-green-950">Rounds</legend>
            <label className="mt-1 flex items-start gap-2">
              <input
                type="radio"
                name="pairwise-rounds"
                className="mt-1"
                checked={rounds === 1}
                onChange={() => setRounds(1)}
              />
              <span>
                1 round <span className="text-xs opacity-70">- each pair judged once (faster)</span>
              </span>
            </label>
            <label className="mt-1 flex items-start gap-2">
              <input
                type="radio"
                name="pairwise-rounds"
                className="mt-1"
                checked={rounds === 2}
                onChange={() => setRounds(2)}
              />
              <span>
                2 rounds{" "}
                <span className="text-xs opacity-70">
                  - each pair judged in both orders, so being shown first or second can't tilt
                  the result (twice the calls)
                </span>
              </span>
            </label>
          </fieldset>

          <div className="mt-4 flex flex-col items-center gap-2">
            <Button variant="secondary" onClick={handleStart} disabled={!canStart}>
              {isStarting
                ? "Starting..."
                : stored
                  ? "Run pairwise ranking again"
                  : "Run pairwise ranking"}
            </Button>
            {!openaiKey && (
              <p className="text-xs text-[#5f6b61]">Add your OpenAI key above to run it.</p>
            )}
            {ranked.length >= MAX_RANKED && candidates.length > MAX_RANKED && (
              <p className="text-xs text-[#5f6b61]">The top {MAX_RANKED} by score are compared.</p>
            )}
          </div>
          {startError && <p className="mt-2 text-sm font-semibold text-red-700">{startError}</p>}
        </>
      ) : (
        <p className="mt-1 text-xs text-[#5f6b61]">
          The ranking you started before the page reloaded.
        </p>
      )}

      {stored && (
        <RunView
          key={stored.runId}
          stored={stored}
          openaiKey={openaiKey}
          onFinished={() => setIsFinished(true)}
          onResumed={() => setIsFinished(false)}
          onGone={handleRunGone}
        />
      )}
    </section>
  );
}

type RunViewProps = {
  stored: StoredRankingRun;
  openaiKey: string;
  onFinished: () => void;
  // a resumed run is in progress again
  onResumed: () => void;
  // the server no longer knows this run (404): forget it
  onGone: () => void;
};

// one run: snapshot + live events. Keyed by run id, so a new run starts with fresh state.
function RunView({ stored, openaiKey, onFinished, onResumed, onGone }: RunViewProps) {
  const [state, dispatch] = useReducer(rankingReducer, initialRankingState);
  const [connection, setConnection] = useState<SocketStatus>("connecting");
  const [problem, setProblem] = useState("");
  // the run's mode as the server reports it (older stored entries don't have it)
  const [mode, setMode] = useState<"saved" | "private" | null>(stored.mode ?? null);
  // when the last event arrived (or we attached), and a clock to tell when that's too long ago
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [isResuming, setIsResuming] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // the live socket, and the highest event seq known (from the socket or the GET snapshot)
  const socketRef = useRef<RankingSocket | null>(null);
  const lastSeqRef = useRef(0);
  // the highest lastSeq a GET snapshot reported; an older `failed` event is not the run's state
  const snapshotSeqRef = useRef(0);
  // when the run was last re-read because nothing arrived for a while
  const lastRefreshRef = useRef(0);
  const cancelledRef = useRef(false);

  const finished = useEffectEvent(() => onFinished());
  const gone = useEffectEvent(() => onGone());

  // Re-reads the run while following it (after a reconnect, or a stall) and stops following when
  // the server says it has stopped: e.g. a private run interrupted by a restart sends no event.
  const refreshSnapshot = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken || cancelledRef.current) return;
      const { run, lastSeq } = await getRanking(accessToken, stored.runId);
      if (cancelledRef.current) return;
      const seenSeq = Math.max(lastSeqRef.current, socketRef.current?.lastSeq ?? 0);
      snapshotSeqRef.current = Math.max(snapshotSeqRef.current, lastSeq);
      lastSeqRef.current = Math.max(lastSeqRef.current, lastSeq);
      setMode(run.mode);
      dispatch({ type: "snapshot", run, lastSeq });
      const outcome = snapshotOutcome(run, lastSeq, seenSeq);
      if (outcome === "stop") {
        socketRef.current?.close();
        onFinished();
      } else if (outcome === "finished") {
        // the socket still delivers the rest of the log (and closes on `completed`)
        onFinished();
      }
    } catch (error) {
      if (cancelledRef.current) return;
      if (error instanceof ApiError && error.status === 404) onGone();
      // otherwise keep following; the next reconnect or stall tries again
    }
  };
  const refreshAfterStall = useEffectEvent(() => {
    void refreshSnapshot();
  });

  // Subscribes from `lastSeq`. Replaces any socket this view already had.
  const follow = (lastSeq: number) => {
    socketRef.current?.close();
    const socket = new RankingSocket({
      url: rankingSocketUrl(),
      runId: stored.runId,
      getToken: getAccessToken,
      lastSeq,
    });
    socketRef.current = socket;
    socket.onEvent((event) => {
      if (socketRef.current !== socket) return;
      lastSeqRef.current = Math.max(lastSeqRef.current, event.seq);
      setLastActivity(Date.now());
      dispatch({ type: "event", event });
      // a `failed` older than the snapshot's last event was followed by a resume: keep following
      if (isFinalEvent(event, snapshotSeqRef.current)) {
        socket.close();
        onFinished();
      }
    });
    let reconnecting = false;
    socket.onStatus((status, socketProblem) => {
      if (socketRef.current !== socket) return;
      setConnection(status);
      if (status === "reconnecting") reconnecting = true;
      if (status === "live" && reconnecting) {
        // back after a drop (maybe a server restart): check the run didn't stop meanwhile
        reconnecting = false;
        void refreshSnapshot();
      }
      if (socketProblem) {
        setProblem(socketProblem);
        onFinished();
      }
    });
    setProblem("");
    setLastActivity(Date.now());
    socket.start();
  };
  const startFollowing = useEffectEvent((lastSeq: number) => follow(lastSeq));

  useEffect(() => {
    cancelledRef.current = false;
    let cancelled = false;

    const attach = async () => {
      const accessToken = await getAccessToken();
      if (cancelled) return;
      if (!accessToken) {
        setProblem("Please log in again to follow this ranking.");
        finished();
        return;
      }

      try {
        const { run, lastSeq } = await getRanking(accessToken, stored.runId);
        if (cancelled) return;
        snapshotSeqRef.current = Math.max(snapshotSeqRef.current, lastSeq);
        dispatch({ type: "snapshot", run, lastSeq });
        setMode(run.mode);
        lastSeqRef.current = Math.max(lastSeqRef.current, lastSeq);
        // nothing more will arrive for these; the snapshot says everything
        if (run.status === "failed" || run.status === "interrupted") {
          finished();
          return;
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          gone();
          return;
        }
        // the socket replays everything from 0, so it can still fill in the run
      }

      // replay from 0 so the comparisons feed and standings are complete after a refresh
      startFollowing(0);
    };

    void attach();
    return () => {
      cancelled = true;
      cancelledRef.current = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [stored.runId]);

  // tick the clock while a run is going, so a stall shows up without a new event
  const isRunning = state.status === "running";
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const stalled = isRunning && now - lastActivity >= STALL_MS;
  const canResume = mode === "saved" && (state.status === "failed" || stalled);

  // no event for a while (any mode): re-read the run, at most once per STALL_MS
  useEffect(() => {
    if (!stalled || now - lastRefreshRef.current < STALL_MS) return;
    lastRefreshRef.current = now;
    refreshAfterStall();
  }, [stalled, now]);

  const canDelete =
    state.status === "completed" || state.status === "failed" || state.status === "interrupted";

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setDeleteError("Please log in again to delete the run.");
        return;
      }
      await deleteRanking(accessToken, stored.runId);
      if (cancelledRef.current) return;
      socketRef.current?.close();
      onGone();
    } catch (error) {
      if (cancelledRef.current) return;
      if (error instanceof ApiError && error.status === 404) {
        onGone();
        return;
      }
      setDeleteError(
        error instanceof ApiError ? error.message : "Couldn't delete the run. Please try again.",
      );
    } finally {
      if (!cancelledRef.current) setIsDeleting(false);
    }
  };

  const handleResume = async () => {
    if (isResuming) return;
    if (!openaiKey) {
      setResumeError("Add your OpenAI key above to resume the run.");
      return;
    }
    setIsResuming(true);
    setResumeError("");
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setResumeError("Please log in again to resume the run.");
        return;
      }
      // events after the last one we know about are the resumed run's; subscribe from there
      const fromSeq = Math.max(lastSeqRef.current, socketRef.current?.lastSeq ?? 0);
      try {
        await resumeRanking(accessToken, openaiKey, stored.runId);
        if (cancelledRef.current) return;
        dispatch({ type: "resumed" });
        onResumed();
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 409)) throw error;
        // 409: completed, already running, or private - refresh what the server says
        const { run, lastSeq } = await getRanking(accessToken, stored.runId);
        if (cancelledRef.current) return;
        setMode(run.mode);
        if (run.status === "running" || run.status === "queued") {
          dispatch({ type: "resumed" });
          onResumed();
        } else if (run.status === "completed") {
          dispatch({ type: "resumed" });
          dispatch({ type: "snapshot", run, lastSeq });
          lastSeqRef.current = Math.max(lastSeqRef.current, lastSeq);
          socketRef.current?.close();
          onFinished();
          return;
        } else {
          setResumeError(error.message);
          return;
        }
      }
      // keep (or get back) a live subscription for the resumed run's events
      const socket = socketRef.current;
      if (!socket || socket.status === "closed") follow(fromSeq);
      else setLastActivity(Date.now());
    } catch (error) {
      if (cancelledRef.current) return;
      setResumeError(
        error instanceof ApiError ? error.message : "Couldn't resume the run. Please try again.",
      );
    } finally {
      if (!cancelledRef.current) setIsResuming(false);
    }
  };

  return (
    <>
      <RunDetails state={state} stored={stored} connection={connection} problem={problem} />
      {canResume && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <p className="text-xs text-[#5f6b61]">
            {state.status === "failed"
              ? "This saved run stopped. Resume it to finish the remaining comparisons."
              : "No progress for a while. If the server restarted, resume the run to continue where it left off."}
          </p>
          <Button variant="secondary" onClick={handleResume} disabled={isResuming}>
            {isResuming ? "Resuming..." : "Resume run"}
          </Button>
        </div>
      )}
      {resumeError && <p className="mt-2 text-sm font-semibold text-red-700">{resumeError}</p>}
      {canDelete && (
        <div className="mt-3 text-right">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-xs text-green-700 underline underline-offset-2 hover:opacity-70 disabled:opacity-50"
            title="Permanently delete this run's stored comparisons and result"
          >
            {isDeleting ? "Deleting..." : "Delete run"}
          </button>
        </div>
      )}
      {deleteError && <p className="mt-2 text-sm font-semibold text-red-700">{deleteError}</p>}
    </>
  );
}

const STATUS_TEXT: Record<RankingViewState["status"], string> = {
  loading: "Connecting...",
  queued: "Waiting to start...",
  running: "Comparing candidates...",
  completed: "Done",
  failed: "Stopped",
  interrupted: "Interrupted",
};

function RunDetails({
  state,
  stored,
  connection,
  problem,
}: {
  state: RankingViewState;
  stored: StoredRankingRun;
  connection: SocketStatus;
  problem: string;
}) {
  const label = (id: string) => stored.labels[id] ?? "Candidate";
  const percent = state.totalTasks > 0 ? (state.completedTasks / state.totalTasks) * 100 : 0;
  const relative = relativeStrength(state.strengths);
  const recent = state.comparisons.slice(-RECENT_COMPARISONS).reverse();
  const isActive = state.status === "loading" || state.status === "queued" || state.status === "running";

  return (
    <div className="mt-5 border-t border-green-900/10 pt-4">
      <div className="flex items-center justify-between gap-3 text-xs text-[#4f5f52]">
        <span className="flex items-center gap-2">
          {isActive && connection !== "reconnecting" && <Loading />}
          {STATUS_TEXT[state.status]}
          <span className="opacity-70">
            ({stored.rounds} {stored.rounds === 1 ? "round" : "rounds"})
          </span>
        </span>
        <span>
          {state.completedTasks} of {state.totalTasks || "?"} comparisons
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-green-900/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={state.totalTasks}
        aria-valuenow={state.completedTasks}
      >
        <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${percent}%` }} />
      </div>

      {isActive && connection === "reconnecting" && (
        <p className="mt-2 flex items-center gap-2 text-xs font-medium text-yellow-800">
          <Loading /> Reconnecting... the run continues on the server and picks up where it left off.
        </p>
      )}
      {problem && <p className="mt-2 text-sm font-semibold text-red-700">{problem}</p>}
      {state.status === "failed" && state.error && (
        <p className="mt-2 text-sm font-semibold text-red-700">{state.error}</p>
      )}
      {state.status === "interrupted" && (
        <p className="mt-2 text-sm font-semibold text-red-700">
          The server restarted during this run, so it stopped. Please run it again.
        </p>
      )}

      {state.strengths.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm text-[#4f5f52]">
            <thead>
              <tr className="text-left text-xs uppercase text-green-950">
                <th className="py-1 pr-3 font-semibold">#</th>
                <th className="py-1 pr-3 font-semibold">Candidate</th>
                <th className="py-1 pr-3 font-semibold" title="Strength relative to the strongest candidate">
                  Strength
                </th>
                <th className="py-1 font-semibold" title="Wins - losses - ties">
                  W-L-T
                </th>
              </tr>
            </thead>
            <tbody>
              {state.strengths.map((strength, index) => {
                const value = relative.get(strength.id) ?? 0;
                return (
                  <tr key={strength.id} className="border-t border-green-900/10">
                    <td className="py-2 pr-3 font-semibold text-green-950">{index + 1}</td>
                    <td className="max-w-[16rem] truncate py-2 pr-3">{label(strength.id)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="w-10 text-xs font-semibold text-green-950">
                          {Math.round(value)}%
                        </span>
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-green-900/10">
                          <div className="h-full rounded-full bg-green-600" style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-2 text-xs">
                      {strength.wins}-{strength.losses}-{strength.ties}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-[#5f6b61]">
            Strength is relative to the strongest candidate (100%).
          </p>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-green-950">Recent comparisons</p>
          <ul className="mt-1 space-y-2">
            {recent.map((comparison) => {
              const a = label(comparison.task.a);
              const b = label(comparison.task.b);
              const verdict =
                comparison.winner === "tie"
                  ? "Tie"
                  : `${comparison.winner === "a" ? a : b} preferred`;
              return (
                <li key={comparison.seq} className="text-xs text-[#4f5f52]">
                  <span className="font-medium text-green-950">
                    {a} vs {b}:
                  </span>{" "}
                  {verdict}
                  {comparison.reason ? (
                    <span className="block pl-1 italic">“{comparison.reason}”</span>
                  ) : (
                    comparison.reason === null && (
                      <span className="block pl-1 opacity-60">(reason not stored for private runs)</span>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {state.status === "completed" && state.result && (
        <OrderNote stored={stored} pairwiseOrder={state.result.strengths.map((s) => s.id)} />
      )}
    </div>
  );
}

// how the pairwise order compares with the score order the recruiter already sees
function OrderNote({ stored, pairwiseOrder }: { stored: StoredRankingRun; pairwiseOrder: string[] }) {
  const comparison = compareOrders(pairwiseOrder, stored.scoreOrder);
  const label = (id: string) => stored.labels[id] ?? "Candidate";
  const total = pairwiseOrder.length;
  const identical = comparison.samePlace === total;

  let agreement: string;
  if (identical) agreement = "The pairwise order matches the score order exactly.";
  else if (comparison.tau >= 0.6) agreement = "The pairwise order mostly agrees with the score order.";
  else if (comparison.tau >= 0.2) agreement = "The pairwise order partly agrees with the score order.";
  else agreement = "The pairwise order differs a lot from the score order.";

  const move = comparison.biggestMove;

  return (
    <div className="mt-4 rounded-md border border-green-900/10 bg-[#f4faf3] p-3 text-xs text-[#4f5f52]">
      <p className="font-semibold text-green-950">Compared with the score order</p>
      <p className="mt-1">
        {agreement} {comparison.samePlace} of {total} candidates hold the same place
        (rank agreement {comparison.tau.toFixed(2)}, where 1 is identical and -1 is reversed).
      </p>
      {!identical && (
        <p className="mt-1">
          {comparison.sameTop
            ? `Both put ${label(pairwiseOrder[0])} first.`
            : `Pairwise puts ${label(pairwiseOrder[0])} first; by score it's ${label(stored.scoreOrder[0])}.`}
          {move &&
            ` The biggest change: ${label(move.id)} is #${move.pairwiseRank} pairwise and #${move.scoreRank} by score (${stored.scores[move.id] ?? "?"}%).`}
        </p>
      )}
      <p className="mt-1">
        Where the two disagree, read both candidates' details before deciding. Both are review
        aids; you make the hiring decisions.
      </p>
    </div>
  );
}

export default PairwiseRanking;
