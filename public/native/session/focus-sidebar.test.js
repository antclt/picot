// ABOUTME: Confirms the focus-mode sidebar renders a per-session timestamp
// ABOUTME: (via the shared formatSessionTime helper), matching the normal sidebar.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../../i18n.js";
import { WorkspaceFocusSidebar } from "./focus-sidebar.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EN_LOCALE_PATH = join(__dirname, "..", "..", "locales", "en.json");

function makeFocusSidebar({ sessions = [], overrides = {} } = {}) {
  const container = document.createElement("div");
  const sidebar = new WorkspaceFocusSidebar(container, {
    project: { path: "/ws-1", sessions },
    activeSessionFile: null,
    ...overrides,
  });
  sidebar.render();
  return { sidebar, container };
}

describe("WorkspaceFocusSidebar session timestamp", () => {
  beforeEach(async () => {
    localStorage.clear();
    const enJson = readFileSync(EN_LOCALE_PATH, "utf8");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        if (String(input).includes("/locales/en.json")) {
          return new Response(enJson);
        }
        return new Response("{}", { status: 404 });
      }),
    );
    await initI18n();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.replaceChildren();
  });

  it("renders a relative timestamp for each session row", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { container } = makeFocusSidebar({
      sessions: [{ filePath: "/ws-1/s1", name: "Task A", timestamp: twoHoursAgo }],
    });

    const timeEl = container.querySelector(".focus-session-row .session-time");
    expect(timeEl).not.toBeNull();
    // formatSessionTime maps ~2h ago to "2h ago".
    expect(timeEl.textContent).toBe("2h ago");
  });

  it("omits the timestamp element when the session has no timestamp", () => {
    const { container } = makeFocusSidebar({
      sessions: [{ filePath: "/ws-1/s1", name: "Task A" }],
    });

    const timeEl = container.querySelector(".focus-session-row .session-time");
    // No timestamp → formatSessionTime returns "" → element should be absent
    // (an empty timestamp slot would waste layout space).
    expect(timeEl).toBeNull();
  });
});
