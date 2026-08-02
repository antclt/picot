import { t } from "../../i18n.js";
import { formatTokens, setupContextViz } from "../../ui/context-viz.js";

// Mirrors Pi's DEFAULT_COMPACTION_SETTINGS.keepRecentTokens. Below this
// boundary prepareCompaction() has no older context to summarize.
export const MIN_COMPACTABLE_CONTEXT_TOKENS = 20_000;

export function setupContextUsage({
  tokenUsageEl = document.getElementById("token-usage"),
  contextViz = document.getElementById("context-viz"),
  contextBar = document.getElementById("context-bar"),
  contextLegend = document.getElementById("context-legend"),
  contextVizUsed = document.getElementById("context-viz-used"),
  contextVizTotal = document.getElementById("context-viz-total"),
  compactButton = document.getElementById("compact-context-btn"),
} = {}) {
  let usage = null;
  let contextWindowSize = 0;
  let compacting = false;
  let working = false;

  const viz = setupContextViz({
    tokenUsageEl,
    contextViz,
    contextBar,
    contextLegend,
    contextVizUsed,
    contextVizTotal,
    getUsage: () => usage,
    getContextWindowSize: () => contextWindowSize,
  });

  function setUsage(nextUsage, nextContextWindowSize = contextWindowSize) {
    usage = normalizeUsage(nextUsage);
    contextWindowSize = Number(nextContextWindowSize) || Number(usage?.contextWindow) || 0;
    renderPill();
    if (!contextViz?.classList.contains("hidden")) viz.update();
  }

  function setContextWindowSize(nextContextWindowSize) {
    contextWindowSize = Number(nextContextWindowSize) || 0;
    renderPill();
    if (!contextViz?.classList.contains("hidden")) viz.update();
  }

  function clear() {
    usage = null;
    contextWindowSize = 0;
    tokenUsageEl?.classList.remove("visible", "warning", "critical");
    if (tokenUsageEl) {
      tokenUsageEl.textContent = "";
      tokenUsageEl.title = t("usage.contextTitle");
    }
    viz.hide();
    renderCompactButton();
  }

  function renderCompactButton() {
    if (!compactButton) return;
    compactButton.hidden = usageTotal(usage) <= MIN_COMPACTABLE_CONTEXT_TOKENS;
    compactButton.classList.toggle("compacting", compacting);
    compactButton.disabled = compacting || working;
    compactButton.setAttribute("aria-busy", String(compacting));
    const label = compactButton.querySelector(".compact-btn-label");
    if (label) label.textContent = t(compacting ? "input.compacting" : "input.compact");
    const description = t(compacting ? "input.compacting" : "input.compactDesc");
    compactButton.title = description;
    compactButton.setAttribute("aria-label", description);
  }

  function renderPill() {
    renderCompactButton();
    if (!tokenUsageEl) return;
    const used = usageTotal(usage);
    tokenUsageEl.classList.remove("warning", "critical");

    if (used <= 0) {
      tokenUsageEl.classList.remove("visible");
      tokenUsageEl.textContent = "";
      tokenUsageEl.title = t("usage.contextTitle");
      viz.hide();
      return;
    }

    tokenUsageEl.classList.add("visible");
    if (contextWindowSize > 0) {
      const percent = Math.round((used / contextWindowSize) * 100);
      tokenUsageEl.textContent = `${percent}%`;
      tokenUsageEl.title = `Context: ${formatTokens(used)} / ${formatTokens(contextWindowSize)} tokens`;
      if (percent >= 80) {
        tokenUsageEl.classList.add("critical");
      } else if (percent >= 60) {
        tokenUsageEl.classList.add("warning");
      }
      return;
    }

    tokenUsageEl.textContent = formatTokens(used);
    tokenUsageEl.title = `Context: ${formatTokens(used)} tokens`;
  }

  return {
    clear,
    get canCompact() {
      return usageTotal(usage) > MIN_COMPACTABLE_CONTEXT_TOKENS;
    },
    setCompacting(value) {
      compacting = Boolean(value);
      renderCompactButton();
    },
    setWorking(value) {
      working = Boolean(value);
      renderCompactButton();
    },
    setContextWindowSize,
    setUsage,
    get usage() {
      return usage;
    },
    get contextWindowSize() {
      return contextWindowSize;
    },
  };
}

export function findLatestAssistantUsage(messages) {
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.usage) return message.usage;
  }
  return null;
}

export function usageTotal(usage) {
  if (!usage) return 0;
  return (Number(usage.input) || 0) + (Number(usage.cacheRead) || 0);
}

function normalizeUsage(usage) {
  if (!usage) return null;
  return {
    ...usage,
    input: Number(usage.input) || 0,
    cacheRead: Number(usage.cacheRead) || 0,
  };
}
