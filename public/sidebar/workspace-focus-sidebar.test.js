// ABOUTME: Tests for the WorkspaceFocusSidebar task-workbench renderer.
// ABOUTME: Covers back/new-task/select/delete, full default expansion, and toggle.
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { initI18n } from "../i18n.js";
import { WorkspaceFocusSidebar } from "./workspace-focus-sidebar.js";

function setupDom() {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3001" });
  globalThis.document = dom.window.document;
}

function fakeBuilder() {
  return vi.fn((opts) => {
    const item = document.createElement("div");
    item.className = "session-item";
    item.dataset.filePath = opts.session.filePath;
    if (opts.isActive) item.classList.add("active");
    item.addEventListener("click", () => opts.onSelect?.(opts.session, opts.project));
    if (opts.showDeleteButton) {
      const del = document.createElement("button");
      del.className = "session-delete-btn";
      del.addEventListener("click", () => opts.onDelete?.(opts.session.filePath));
      item.appendChild(del);
    }
    return item;
  });
}

beforeEach(async () => {
  setupDom();
  global.fetch = vi.fn(async (url) => {
    if (String(url).includes("/locales/en.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          workspace: { back: "Back", newTask: "New Task", showMore: "Show more" },
          sidebar: { emptySession: "Empty", showLess: "Show less" },
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  await initI18n();
});

function makeSessions(n) {
  return Array.from({ length: n }, (_, i) => ({ filePath: `/s/${i}.jsonl`, name: `S${i}` }));
}

function makeSidebar(overrides = {}) {
  const sessions = overrides.sessions ?? makeSessions(2);
  return new WorkspaceFocusSidebar(document.getElementById("root"), {
    project: { path: "/work/alpha", sessions, ...overrides.project },
    activeSessionFile: overrides.activeSessionFile,
    isArchived: overrides.isArchived,
    buildSessionItem: fakeBuilder(),
    onBack: overrides.onBack,
    onNewTask: overrides.onNewTask,
    onSessionSelect: overrides.onSessionSelect,
    onDelete: overrides.onDelete,
  });
}

describe("WorkspaceFocusSidebar", () => {
  test("back button fires onBack", () => {
    const onBack = vi.fn();
    const sidebar = makeSidebar({ onBack });
    sidebar.render();
    sidebar.container.querySelector(".focus-back-btn").click();
    expect(onBack).toHaveBeenCalled();
  });

  test("workspace info card shows folder, path, and count without pin", () => {
    const sidebar = makeSidebar({ sessions: makeSessions(3) });
    sidebar.cardInfo = { folder: "alpha", path: "/work/alpha", count: 3 };
    sidebar.render();
    const card = sidebar.container.querySelector(".workspace-focus-card");
    expect(card).toBeTruthy();
    expect(card.querySelector(".wqi-folder-name").textContent).toBe("alpha");
    expect(card.querySelector(".wqi-path").textContent).toBe("/work/alpha");
    expect(card.querySelector(".wqi-count").textContent).toBe("3");
    expect(card.querySelector(".wqi-pin-btn")).toBeNull();
  });

  test("workspace info card shows git repository when provided", () => {
    const sidebar = makeSidebar({ sessions: makeSessions(2) });
    sidebar.cardInfo = {
      folder: "alpha",
      path: "/work/alpha",
      count: 2,
      repository: "origin/repo",
    };
    sidebar.render();
    const card = sidebar.container.querySelector(".workspace-focus-card");
    const gitRegion = card.querySelector(".wqi-git-region");
    expect(gitRegion).toBeTruthy();
    expect(gitRegion.querySelector(".wqi-repo-row")).toBeTruthy();
    expect(gitRegion.querySelector(".wqi-repo").textContent).toBe("origin/repo");
  });

  test("workspace info card omits repo row when no repository", () => {
    const sidebar = makeSidebar({ sessions: makeSessions(1) });
    sidebar.cardInfo = { folder: "alpha", path: "/work/alpha", count: 1 };
    sidebar.render();
    expect(sidebar.container.querySelector(".wqi-repo-row")).toBeNull();
  });

  test("New Task button fires onNewTask with the project", () => {
    const onNewTask = vi.fn();
    const sidebar = makeSidebar({ onNewTask });
    sidebar.render();
    sidebar.container.querySelector(".focus-new-task-btn").click();
    expect(onNewTask).toHaveBeenCalled();
  });

  test("session click fires onSessionSelect", () => {
    const onSessionSelect = vi.fn();
    const sessions = makeSessions(2);
    const sidebar = makeSidebar({ onSessionSelect, sessions });
    sidebar.render();
    sidebar.container.querySelector(".session-item").click();
    expect(onSessionSelect).toHaveBeenCalledWith(sessions[0], expect.anything());
  });

  test("rows are read-only (no pin/archive) but expose delete", () => {
    const builder = fakeBuilder();
    const sidebar = makeSidebar({ sessions: makeSessions(1), activeSessionFile: "/s/0.jsonl" });
    sidebar.buildSessionItem = builder;
    sidebar.render();
    const opts = builder.mock.calls[0][0];
    expect(opts.showPinButton).toBe(false);
    expect(opts.showArchiveButton).toBe(false);
    expect(opts.showDeleteButton).toBe(true);
    expect(opts.isActive).toBe(true);
  });

  test("delete button fires onDelete with the filePath", () => {
    const onDelete = vi.fn();
    const sidebar = makeSidebar({ sessions: makeSessions(1), onDelete });
    sidebar.render();
    sidebar.container.querySelector(".session-delete-btn").click();
    expect(onDelete).toHaveBeenCalledWith("/s/0.jsonl");
  });

  test("fully expands by default and supports collapse/expand toggle", () => {
    const sidebar = makeSidebar({ sessions: makeSessions(6) });
    sidebar.render();
    // Default: all 6 visible.
    expect(sidebar.container.querySelectorAll(".session-item")).toHaveLength(6);
    // Collapse toggle is present because total > initial limit (5).
    const less = sidebar.container.querySelector(".focus-sessions-toggle-less");
    expect(less).toBeTruthy();
    less.click();
    expect(sidebar.container.querySelectorAll(".session-item")).toHaveLength(5);
    // After collapse, "Show more" reappears.
    const more = sidebar.container.querySelector(
      ".focus-sessions-toggle:not(.focus-sessions-toggle-less)",
    );
    expect(more).toBeTruthy();
  });

  test("excludes archived sessions from the list", () => {
    const sessions = [
      { filePath: "/s/free.jsonl", name: "Free" },
      { filePath: "/s/archived.jsonl", name: "Archived" },
    ];
    const sidebar = makeSidebar({
      sessions,
      isArchived: (filePath) => filePath === "/s/archived.jsonl",
    });
    sidebar.render();
    const items = sidebar.container.querySelectorAll(".session-item");
    expect(items).toHaveLength(1);
    expect(items[0].dataset.filePath).toBe("/s/free.jsonl");
  });
});
