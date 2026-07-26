// ABOUTME: URL-scoped focus state machine for the workspace Focus mode.
// ABOUTME: The focusWorkspaceId query parameter is the only cross-port channel;
// ABOUTME: it carries the workspace identifier (`workspace:<path>`) as an
// ABOUTME: untrusted string and is never used as a filesystem path.
export const FOCUS_WORKSPACE_PARAM = "focusWorkspaceId";

export function workspaceFocusId(project) {
  return `workspace:${project?.path ?? ""}`;
}

// Returns a URL that carries focusWorkspaceId only when the navigation target
// cwd equals the focused project's canonical path. Any prior focus param is
// stripped first, so a stale or cross-workspace navigation clears focus.
export function withFocusParam(targetCwd, focusProject, url) {
  const result = new URL(url, "http://localhost");
  result.searchParams.delete(FOCUS_WORKSPACE_PARAM);
  if (focusProject && typeof focusProject.path === "string" && targetCwd === focusProject.path) {
    result.searchParams.set(FOCUS_WORKSPACE_PARAM, workspaceFocusId(focusProject));
  }
  return result;
}

export function clearFocusParam(url) {
  const result = new URL(url, "http://localhost");
  result.searchParams.delete(FOCUS_WORKSPACE_PARAM);
  return result;
}

function findActiveProject(projects, activeSessionFile) {
  if (!Array.isArray(projects) || !activeSessionFile) return null;
  return (
    projects.find(
      (project) =>
        Array.isArray(project?.sessions) &&
        project.sessions.some((session) => session?.filePath === activeSessionFile),
    ) || null
  );
}

// Resolves the boot/update focus decision. pending while the active session or
// its project is still unknown (so a freshly created session with no .jsonl yet
// does not falsely exit focus); matched only when the resolved active workspace
// equals the requested id; mismatched otherwise (including no request at all).
export function resolveFocusState({ requestedId, projects, activeSessionFile }) {
  if (!requestedId) return { state: "mismatched", project: null };
  const project = findActiveProject(projects, activeSessionFile);
  if (!project) return { state: "pending", project: null };
  return workspaceFocusId(project) === requestedId
    ? { state: "matched", project }
    : { state: "mismatched", project: null };
}
