import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initI18n, setLocale } from "../i18n.js";
import { setupSettingsConfig } from "../native/settings/settings-config.js";

describe("settings API key model configuration", () => {
  let dom;

  beforeEach(async () => {
    dom = new JSDOM(
      `
      <div class="settings-content">
        <div id="settings-api-keys"></div>
      </div>
      <button id="config-editor-close"></button>
      <button id="config-editor-cancel"></button>
      <button id="config-editor-save"></button>
      <div id="config-editor-overlay"></div>
      <div id="config-editor-modal"></div>
      <textarea id="config-editor-textarea"></textarea>
      <div id="config-editor-error"></div>
      <div id="config-editor-path"></div>
    `,
      { url: "http://localhost" },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.confirm = vi.fn(() => true);
    globalThis.requestAnimationFrame = (callback) => callback();
    vi.stubGlobal("fetch", async (url) => {
      const locale = String(url).includes("/zh") ? "zh" : "en";
      const content = readFileSync(join(process.cwd(), "public/locales", `${locale}.json`), "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(content) };
    });
    await initI18n();
    await setLocale("en");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.confirm;
    delete globalThis.requestAnimationFrame;
  });

  test("renders authentication controls and keyed model rows", async () => {
    const configGateway = {
      call: vi.fn(async (operation) => {
        if (operation === "list_model_catalog") {
          return {
            ok: true,
            data: {
              providers: [
                {
                  provider: "anthropic",
                  displayName: "Anthropic",
                  configured: true,
                  source: "stored",
                  models: [
                    {
                      provider: "anthropic",
                      id: "claude-sonnet-5",
                      available: true,
                      visible: true,
                      health: { status: "healthy" },
                    },
                  ],
                },
              ],
            },
          };
        }
        throw new Error(`Unexpected operation: ${operation}`);
      }),
    };

    const { loadApiKeysPanel } = setupSettingsConfig({ configGateway });
    await loadApiKeysPanel();

    expect(document.querySelector('[data-provider="anthropic"]')).not.toBeNull();
    expect(document.querySelector('[data-model-id="claude-sonnet-5"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Anthropic");
  });

  test("toggling model visibility persists through the native config gateway", async () => {
    const onModelConfigurationChanged = vi.fn();
    const configGateway = {
      call: vi.fn(async (operation) => {
        if (operation === "list_model_catalog") {
          return {
            ok: true,
            data: {
              providers: [
                {
                  provider: "anthropic",
                  displayName: "Anthropic",
                  configured: true,
                  source: "stored",
                  models: [
                    {
                      provider: "anthropic",
                      id: "claude-sonnet-5",
                      available: true,
                      visible: true,
                      health: { status: "healthy" },
                    },
                  ],
                },
              ],
            },
          };
        }
        if (operation === "set_model_visibility") return { ok: true };
        throw new Error(`Unexpected operation: ${operation}`);
      }),
    };

    const { loadApiKeysPanel } = setupSettingsConfig({
      configGateway,
      onModelConfigurationChanged,
    });
    await loadApiKeysPanel();

    document
      .querySelector('[data-model-id="claude-sonnet-5"] .api-model-visibility-toggle')
      .click();
    await vi.waitFor(() => {
      expect(configGateway.call).toHaveBeenCalledWith(
        "set_model_visibility",
        {
          provider: "anthropic",
          modelId: "claude-sonnet-5",
          visible: false,
        },
        undefined,
      );
    });
    expect(onModelConfigurationChanged).toHaveBeenCalledTimes(1);
  });
});
