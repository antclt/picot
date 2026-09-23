import { expect, test, vi } from "vitest";
import {
  profileForNewSession,
  profileForSnapshotRebind,
  restoreSessionModel,
} from "./model-restoration.js";

test("carries DeepSeek through a temporary session's first formal snapshot", () => {
  const profile = { provider: "zoom-gpt", modelId: "deepseek_v4_flash", thinkingLevel: "medium" };
  const inherited = profileForNewSession(
    { provider: profile.provider, id: profile.modelId },
    profile.thinkingLevel,
  );
  expect(inherited).toEqual(profile);
  expect(
    profileForSnapshotRebind(
      { workspaceId: "w", sessionId: "temporary-new", instanceId: "i" },
      { workspaceId: "w", sessionId: "formal-new", instanceId: "i" },
      inherited,
    ),
  ).toBe(inherited);
  expect(
    profileForSnapshotRebind(
      { workspaceId: "w", sessionId: "existing-session", instanceId: "i" },
      { workspaceId: "w", sessionId: "other-session", instanceId: "i" },
      profile,
    ),
  ).toBeUndefined();
});

test("carries the visible model when session_bound arrives after the pending profile was consumed", () => {
  const previous = { workspaceId: "w", sessionId: "temporary-new", instanceId: "i" };
  const next = { workspaceId: "w", sessionId: "formal-new", instanceId: "i" };
  expect(
    profileForSnapshotRebind(
      previous,
      next,
      null,
      { provider: "zoom-gpt", id: "deepseek_v4_flash" },
      "medium",
    ),
  ).toEqual({ provider: "zoom-gpt", modelId: "deepseek_v4_flash", thinkingLevel: "medium" });
});

test("restores the saved model in Pi before showing it in the composer", async () => {
  const runtime = { request: vi.fn(async () => ({ response: { data: {} } })) };
  const profile = { provider: "zoom-gpt", modelId: "deepseek_v4_flash", thinkingLevel: "medium" };
  const result = await restoreSessionModel({
    runtime,
    target: { sessionId: "session-1" },
    profile,
    state: { model: { provider: "anthropic", id: "claude-opus-4-8" }, thinkingLevel: "off" },
    idempotencyKey: () => "key",
  });

  expect(runtime.request.mock.calls.map(([command]) => command)).toEqual([
    { type: "set_model", provider: "zoom-gpt", modelId: "deepseek_v4_flash" },
    { type: "set_thinking_level", level: "medium" },
  ]);
  expect(result).toEqual({
    model: { provider: "zoom-gpt", id: "deepseek_v4_flash" },
    thinkingLevel: "medium",
  });
});

test("keeps Pi's actual selection if the saved model is unavailable", async () => {
  const runtime = {
    request: vi.fn(async () => {
      throw new Error("Model not found");
    }),
  };
  const state = { model: { provider: "anthropic", id: "claude-opus-4-8" }, thinkingLevel: "off" };
  const result = await restoreSessionModel({
    runtime,
    target: { sessionId: "session-1" },
    profile: { provider: "missing", modelId: "gone", thinkingLevel: "high" },
    state,
    idempotencyKey: () => "key",
  });
  expect(result).toEqual(state);
});

test("does not switch an already restored model and keeps its context window", async () => {
  const runtime = { request: vi.fn() };
  const model = { provider: "zoom-gpt", id: "deepseek_v4_flash", contextWindow: 128000 };
  const result = await restoreSessionModel({
    runtime,
    target: { sessionId: "session-1" },
    profile: { provider: model.provider, modelId: model.id, thinkingLevel: "medium" },
    state: { model, thinkingLevel: "medium" },
    idempotencyKey: () => "key",
  });
  expect(result.model).toBe(model);
  expect(runtime.request).not.toHaveBeenCalled();
});
