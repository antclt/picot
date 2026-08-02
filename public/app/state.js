// Minimal stub for StateManager to satisfy imports during tests.
// The real implementation lives elsewhere; for unit tests we only need
// the interface used by the frontend code that runs during import.

export class StateManager {
  constructor() {
    // Streaming flag used by UI components to show/hide loading indicators.
    this._isStreaming = false;
  }

  // Getter / setter used throughout the codebase.
  get isStreaming() {
    return this._isStreaming;
  }

  setStreaming(val) {
    this._isStreaming = Boolean(val);
  }

  // The following methods are placeholders for the full state API. They are
  // defined as no-ops to avoid runtime errors if accessed during tests.
  setAutoRetrying(_val) {}
  setLastTurnErrored(_val) {}
  setContextWindowSize(_size) {}
  setSessionTotalCost(_cost) {}
  // Add any additional methods that might be called in the future as empty
  // functions to keep the stub safe.
}
