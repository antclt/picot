// ABOUTME: Coordinates user-requested context compaction across independent UI entry points.
// ABOUTME: Distinguishes request acknowledgement from Pi's actual lifecycle completion event.

const DEFAULT_TIMEOUT_MS = 60_000;

export function createCompactCoordinator({
  send,
  onState = () => {},
  onTimeout = () => {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let state = "idle";
  let watchdog = null;

  function clearWatchdog() {
    if (watchdog !== null) {
      clearTimer(watchdog);
      watchdog = null;
    }
  }

  function armWatchdog() {
    clearWatchdog();
    if (!(timeoutMs > 0)) return;
    watchdog = setTimer(() => {
      watchdog = null;
      // Pi never sent compaction_start/compaction_end (hung process, dropped
      // connection). Without this, the UI would spin on "Compacting..." forever.
      setState("idle");
      onTimeout();
    }, timeoutMs);
  }

  function setState(nextState) {
    state = nextState;
    onState(state);
  }

  return {
    get state() {
      return state;
    },
    get busy() {
      return state === "requested" || state === "running";
    },
    request() {
      if (state !== "idle") return Promise.resolve(false);
      setState("requested");
      armWatchdog();
      return Promise.resolve(send())
        .then((response) => {
          if (response?.success === false) {
            clearWatchdog();
            setState("idle");
            return false;
          }
          return true;
        })
        .catch(() => {
          clearWatchdog();
          setState("idle");
          return false;
        });
    },
    started() {
      if (state === "idle" || state === "requested") {
        setState("running");
        armWatchdog();
      }
    },
    ended({ success, error } = {}) {
      if (state === "idle") return false;
      clearWatchdog();
      setState("idle");
      return success !== false && !error;
    },
    reset() {
      if (state !== "idle") {
        clearWatchdog();
        setState("idle");
      }
    },
  };
}
