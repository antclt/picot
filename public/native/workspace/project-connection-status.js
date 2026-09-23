// ABOUTME: In-memory, project-scoped SSH connection status shared across every
// ABOUTME: session of the same project within this app run (cleared on relaunch).

/**
 * Each session of an SSH-remote project runs its own `pi` process with its
 * own connection state (see `binding`/`resolved` in extensions/ssh-remote.ts)
 * — one session discovering the host is unreachable says nothing to the
 * others. This module is the one thing all of them share: the webview they
 * all render into. When any session reports a disconnect, every other
 * session of the same project (open or not yet opened) sees it here before
 * it would waste time re-probing a host that is already known to be down.
 *
 * Deliberately not persisted: a fresh app launch should re-probe rather than
 * carry forward a badge for a host that may be back by then.
 */

/** @type {Map<string, { message: string }>} projectPath -> disconnect info */
const disconnected = new Map();
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

/** Record that `projectPath` cannot currently reach its SSH host. Idempotent. */
export function markProjectDisconnected(projectPath, message = "") {
  if (!projectPath) return;
  const existing = disconnected.get(projectPath);
  if (existing && existing.message === message) return;
  disconnected.set(projectPath, { message });
  notify();
}

/** Clear the disconnected mark for `projectPath` (a reconnect succeeded). */
export function markProjectConnected(projectPath) {
  if (!projectPath || !disconnected.has(projectPath)) return;
  disconnected.delete(projectPath);
  notify();
}

export function isProjectDisconnected(projectPath) {
  return Boolean(projectPath) && disconnected.has(projectPath);
}

export function getProjectDisconnectInfo(projectPath) {
  return projectPath ? (disconnected.get(projectPath) ?? null) : null;
}

/** @param {() => void} listener @returns {() => void} unsubscribe */
export function subscribeProjectConnectionStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
