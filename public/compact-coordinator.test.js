// ABOUTME: Verifies that manual context compaction has one lifecycle across every UI entry.
// ABOUTME: Prevents an RPC acknowledgement from being mistaken for compaction completion.
import { describe, expect, it, vi } from "vitest";
import { createCompactCoordinator } from "./compact-coordinator.js";

describe("createCompactCoordinator", () => {
  it("keeps the request busy after acknowledgement until lifecycle completion", async () => {
    const send = vi.fn(async () => ({ success: true }));
    const states = [];
    const coordinator = createCompactCoordinator({ send, onState: (state) => states.push(state) });

    await coordinator.request();

    expect(send).toHaveBeenCalledTimes(1);
    expect(coordinator.state).toBe("requested");
    expect(states).toEqual(["requested"]);
    coordinator.started();
    expect(coordinator.state).toBe("running");
    expect(coordinator.ended({ success: true })).toBe(true);
    expect(coordinator.state).toBe("idle");
  });

  it("deduplicates requests and restores idle when the request fails", async () => {
    let reject;
    const send = vi.fn(
      () =>
        new Promise((_, rejectRequest) => {
          reject = rejectRequest;
        }),
    );
    const coordinator = createCompactCoordinator({ send });

    const pending = coordinator.request();
    await expect(coordinator.request()).resolves.toBe(false);
    reject(new Error("offline"));

    await expect(pending).resolves.toBe(false);
    expect(coordinator.state).toBe("idle");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reports failed completion without treating it as successful", async () => {
    const coordinator = createCompactCoordinator({ send: async () => ({ success: true }) });
    await coordinator.request();

    expect(coordinator.ended({ success: false, error: "Pi refused" })).toBe(false);
    expect(coordinator.state).toBe("idle");
  });

  it("locks manual actions when Pi starts an automatic compaction", () => {
    const coordinator = createCompactCoordinator({ send: async () => ({ success: true }) });

    coordinator.started();

    expect(coordinator.state).toBe("running");
    expect(coordinator.busy).toBe(true);
  });

  it("falls back to idle and notifies if compaction_start/compaction_end never arrive", async () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const coordinator = createCompactCoordinator({
        send: async () => ({ success: true }),
        onTimeout,
        timeoutMs: 1000,
      });

      await coordinator.request();
      expect(coordinator.state).toBe("requested");

      await vi.advanceTimersByTimeAsync(1000);

      expect(coordinator.state).toBe("idle");
      expect(coordinator.busy).toBe(false);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets the watchdog timer when the lifecycle progresses normally", async () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const coordinator = createCompactCoordinator({
        send: async () => ({ success: true }),
        onTimeout,
        timeoutMs: 1000,
      });

      await coordinator.request();
      coordinator.started();
      coordinator.ended({ success: true });

      await vi.advanceTimersByTimeAsync(5000);

      expect(onTimeout).not.toHaveBeenCalled();
      expect(coordinator.state).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reset() clears a pending watchdog without firing onTimeout", async () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const coordinator = createCompactCoordinator({
        send: async () => ({ success: true }),
        onTimeout,
        timeoutMs: 1000,
      });

      await coordinator.request();
      coordinator.reset();

      await vi.advanceTimersByTimeAsync(5000);

      expect(onTimeout).not.toHaveBeenCalled();
      expect(coordinator.state).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });
});
