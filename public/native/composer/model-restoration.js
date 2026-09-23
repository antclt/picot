// Restore a saved session selection in Pi itself, not just in the composer.
export function profileForNewSession(model, thinkingLevel) {
  if (!model?.provider || !model?.id) return undefined;
  return { provider: model.provider, modelId: model.id, thinkingLevel: thinkingLevel ?? "off" };
}

export function profileForSnapshotRebind(
  previousTarget,
  snapshotTarget,
  pendingProfile,
  currentModel,
  thinkingLevel,
) {
  if (
    previousTarget?.sessionId?.startsWith("temporary-") &&
    snapshotTarget?.sessionId &&
    snapshotTarget.sessionId !== previousTarget.sessionId &&
    snapshotTarget.workspaceId === previousTarget.workspaceId &&
    snapshotTarget.instanceId === previousTarget.instanceId
  ) {
    return pendingProfile ?? profileForNewSession(currentModel, thinkingLevel);
  }
  return undefined;
}

export async function restoreSessionModel({ runtime, target, profile, state, idempotencyKey }) {
  const currentModel = state?.model ?? null;
  const currentThinkingLevel = state?.thinkingLevel ?? "off";
  if (!profile) return { model: currentModel, thinkingLevel: currentThinkingLevel };

  const modelChanged =
    currentModel?.provider !== profile.provider || currentModel?.id !== profile.modelId;
  let selectedModel = currentModel;
  if (modelChanged) {
    try {
      const result = await runtime.request(
        { type: "set_model", provider: profile.provider, modelId: profile.modelId },
        target,
        { idempotencyKey: idempotencyKey() },
      );
      if (result?.response?.success === false) {
        throw new Error(result.response.error || "Model not found");
      }
      selectedModel = result?.response?.data?.id
        ? result.response.data
        : { provider: profile.provider, id: profile.modelId };
    } catch (error) {
      console.warn("[Native] Failed to restore the session model:", error);
      return { model: currentModel, thinkingLevel: currentThinkingLevel };
    }
  }

  if (modelChanged || currentThinkingLevel !== profile.thinkingLevel) {
    try {
      const result = await runtime.request(
        { type: "set_thinking_level", level: profile.thinkingLevel },
        target,
        {
          idempotencyKey: idempotencyKey(),
        },
      );
      if (result?.response?.success === false) {
        throw new Error(result.response.error || "Thinking level unavailable");
      }
    } catch (error) {
      console.warn("[Native] Failed to restore the session thinking level:", error);
      const result = await runtime.request({ type: "get_state" }, target).catch(() => null);
      return {
        model: result?.response?.data?.model ?? selectedModel,
        thinkingLevel: result?.response?.data?.thinkingLevel ?? currentThinkingLevel,
      };
    }
  }

  return {
    model: selectedModel,
    thinkingLevel: profile.thinkingLevel,
  };
}
