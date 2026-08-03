// ABOUTME: Focus mode sidebar that replaces the full session list with a single-project view.
// ABOUTME: Shows only the focused workspace's sessions + workspace info card (branch, path, counts).

import { onLocaleChange, t } from "../../i18n.js";

const VISIBLE_INITIAL = 10;

export class FocusSidebar {
  constructor(container, { project, sessions, activeSessionFile, onSessionSelect, data, workspaceId } = {}) {
    this.container = container;
    this.project = project;
    this.sessions = sessions || [];
    this.activeSessionFile = activeSessionFile || null;
    this.onSessionSelect = onSessionSelect || (() => {});
    this.data = data;
    this.workspaceId = workspaceId;
    this.visibleCount = VISIBLE_INITIAL;
    this.unsubscribeLocale = onLocaleChange(() => this.render());
  }

  setActiveSession(sessionFile) {
    this.activeSessionFile = sessionFile;
    this.render();
  }

  updateSessions(sessions) {
    this.sessions = sessions || [];
    this.visibleCount = VISIBLE_INITIAL;
    this.render();
  }

  destroy() {
    this.unsubscribeLocale?.();
    this.container?.replaceChildren();
  }

  async render() {
    if (!this.container) return;
    this.container.replaceChildren();

    // Workspace info card (hover-style quick info)
    const infoCard = document.createElement("div");
    infoCard.className = "focus-info-card";
    let branch = "";
    let path = this.project?.path || "";
    if (this.data && this.workspaceId) {
      try {
        const response = await this.data.workspaceInfo(this.workspaceId);
        const info = response?.info;
        if (info?.gitBranch) branch = info.gitBranch;
        if (info?.path) path = info.path;
      } catch { /* leave defaults */ }
    }

    const pathEl = document.createElement("div");
    pathEl.className = "focus-info-path";
    pathEl.textContent = path;
    pathEl.title = path;
    infoCard.appendChild(pathEl);

    if (branch) {
      const branchEl = document.createElement("div");
      branchEl.className = "focus-info-branch";
      branchEl.textContent = `⎇ ${branch}`;
      infoCard.appendChild(branchEl);
    }

    const countEl = document.createElement("div");
    countEl.className = "focus-info-count";
    countEl.textContent = `${this.sessions.length} sessions`;
    infoCard.appendChild(countEl);

    this.container.appendChild(infoCard);

    // Session list (only this project's sessions)
    const list = document.createElement("div");
    list.className = "focus-session-list";
    const visible = this.sessions.slice(0, this.visibleCount);
    for (const session of visible) {
      list.appendChild(this.#buildSessionRow(session));
    }
    if (this.sessions.length > this.visibleCount) {
      const more = document.createElement("button");
      more.className = "focus-show-more";
      more.textContent = `${t("sidebar.showMore")} (${this.sessions.length - this.visibleCount})`;
      more.addEventListener("click", () => {
        this.visibleCount = this.sessions.length;
        this.render();
      });
      list.appendChild(more);
    }
    if (this.sessions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "focus-empty";
      empty.textContent = t("sidebar.emptySession") || "No sessions";
      list.appendChild(empty);
    }
    this.container.appendChild(list);
  }

  #buildSessionRow(session) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `focus-session-row${
      session.filePath === this.activeSessionFile ? " active" : ""
    }`;
    const name = document.createElement("span");
    name.className = "focus-session-name";
    name.textContent = session.name || session.id?.slice(0, 8) || "Untitled";
    row.appendChild(name);
    if (session.firstMessage) {
      const preview = document.createElement("span");
      preview.className = "focus-session-preview";
      preview.textContent = session.firstMessage.slice(0, 80);
      row.appendChild(preview);
    }
    row.addEventListener("click", () => this.onSessionSelect(session));
    return row;
  }
}
