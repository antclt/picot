// ABOUTME: Migration of the legacy public/settings/editors.test.js onto the
// native settings-config.js module. The old HTTP `rpcCommand` mock became the
// native `configGateway.call(op, params, options)` interface, responses moved
// from `{ success }` to `{ ok }`, and the panel now re-renders itself after
// visibility/API-key mutations, so mock call counts reflect the reload.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initI18n, setLocale } from "../../i18n.js";
import { setupModelsPage } from "./models-page.js";

function makeCatalogResponse(providers) {
  return { ok: true, data: { providers } };
}

function expectVisibilityCall(call, provider, modelId, visible) {
  const calls = call.mock.calls.filter(([operation]) => operation === "set_model_visibility");
  expect(
    calls.some(
      ([, params]) =>
        params?.provider === provider && params?.modelId === modelId && params?.visible === visible,
    ),
  ).toBe(true);
}

describe("settings API key model refresh", () => {
  let dom;

  beforeEach(async () => {
    dom = new JSDOM(`
      <div id="settings-api-keys"></div>
      <button id="config-editor-close"></button>
      <button id="config-editor-cancel"></button>
      <button id="config-editor-save"></button>
      <div id="config-editor-overlay"></div>
      <div id="config-editor-modal"></div>
      <textarea id="config-editor-textarea"></textarea>
      <div id="config-editor-error"></div>
      <div id="config-editor-path"></div>
    `);
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
    vi.unstubAllGlobals();
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.confirm;
    delete globalThis.requestAnimationFrame;
  });

  test("refreshes model configuration after removing a stored API key", async () => {
    const onModelConfigurationChanged = vi.fn();
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
          {
            provider: "anthropic",
            displayName: "Anthropic",
            configured: true,
            source: "stored",
            models: [],
          },
        ]);
      }
      if (operation === "remove_api_key") return { ok: true };
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged,
    });

    await loadApiKeysPanel();
    document.querySelector(".api-key-row-actions .danger").click();

    await vi.waitFor(() => expect(onModelConfigurationChanged).toHaveBeenCalledTimes(1));
  });

  test("renders authentication controls in the selected locale", async () => {
    await setLocale("zh");
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
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
        ]);
      }
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged: vi.fn(),
    });

    await loadApiKeysPanel();

    expect(document.querySelector(".api-key-row-summary").textContent).toBe(
      "1 个已启用 · 1 个健康 · 0 个问题",
    );
    expect(document.querySelector(".api-model-check-visible").textContent).toBe("检查健康状态");
    expect(document.querySelector(".api-key-row-actions button").textContent).toBe("检查健康状态");
  });

  test("renders model rows under authentication providers", async () => {
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
          {
            provider: "anthropic",
            displayName: "Anthropic",
            configured: true,
            source: "stored",
            models: [
              {
                provider: "anthropic",
                id: "claude-sonnet-5",
                contextWindow: 200000,
                available: true,
                visible: true,
                health: { status: "healthy", latencyMs: 42 },
              },
            ],
          },
        ]);
      }
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged: vi.fn(),
    });

    await loadApiKeysPanel();

    expect(document.querySelector(".api-model-row")?.textContent).toContain("claude-sonnet-5");
    expect(document.querySelector(".api-model-health-dot.healthy")).not.toBeNull();
    expect(document.querySelector(".api-model-visibility-toggle").checked).toBe(true);
    expect(document.querySelector(".api-model-health-status").textContent).not.toContain(
      "200k context",
    );
  });

  test("renders a compact provider card with health and bulk visibility actions", async () => {
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
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
        ]);
      }
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged: vi.fn(),
    });

    await loadApiKeysPanel();

    expect(document.querySelector(".api-provider-toggle").textContent).toBe("▼");
    expect(document.querySelector(".api-key-row-summary").textContent).toBe(
      "1 enabled · 1 healthy · 0 issues",
    );
    expect(document.querySelector(".api-model-check-visible").textContent).toBe("Check health");
    const headerActions = document.querySelector(".api-key-row-actions");
    expect(headerActions.children[0].textContent).toBe("Check health");
    expect(headerActions.children[1].textContent).toBe("Update");
    expect(document.querySelector(".api-key-row-actions .api-model-check-visible")).not.toBeNull();
    expect(
      document.querySelector(".api-model-list-heading-actions .api-model-check-visible"),
    ).toBeNull();
    expect(document.querySelector(".api-model-disable-unhealthy")).toBeNull();
    expect(document.querySelector(".api-model-list-actions")).toBeNull();
    const heading = document.querySelector(".api-model-list-heading");
    expect(heading.children[2].className).toBe("api-model-list-heading-actions");
    expect(heading.children[3].textContent).toBe("");
    expect(heading.children[3].className).toBe("api-model-select-all");
    expect(document.querySelector(".api-model-select-all-toggle").checked).toBe(true);

    document.querySelector(".api-provider-toggle").click();

    expect(document.querySelector(".api-model-list").classList.contains("collapsed")).toBe(true);

    document.querySelector(".api-key-row-header").click();

    expect(document.querySelector(".api-model-list").classList.contains("collapsed")).toBe(false);
  });

  test("puts configured providers first without showing authentication source text", async () => {
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
          {
            provider: "openai",
            displayName: "OpenAI",
            configured: false,
            models: [],
          },
          {
            provider: "anthropic",
            displayName: "Anthropic",
            configured: true,
            source: "stored",
            models: [],
          },
        ]);
      }
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged: vi.fn(),
    });

    await loadApiKeysPanel();

    const providers = document.querySelectorAll(".api-key-row");
    // The native panel renders only configured providers; unconfigured ones
    // are offered through the provider picker instead.
    expect(providers).toHaveLength(1);
    expect(providers[0].dataset.provider).toBe("anthropic");
    expect(document.querySelector(".api-key-row-status")).toBeNull();
  });

  test("does not render health controls when a provider has no keyed models", async () => {
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
          {
            provider: "openai",
            displayName: "OpenAI",
            configured: false,
            models: [
              {
                provider: "openai",
                id: "gpt-4.1",
                available: false,
                visible: false,
                health: { status: "unknown" },
              },
            ],
          },
        ]);
      }
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged: vi.fn(),
    });

    await loadApiKeysPanel();

    expect(document.querySelector(".api-model-empty") === null).toBe(true);
    expect(document.querySelector(".api-model-list") === null).toBe(true);
    expect(document.querySelector(".api-model-row")).toBeNull();
    expect(document.querySelector(".api-model-health-check")).toBeNull();
    expect(document.querySelector(".api-model-check-visible")).toBeNull();
    expect(document.querySelector(".api-key-row-summary")).toBeNull();
  });

  test("toggling model visibility persists and refreshes model info", async () => {
    const onModelConfigurationChanged = vi.fn();
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
          {
            provider: "anthropic",
            displayName: "Anthropic",
            configured: true,
            source: "stored",
            models: [
              {
                provider: "anthropic",
                id: "claude-opus-5",
                available: true,
                visible: true,
                health: { status: "unknown" },
              },
            ],
          },
        ]);
      }
      if (operation === "set_model_visibility") return { ok: true };
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged,
    });

    await loadApiKeysPanel();
    const toggle = document.querySelector(".api-model-visibility-toggle");
    toggle.checked = false;
    toggle.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    await vi.waitFor(() => expectVisibilityCall(call, "anthropic", "claude-opus-5", false));
    await vi.waitFor(() => expect(onModelConfigurationChanged).toHaveBeenCalledTimes(1));
  });

  test("bulk visibility header toggles all provider models", async () => {
    const onModelConfigurationChanged = vi.fn();
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
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
                health: { status: "unknown" },
              },
              {
                provider: "anthropic",
                id: "claude-opus-5",
                available: true,
                visible: true,
                health: { status: "unknown" },
              },
            ],
          },
        ]);
      }
      if (operation === "set_model_visibility") return { ok: true };
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged,
    });

    await loadApiKeysPanel();
    const selectAllToggle = document.querySelector(".api-model-select-all-toggle");
    selectAllToggle.checked = false;
    selectAllToggle.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(onModelConfigurationChanged).toHaveBeenCalledTimes(1));

    expectVisibilityCall(call, "anthropic", "claude-sonnet-5", false);
    expectVisibilityCall(call, "anthropic", "claude-opus-5", false);
    expect(onModelConfigurationChanged).toHaveBeenCalledTimes(1);
  });

  test("syncs the provider header in place when a single model is toggled", async () => {
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
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
              {
                provider: "anthropic",
                id: "claude-opus-5",
                available: true,
                visible: true,
                health: { status: "healthy" },
              },
            ],
          },
        ]);
      }
      if (operation === "set_model_visibility") return { ok: true };
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const onModelConfigurationChanged = vi.fn();
    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged,
    });

    await loadApiKeysPanel();
    const providerRow = document.querySelector(".api-key-row");
    const selectAll = document.querySelector(".api-model-select-all-toggle");
    expect(selectAll.checked).toBe(true);
    expect(selectAll.indeterminate).toBe(false);
    expect(document.querySelector(".api-key-row-summary").textContent).toBe(
      "2 enabled · 2 healthy · 0 issues",
    );

    const toggle = document.querySelector(
      '.api-model-row[data-model-id="claude-opus-5"] .api-model-visibility-toggle',
    );
    toggle.checked = false;
    toggle.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(onModelConfigurationChanged).toHaveBeenCalledTimes(1));
    // The card is synced in place, not rebuilt.
    expect(document.querySelector(".api-key-row")).toBe(providerRow);
    expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(false);
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(true);
    expect(document.querySelector(".api-key-row-summary").textContent).toBe(
      "1 enabled · 2 healthy · 0 issues",
    );
    expect(document.querySelector(".api-model-check-visible").disabled).toBe(false);
  });

  test("keeps the model search query when a model is toggled", async () => {
    const models = Array.from({ length: 25 }, (_, index) => ({
      provider: "anthropic",
      id: `claude-model-${index}`,
      available: true,
      visible: true,
      health: { status: "unknown" },
    }));
    const onModelConfigurationChanged = vi.fn();
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
          {
            provider: "anthropic",
            displayName: "Anthropic",
            configured: true,
            source: "stored",
            models,
          },
        ]);
      }
      if (operation === "set_model_visibility") return { ok: true };
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged,
    });

    await loadApiKeysPanel();
    const search = document.querySelector(".api-model-list-search");
    expect(search).not.toBeNull();
    search.value = "claude-model-1";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    // "claude-model-1" also matches 10..19: 11 kept, 14 filtered out.
    expect(document.querySelectorAll(".api-model-row-filtered-out")).toHaveLength(14);

    const toggle = document.querySelector(
      '.api-model-row[data-model-id="claude-model-1"] .api-model-visibility-toggle',
    );
    toggle.checked = false;
    toggle.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    await vi.waitFor(() => expectVisibilityCall(call, "anthropic", "claude-model-1", false));
    await vi.waitFor(() => expect(onModelConfigurationChanged).toHaveBeenCalledTimes(1));
    // The panel was not rebuilt: same input node, same query, same filter.
    expect(document.querySelector(".api-model-list-search")).toBe(search);
    expect(search.value).toBe("claude-model-1");
    expect(document.querySelectorAll(".api-model-row-filtered-out")).toHaveLength(14);
    expect(toggle.disabled).toBe(false);
  });

  test("restores the model search query after a full panel re-render", async () => {
    const models = Array.from({ length: 25 }, (_, index) => ({
      provider: "anthropic",
      id: `claude-model-${index}`,
      available: true,
      visible: true,
      health: { status: "unknown" },
    }));
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
          {
            provider: "anthropic",
            displayName: "Anthropic",
            configured: true,
            source: "stored",
            models,
          },
        ]);
      }
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged: vi.fn(),
    });

    await loadApiKeysPanel();
    const search = document.querySelector(".api-model-list-search");
    search.value = "claude-model-1";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

    // A locale change re-renders the whole panel through loadApiKeysPanel.
    await setLocale("zh");

    await vi.waitFor(() => {
      const rerendered = document.querySelector(".api-model-list-search");
      expect(rerendered).not.toBe(search);
      expect(rerendered.value).toBe("claude-model-1");
    });
    // The restored query is re-applied, not just parked in the input.
    expect(document.querySelectorAll(".api-model-row-filtered-out")).toHaveLength(14);
  });

  test("health check updates model row state", async () => {
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
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
                health: { status: "unknown" },
              },
            ],
          },
        ]);
      }
      if (operation === "check_model_health") {
        expect(document.querySelector(".api-model-health-dot.checking")).not.toBeNull();
        return {
          ok: true,
          data: {
            results: [
              {
                provider: "anthropic",
                modelId: "claude-sonnet-5",
                status: "unhealthy",
                error: "model overloaded",
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged: vi.fn(),
    });

    await loadApiKeysPanel();
    document.querySelector(".api-key-row-actions .api-model-check-visible").click();

    await vi.waitFor(() => {
      expect(document.querySelector(".api-model-health-dot.unhealthy")).not.toBeNull();
      expect(document.querySelector(".api-model-health-status").textContent).toContain(
        "model overloaded",
      );
    });
  });

  test("keeps the provider card mounted when a health check fails", async () => {
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
          {
            provider: "anthropic",
            displayName: "Anthropic",
            configured: true,
            models: [
              {
                provider: "anthropic",
                id: "claude-sonnet-5",
                available: true,
                visible: true,
                health: { status: "unknown" },
              },
            ],
          },
        ]);
      }
      if (operation === "check_model_health") {
        return { ok: false, error: "Request timed out" };
      }
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged: vi.fn(),
    });

    await loadApiKeysPanel();
    const providerRow = document.querySelector(".api-key-row");
    document.querySelector(".api-key-row-actions .api-model-check-visible").click();

    await vi.waitFor(() => {
      expect(document.querySelector(".api-key-row")).toBe(providerRow);
      expect(document.querySelector(".api-model-health-status").textContent).toContain(
        "Request timed out",
      );
    });
    // Only the initial catalog load: the card stays mounted (and is synced in
    // place) instead of being rebuilt by a second list_model_catalog reload.
    expect(
      call.mock.calls.filter(([operation]) => operation === "list_model_catalog"),
    ).toHaveLength(1);
  });

  test("keeps provider expansion state and scroll position after toggling a model", async () => {
    const settingsContent = document.createElement("div");
    settingsContent.className = "settings-content";
    settingsContent.style.cssText = "overflow-y: auto; height: 100px;";
    const settingsApiKeys = document.createElement("div");
    settingsApiKeys.id = "settings-api-keys";
    settingsContent.appendChild(settingsApiKeys);
    const createNode = (tag, id) => {
      const node = document.createElement(tag);
      node.id = id;
      return node;
    };
    document.body.replaceChildren(
      settingsContent,
      createNode("button", "config-editor-close"),
      createNode("button", "config-editor-cancel"),
      createNode("button", "config-editor-save"),
      createNode("div", "config-editor-overlay"),
      createNode("div", "config-editor-modal"),
      createNode("textarea", "config-editor-textarea"),
      createNode("div", "config-editor-error"),
      createNode("div", "config-editor-path"),
    );
    const call = vi.fn(async (operation) => {
      if (operation === "list_model_catalog") {
        return makeCatalogResponse([
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
                health: { status: "unknown" },
              },
            ],
          },
          {
            provider: "openai",
            displayName: "OpenAI",
            configured: true,
            source: "stored",
            models: [
              {
                provider: "openai",
                id: "gpt-5",
                available: true,
                visible: true,
                health: { status: "unknown" },
              },
            ],
          },
        ]);
      }
      if (operation === "set_model_visibility") return { ok: true };
      throw new Error(`Unexpected operation: ${operation}`);
    });

    const { loadApiKeysPanel } = setupModelsPage({
      configGateway: { call },
      onModelConfigurationChanged: vi.fn(),
    });

    await loadApiKeysPanel();
    document.querySelector('.api-key-row[data-provider="anthropic"] .api-key-row-header').click();
    const scrollContainer = document.querySelector(".settings-content");
    scrollContainer.scrollTop = 320;

    const openAiToggle = document.querySelector(
      '.api-model-row[data-provider="openai"] .api-model-visibility-toggle',
    );
    openAiToggle.checked = false;
    openAiToggle.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    await vi.waitFor(() => expectVisibilityCall(call, "openai", "gpt-5", false));
    expect(
      document
        .querySelector('.api-key-row[data-provider="anthropic"] .api-model-list')
        .classList.contains("collapsed"),
    ).toBe(true);
    expect(scrollContainer.scrollTop).toBe(320);
  });
});
