import { selectSuperAgentSessionToLaunch } from "./autolaunch.js";
import { isSuperAgentProjectPath } from "./session.js";

export function hasSuperAgentSession(sessions = []) {
  return (sessions ?? []).some(
    (session) => session?.kind === "super-agent" || isSuperAgentProjectPath(session?.projectPath),
  );
}

export function selectSuperAgentStartupAction({
  enabled = false,
  sessions = [],
  currentSessionId = "",
  alreadyLaunched = false,
} = {}) {
  if (!enabled) return { type: "none" };
  if (!hasSuperAgentSession(sessions)) return { type: "ensure" };

  const session = selectSuperAgentSessionToLaunch({
    alreadyLaunched,
    enabled,
    sessions,
    currentSessionId,
  });
  return session ? { type: "launch", session } : { type: "none" };
}
