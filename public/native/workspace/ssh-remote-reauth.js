// ABOUTME: Detects an ssh-remote disconnect notify and reopens the connect dialog on it.
// ABOUTME: Otherwise a workspace whose host went away just fails until someone finds the header pill.

import { markProjectDisconnected } from "./project-connection-status.js";

/**
 * Mirrors the same-named constants in extensions/ssh-remote.ts. There is no
 * module shared between the extension host and the webview, so these are
 * kept in sync by hand — both sides are small and rarely touched.
 *
 * Why markers instead of matching the English text: `ctx.ui.notify` prose
 * should stay free to change for humans without silently breaking the one
 * thing here that has to match on it exactly.
 *
 * `SSH_AUTH_REQUIRED_MARKER` means "reopen the connect dialog right now" —
 * only attached to a notify that is a direct response to a live send
 * attempt. `SSH_PROJECT_DISCONNECTED_MARKER` means "this project's SSH
 * binding is down" — attached to every disconnect notify, including one
 * from a session just starting up, which must NOT pop the dialog on its own.
 */
export const SSH_AUTH_REQUIRED_MARKER = "[picot:ssh-auth-required]";
export const SSH_PROJECT_DISCONNECTED_MARKER = "[picot:ssh-project-disconnected]";

export function isSshAuthFailureMessage(message) {
  return typeof message === "string" && message.includes(SSH_AUTH_REQUIRED_MARKER);
}

export function isSshProjectDisconnectedMessage(message) {
  return typeof message === "string" && message.includes(SSH_PROJECT_DISCONNECTED_MARKER);
}

/**
 * Build a `notify` handler that:
 *  - records this project as SSH-disconnected (badges its sidebar entry, and
 *    lets every other session of it skip re-probing) whenever any session
 *    reports one, and
 *  - reopens the remote-workspace connect dialog only when the failure was a
 *    direct response to a live send attempt — never on session startup.
 *
 * Call the returned function with every `notify` request; it returns `true`
 * when it handled the notification (an ssh-remote disconnect of either kind)
 * so the caller can skip rendering the raw system message — the dialog's own
 * status banner (or the sidebar badge) explains the failure without the
 * marker text leaking into chat.
 *
 * @param {object} options
 * @param {(op: string, params?: object) => Promise<{ok: boolean, data?: object}>} options.call
 *   config-gateway call, used to confirm the active project is still bound to
 *   a host (and to fetch that binding to prefill) before touching the UI —
 *   the marker alone only says auth failed, not what to reconnect to.
 * @param {{ open: (opts?: object) => void, isOpen?: () => boolean }} options.dialog
 *   normally the object `setupRemoteWorkspaceDialog` returns.
 * @param {() => string} [options.getProjectPath] returns the local project
 *   path of whichever session this notify came from — the key
 *   project-connection-status.js tracks by. Only the currently active
 *   session's pi process feeds notifies into this window, so this is just
 *   the active workspace's path at the time the notify arrives.
 * @param {() => string} [options.reauthMessage] returns the status banner
 *   text, evaluated lazily so it can go through i18n's `t()` at call time.
 * @param {number} [options.cooldownMs] minimum gap between auto-reopens, so a
 *   burst of failing tool calls from one dead connection cannot reopen the
 *   dialog out from under someone who is already retyping the password.
 */
export function createSshAuthFailureHandler({
  call,
  dialog,
  getProjectPath,
  reauthMessage,
  cooldownMs = 4000,
} = {}) {
  let cooldownUntil = 0;

  return function handleNotify(request) {
    if (request?.notifyType !== "error") return false;
    const projectDisconnected = isSshProjectDisconnectedMessage(request.message);
    const authRequired = isSshAuthFailureMessage(request.message);
    if (!projectDisconnected && !authRequired) return false;
    if (projectDisconnected) {
      const projectPath = getProjectPath?.();
      if (projectPath) markProjectDisconnected(projectPath, request.message);
    }
    if (!authRequired) return true;
    if (dialog?.isOpen?.()) return true;
    const now = Date.now();
    if (now < cooldownUntil) return true;
    cooldownUntil = now + cooldownMs;
    void openReconnectDialog({ call, dialog, reauthMessage, projectPath: getProjectPath?.() });
    return true;
  };
}

/**
 * Reopen the connect dialog, prefilled from the given project's (or the
 * active workspace's, when `projectPath` is omitted) current SSH binding.
 * Exported so a direct send-time gate (composer submit) can trigger the same
 * dialog without going through a notify first — see project-connection-status.js.
 */
export async function openReconnectDialog({ call, dialog, reauthMessage, projectPath }) {
  try {
    const result = await call?.("get_ssh_remote_config");
    const binding = result?.data?.config ?? result?.data?.resolved;
    if (!result?.ok || !binding?.enabled) return;
    dialog?.open({ prefill: binding, statusMessage: reauthMessage?.(), projectPath });
  } catch {
    // Best effort — if this project's binding can't even be read back, there
    // is nothing to prefill the dialog with beyond what the user can already
    // reach through the header pill.
  }
}
