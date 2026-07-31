// ABOUTME: Tests for archive protection over active, streaming, and live sessions.
// ABOUTME: Covers reason precedence and batch-archive filtering.
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initI18n } from "../i18n.js";
import { SessionSidebar } from "./index.js";

function setupDom() {
  const dom = new JSDOM('<div id="sessions"></div>', { url: "http://localhost:3001" });
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.CSS = dom.window.CSS || { escape: (v) => String(v).replace(/["\\]/g, "\\$&") };
}

beforeEach(async () => {
  setupDom();
  global.fetch = vi.fn(async (url) => {
    if (String(url).includes("/locales/en.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sidebar: {
            recent: "RECENT",
            pinned: "PINNED",
            projects: "PROJECTS",
            archived: "Archived",
            openProject: "Open project",
            emptySession: "Empty",
            pinSession: "Pin",
            unpinSession: "Unpin",
            archiveSession: "Archive",
            unarchiveSession: "Unarchive",
            archiveDisabledActive: "Cannot archive the active session",
            archiveDisabledStreaming: "Cannot archive a streaming session",
            archiveDisabledRunning: "Cannot archive a running session",
          },
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  await initI18n();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SessionSidebar archive protection", () => {
  test("archiveDisabledReason covers active, streaming, and live; null otherwise", () => {
    const sidebar = new SessionSidebar(document.getElementById("sessions"), vi.fn(), vi.fn(), {
      getLiveInstances: () => [{ sessionFile: "/s/live.jsonl" }],
    });
    sidebar.activeSessionFile = "/s/active.jsonl";
    sidebar.setStreaming("/s/stream.jsonl", true);

    expect(sidebar.archiveDisabledReason("/s/active.jsonl")).not.toBeNull();
    expect(sidebar.archiveDisabledReason("/s/stream.jsonl")).not.toBeNull();
    expect(sidebar.archiveDisabledReason("/s/live.jsonl")).not.toBeNull();
    expect(sidebar.archiveDisabledReason("/s/free.jsonl")).toBeNull();
  });

  test("active reason takes precedence over streaming and live", () => {
    const sidebar = new SessionSidebar(document.getElementById("sessions"), vi.fn(), vi.fn(), {
      getLiveInstances: () => [{ sessionFile: "/s/active.jsonl" }],
    });
    sidebar.activeSessionFile = "/s/active.jsonl";
    sidebar.setStreaming("/s/active.jsonl", true);
    expect(sidebar.archiveDisabledReason("/s/active.jsonl")).toBe(
      "Cannot archive the active session",
    );
  });

  test("archiveWorkspaceSessions skips active, streaming, and live sessions", () => {
    const sidebar = new SessionSidebar(document.getElementById("sessions"), vi.fn(), vi.fn(), {
      getLiveInstances: () => [{ sessionFile: "/s/live.jsonl" }],
    });
    sidebar.projects = [];
    sidebar.activeSessionFile = "/s/active.jsonl";
    sidebar.setStreaming("/s/stream.jsonl", true);
    const workspace = {
      sessions: [
        { filePath: "/s/free.jsonl", name: "Free" },
        { filePath: "/s/active.jsonl", name: "Active" },
        { filePath: "/s/stream.jsonl", name: "Stream" },
        { filePath: "/s/live.jsonl", name: "Live" },
      ],
    };

    sidebar.archiveWorkspaceSessions(workspace);

    expect(sidebar.archived).toEqual(["/s/free.jsonl"]);
  });
});
