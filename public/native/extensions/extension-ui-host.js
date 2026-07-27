const BLOCKING_METHODS = new Set(["select", "confirm", "input", "editor"]);

export function renderExtensionText(element, value) {
  element.textContent = String(value ?? "");
}

export class ExtensionUiHost {
  #foregroundSessionId = null;
  #hooks;
  #queues = new Map();
  #inFlight = new Map(); // sessionId → abort()
  #runtime;
  #showDialog;
  #showInlinePrompt;

  constructor({
    runtime,
    showDialog = async () => ({ cancelled: true }),
    showInlinePrompt = () => null,
    hooks = {},
  }) {
    this.#runtime = runtime;
    this.#showDialog = showDialog;
    this.#showInlinePrompt = showInlinePrompt;
    this.#hooks = hooks;
  }

  pendingCount(sessionId) {
    return this.#queues.get(sessionId)?.length ?? 0;
  }

  /**
   * Switch the foreground session and abort any in-flight dialog for the
   * previous session (re-queuing it).
   *
   * @param {string} sessionId
   * @param {{ flush?: boolean }} [options]
   *   flush (default true) — drain the new session’s queue immediately.
   *   Pass { flush: false } from adoptTarget() so that renderHistory() can
   *   clear the messages container before the inline card is inserted; then
   *   call flushForegroundQueue() after the final render pass.
   */
  async setForegroundSession(sessionId, { flush = true } = {}) {
    const oldId = this.#foregroundSessionId;
    this.#foregroundSessionId = sessionId;
    // Abort any in-flight dialog for the previous session so it gets re-queued
    // and shown again when the user returns to that session.
    if (oldId && oldId !== sessionId) {
      const abort = this.#inFlight.get(oldId);
      if (abort) abort();
    }
    if (flush) await this.flushForegroundQueue();
  }

  /**
   * Drain queued prompts for the current foreground session.
   * Call this AFTER the final renderHistory() so inline cards are not
   * immediately destroyed by a subsequent clear().
   */
  async flushForegroundQueue() {
    // Yield a microtask so any abort-triggered re-queues can land first.
    await Promise.resolve();
    const sessionId = this.#foregroundSessionId;
    if (!sessionId) return;
    const queue = this.#queues.get(sessionId) ?? [];
    this.#queues.delete(sessionId);
    for (const pending of queue) await this.#showAndRespond(pending.target, pending.request);
  }

  async handle(target, request) {
    if (request?.type !== "extension_ui_request" || !request.id || !request.method) return;
    if (BLOCKING_METHODS.has(request.method)) {
      if (target.sessionId !== this.#foregroundSessionId) {
        const queue = this.#queues.get(target.sessionId) ?? [];
        queue.push({ target: structuredClone(target), request: structuredClone(request) });
        this.#queues.set(target.sessionId, queue);
        return;
      }
      await this.#showAndRespond(target, request);
      return;
    }
    switch (request.method) {
      case "notify":
        this.#hooks.notify?.(request);
        break;
      case "setStatus":
        this.#hooks.status?.(request);
        break;
      case "setWidget":
        this.#hooks.widget?.(request);
        break;
      case "setTitle":
        this.#hooks.title?.(request);
        break;
      case "set_editor_text":
        this.#hooks.editorText?.(request);
        break;
      default:
        await this.#runtime.request(
          {
            type: "extension_ui_response",
            id: request.id,
            cancelled: true,
            error: "unsupported",
          },
          target,
        );
    }
  }

  async cancelSession(target) {
    const queue = this.#queues.get(target.sessionId) ?? [];
    this.#queues.delete(target.sessionId);
    for (const pending of queue) {
      await this.#runtime.request(
        { type: "extension_ui_response", id: pending.request.id, cancelled: true },
        pending.target,
      );
    }
  }

  async #showAndRespond(target, request) {
    // Create a dismiss signal so an external abort can resolve the dialog.
    let triggerDismiss;
    const dismissSignal = new Promise((resolve) => {
      triggerDismiss = resolve;
    });
    // Track whether this dialog was aborted (session switched away).
    let requeued = false;
    this.#inFlight.set(target.sessionId, () => {
      requeued = true;
      triggerDismiss();
    });
    let result;
    try {
      const inlineResult = this.#showInlinePrompt(structuredClone(request), { dismissSignal });
      result = inlineResult
        ? await inlineResult
        : await this.#showDialog(structuredClone(request), { dismissSignal });
    } catch {
      result = { cancelled: true };
    }
    this.#inFlight.delete(target.sessionId);
    if (requeued) {
      // Re-queue the request; it will be shown when the session regains focus.
      const queue = this.#queues.get(target.sessionId) ?? [];
      queue.unshift({ target: structuredClone(target), request: structuredClone(request) });
      this.#queues.set(target.sessionId, queue);
      return;
    }
    const response = {
      type: "extension_ui_response",
      id: request.id,
      ...(result && typeof result === "object" ? result : { cancelled: true }),
    };
    await this.#runtime.request(response, target);
  }
}
