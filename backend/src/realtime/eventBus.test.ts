// Tests for the in-process event bus: delivery is per run, unsubscribe works, and the wire
// format can't be overridden by a payload.

import { listenerCount, publish, subscribe, toWireEvent } from "./eventBus";

describe("eventBus", () => {
  it("delivers events only to the run's subscribers, until they unsubscribe", () => {
    const runA = jest.fn();
    const runB = jest.fn();
    const stopA = subscribe("run-a", runA);
    const stopB = subscribe("run-b", runB);

    const event = { runId: "run-a", seq: 1, type: "run_started" as const, payload: { totalTasks: 3 } };
    publish(event);

    expect(runA).toHaveBeenCalledWith(event);
    expect(runB).not.toHaveBeenCalled();

    stopA();
    publish({ ...event, seq: 2 });
    expect(runA).toHaveBeenCalledTimes(1);
    expect(listenerCount("run-a")).toBe(0);

    stopB();
    expect(listenerCount("run-b")).toBe(0);
  });

  it("flattens the payload into the wire event, keeping type/runId/seq authoritative", () => {
    const wire = toWireEvent({
      runId: "run-a",
      seq: 5,
      type: "standings",
      payload: { strengths: [], seq: 999, type: "spoof", runId: "other" },
    });

    expect(wire).toEqual({ strengths: [], type: "standings", runId: "run-a", seq: 5 });
  });
});
