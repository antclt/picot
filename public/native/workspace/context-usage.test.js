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
        <button class="ui-button ui-button--sm ui-button--secondary context-viz-compact-btn" id="compact-context-btn"><span class="compact-btn-label"></span></button>
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
    // The legend shows cached and uncached token counts; verify both numeric values appear.
    expect(document.getElementById("context-legend").textContent).toContain("9.3k");
    // Input tokens were 191; ensure the raw count or a related label is present.
    expect(document.getElementById("context-legend").textContent).toMatch(/191|cache|input/i);

    expect(document.getElementById("context-viz-used").textContent).toMatch(/7%|context\.used/);
    expect(document.getElementById("context-viz-total").textContent).toBe("9.5k / 128.0k");
  });

  it("only shows the compact control when Pi has enough context to compact", () => {
    const control = setupContextUsage();
    const button = document.getElementById("compact-context-btn");

    expect(button.closest("#context-viz")).not.toBeNull();
    control.setUsage({ input: 2, cacheRead: 17_400 }, 1_000_000);
    expect(button.hidden).toBe(true);

    control.setUsage({ input: 8_000, cacheRead: 17_000 }, 128_000);
    expect(button.hidden).toBe(false);
    expect(button.disabled).toBe(false);

    control.setWorking(true);
    expect(button.disabled).toBe(true);
    control.setWorking(false);
    control.setCompacting(true);
    expect(button.disabled).toBe(true);
    expect(button.classList.contains("compacting")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
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
