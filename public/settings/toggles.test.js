import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setupSettingsToggles } from "../native/settings/settings-toggles.js";

describe("settings toggles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("labels the composer thinking control clearly while keeping button cycling", () => {
    const html = readFileSync(join(process.cwd(), "public/index.html"), "utf8");
    const dom = new JSDOM(html);
    const { document } = dom.window;
    const thinkingBtn = document.querySelector("#thinking-btn");

    expect(thinkingBtn.tagName).toBe("BUTTON");
    expect(thinkingBtn.textContent.trim()).toBe("Think off");
    expect(thinkingBtn.getAttribute("title")).toContain("Click to cycle");
  });

  test("renders thinking effort in Settings as a Faster↔Smarter segmented slider", () => {
    const html = readFileSync(join(process.cwd(), "public/index.html"), "utf8");
    const dom = new JSDOM(html);
    const { document } = dom.window;
    const dots = Array.from(
      document.querySelectorAll("#thinking-effort-steps .thinking-effort-dot"),
    );

    expect(document.querySelector("#setting-thinking .settings-label-main")?.textContent).toBe(
      "Thinking effort",
    );
    expect(document.querySelector("#setting-thinking .settings-label-sub")?.textContent).toBe(
      "Reasoning depth",
    );
    expect(dots.map((s) => s.dataset.level)).toEqual(["off", "minimal", "low", "medium", "high"]);
    const ends = Array.from(
      document.querySelectorAll(
        "#thinking-effort .thinking-effort-ends > span:not(.thinking-effort-name)",
      ),
    );
    expect(ends.map((e) => e.textContent.trim())).toEqual(["Faster", "Smarter"]);
    expect(document.querySelector("#thinking-effort-name")?.textContent.trim()).toBe("off");
    expect(document.querySelector("#thinking-effort-marker")).not.toBeNull();
  });

  test("uses neutral styling for every thinking level chip state", () => {
    const css = [
      readFileSync(join(process.cwd(), "public/style.css"), "utf8"),
      readFileSync(join(process.cwd(), "public/native/header.css"), "utf8"),
      readFileSync(join(process.cwd(), "public/native/composer.css"), "utf8"),
    ].join("\n");
    const thinkingTagRule = css.match(/\.thinking-tag\s*\{[^}]+\}/)?.[0] || "";
    const composerThinkingTagRule =
      css.match(/\.composer-toolbar \.thinking-tag\s*\{[^}]+\}/)?.[0] || "";

    expect(thinkingTagRule).toContain("border: 1px solid var(--border)");
    expect(thinkingTagRule).toContain("color: var(--text-dim)");
    expect(thinkingTagRule).not.toContain("--thinking-accent");
    expect(composerThinkingTagRule).toContain("border-color: transparent");
  });

  test("persists auto-compaction to config on click", async () => {
    const dom = new JSDOM(
      `
      <button class="settings-toggle" id="toggle-auto-compact"></button>
      <button class="settings-toggle on" id="toggle-show-thinking"></button>
      <button class="settings-toggle" id="toggle-task-notifications"></button>
      <button class="settings-toggle" id="toggle-auth"></button>
      <button class="settings-toggle" id="toggle-beta-updates"></button>
    `,
      { url: "http://localhost" },
    );
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("localStorage", dom.window.localStorage);
    vi.stubGlobal("window", dom.window);
    const configGateway = { call: vi.fn().mockResolvedValue({ ok: true }) };

    setupSettingsToggles({ configGateway });
    dom.window.document.getElementById("toggle-auto-compact").click();
    await vi.waitFor(() => {
      expect(configGateway.call).toHaveBeenCalledWith("set_default_auto_compaction", {
        enabled: false,
        scope: "global",
      });
    });
  });
});
