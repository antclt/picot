import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "./chat-settings-panel.js";

const SUPER_AGENT_COOKIE = "pi-studio-super-agent-enabled";

function clearSuperAgentCookie() {
  document.cookie = `${SUPER_AGENT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

async function flushPromises(count = 8) {
  for (let i = 0; i < count; i++) await Promise.resolve();
}

describe("chat-settings-panel", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    clearSuperAgentCookie();
    vi.restoreAllMocks();
  });

  it("renders Telegram doctor status and the Super Agent safety boundary", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (url === "/api/chat-config") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            content: JSON.stringify({
              accounts: {
                "telegram-main": {
                  service: "telegram",
                  botToken: "token",
                  botUsername: "picot_shixin_bot",
                  channels: {
                    "dm-main": {
                      id: "6085028519",
                      name: "shixin",
                      dm: true,
                      access: { allowedUserIds: ["6085028519"] },
                    },
                  },
                },
              },
            }),
          }),
        };
      }
      if (url === "/api/chat-telegram/doctor") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            report: {
              summary: "ready",
              checks: [
                {
                  id: "listener",
                  label: "Listener",
                  status: "ok",
                  message: "Telegram listener is connected.",
                },
                {
                  id: "security",
                  label: "Security",
                  status: "ok",
                  message: "Telegram is restricted to allowed user 6085028519.",
                },
              ],
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const Panel = customElements.get("chat-settings-panel");
    const panel = new Panel();
    document.body.appendChild(panel);
    await flushPromises();

    expect(panel.querySelector("#setting-super-agent .settings-label-main")?.textContent).toBe(
      "Start automatically",
    );
    expect(panel.querySelector("#setting-super-agent .settings-label-sub")?.textContent).toBe(
      "Launch Agent Inbox when Picot opens",
    );
    expect(panel.querySelector("#toggle-super-agent")).not.toBeNull();
    expect(panel.querySelector("[data-token-input]")?.classList.contains("ui-input")).toBe(true);
    for (const button of panel.querySelectorAll("button[data-action]")) {
      expect(button.classList.contains("ui-button"), button.dataset.action).toBe(true);
    }
    expect(panel.textContent).toContain("Telegram listener is connected.");
    expect(panel.textContent).toContain("Telegram messages enter Agent Inbox first.");
    expect(panel.textContent).toContain("6085028519");
  });

  it("keeps the Super Agent startup toggle out of the General settings panel", () => {
    const html = readFileSync(join(process.cwd(), "public/index.html"), "utf8");
    const dom = new JSDOM(html);
    const { document: shellDocument } = dom.window;

    expect(shellDocument.querySelector('[data-settings-tab="chat"]')?.textContent.trim()).toBe(
      "Agent Inbox",
    );
    expect(
      shellDocument.querySelector('[data-settings-panel="general"] #setting-super-agent'),
    ).toBeNull();

    dom.window.close();
  });

  it("persists the Super Agent startup toggle as a cookie and notifies the app", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (url === "/api/chat-config") {
        return { ok: true, json: async () => ({ success: true, content: "{}" }) };
      }
      if (url === "/api/chat-telegram/doctor") {
        return {
          ok: true,
          json: async () => ({ success: true, report: { summary: "ready", checks: [] } }),
        };
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const Panel = customElements.get("chat-settings-panel");
    const panel = new Panel();
    document.body.appendChild(panel);
    await flushPromises();

    const toggle = panel.querySelector("#toggle-super-agent");
    const changed = vi.fn();
    window.addEventListener("picot-super-agent-autostart-changed", changed);

    expect(toggle.classList.contains("on")).toBe(false);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.getAttribute("role")).toBe("switch");

    toggle.click();

    expect(toggle.classList.contains("on")).toBe(true);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(document.cookie).toContain(`${SUPER_AGENT_COOKIE}=true`);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0][0].detail).toEqual({ enabled: true });

    toggle.click();

    expect(toggle.classList.contains("on")).toBe(false);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(document.cookie).toContain(`${SUPER_AGENT_COOKIE}=false`);
    expect(changed).toHaveBeenCalledTimes(2);

    window.removeEventListener("picot-super-agent-autostart-changed", changed);
  });
});
