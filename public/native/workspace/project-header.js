/**
 * project-header — populates the chat header with workspace path and git
 * branch info fetched from the host data plane.
 *
 * Responsibilities:
 *  - Show the full workspace path in the #workspace-indicator pill.
 *  - Show the current git branch in the #git-branch-indicator pill.
 *  - Both pills are hidden when data is unavailable.
 */

/**
 * @param {object} options
 * @param {import('./data-gateway.js').HostDataGateway} options.data
 * @param {string} options.workspaceId
 */
export async function setupProjectHeader({ data, workspaceId }) {
  const workspaceEl = document.getElementById("workspace-indicator");
  // #git-branch-indicator is the label span inside #diff-sidebar-toggle.
  // The toggle button itself carries the hidden class and is shown only when
  // git info is available.
  const branchLabelEl = document.getElementById("git-branch-indicator");
  const diffToggleEl = branchLabelEl?.closest("#diff-sidebar-toggle");
  if (!workspaceEl && !branchLabelEl) return;

  let info;
  try {
    const response = await data.workspaceInfo(workspaceId);
    info = response?.info;
  } catch {
    // Network or host error — leave pills hidden.
    return;
  }
  if (!info) return;

  if (workspaceEl && info.path) {
    workspaceEl.textContent = info.path;
    workspaceEl.title = info.path;
    workspaceEl.classList.remove("hidden");
  }

  if (diffToggleEl) {
    if (info.gitBranch) {
      if (branchLabelEl) branchLabelEl.textContent = info.gitBranch;
      diffToggleEl.title = `Git changes — ${info.gitBranch}`;
      diffToggleEl.classList.remove("hidden");
    } else {
      diffToggleEl.classList.add("hidden");
    }
  }
}
