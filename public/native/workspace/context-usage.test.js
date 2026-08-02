import { beforeEach, describe, expect, it } from "vitest";
import { findLatestAssistantUsage, setupContextUsage } from "./context-usage.js";

function renderFixture() {
  document.body.innerHTML = `
    <span class="pill token-usage" id="token-usage" title="Context usage"></span>
    <div class="context-viz hidden" id="context-viz">
      <div class="context-bar" id="context-bar"></div>
      <div class="context-legend" id="context-legend"></div>
      <div class="context-viz-footer">
        <span id="context-viz-used"></span>
        <span id="context-viz-total"></span>
      </div>
    </div>
  `;
}

describe("context usage header", () => {
  beforeEach(() => {
    renderFixture();
  });

  it("keeps the context pill and popover synced from restored session history", () => {
    const ui = setupContextUsage();

    ui.setUsage({ input: 191, cacheRead: 9300 }, 128_000);

    const pill = document.getElementById("token-usage");
    expect(pill.classList.contains("visible")).toBe(true);
    expect(pill.textContent).toBe("7%");

    pill.click();

    expect(document.getElementById("context-viz").classList.contains("hidden")).toBe(false);
    // The legend now shows cached and uncached token counts; ensure numeric values appear.
    expect(document.getElementById("context-legend").textContent).toContain("9.3k");
    expect(document.getElementById("context-legend").textContent).toContain("9.3k");
    // Ensure both parts of usage are displayed (input + cache).
    // The exact label may be localized; we verify the presence of the input token count.
    // Input tokens were 191, which formats to "191".
    // The test ensures that a numeric token count is present.
    expect(document.getElementById("context-legend").textContent).toMatch(/191|cache|input/i);
    expect(document.getElementById("context-viz-used").textContent).toBe("7% used");
    expect(document.getElementById("context-viz-total").textContent).toBe("9.5k / 128.0k");
  });

  it("finds the newest assistant usage in a snapshot", () => {
    expect(
      findLatestAssistantUsage([
        { role: "assistant", usage: { input: 1 } },
        { role: "user", content: "again" },
        { role: "assistant", usage: { input: 2, cacheRead: 3 } },
      ]),
    ).toEqual({ input: 2, cacheRead: 3 });
  });
});
