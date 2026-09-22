// ABOUTME: In-panel task analysis -- where the time went, what failed, what got
// ABOUTME: stuck, which steps were redundant, and the model's own reading of it.

/**
 * Task analysis, rendered as a section of the Info panel instead of a dialog.
 *
 * Answers the four questions a "why was this slow / why did it fail" report has
 * to answer, from the spans `turn-trace.js` recorded:
 *
 *   1. Where did the time go?  -> phase split (model / tool / compaction / idle)
 *   2. What got stuck?         -> longest span, plus spans that never ended
 *   3. Where did it fail?      -> first failing span and every later one
 *   4. What was wasted?        -> identical tool calls, retry loops, re-reads
 *
 * Turns this window watched come from the recorder; everything before that -- a
 * reopened session, a restarted app -- is rebuilt from the saved session log
 * when `loadHistoryTurns` is supplied. The two are merged with live winning
 * where they overlap (see `mergeTurnSources`), so the section is useful on the
 * first open rather than only after the next task runs.
 *
 * Nothing here decides anything about the turn: `analyze` (turn-analysis.js) is
 * a pure function and the optional AI block is the only model call, kept behind
 * its own button because it costs a real request.
 */

import { t as translate } from "../../i18n.js";
import { createIcon } from "../../icons.js";
import { createSessionAiAnalysis } from "./session-ai-analysis.js";
import { analyzeTurns, formatMs, formatShare } from "./turn-analysis.js";
import { mergeTurnSources } from "./turn-history.js";

const PHASE_ORDER = ["model", "tool", "compaction", "idle"];
const MAX_TIMELINE_STEPS = 60;

let instanceSeq = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Turn a report into a paste-ready Markdown summary (bug reports, issues). */
export function buildMarkdownReport(report, t = translate) {
  const lines = [];
  lines.push(`# ${t("taskDebugger.title")}`);
  lines.push("");
  lines.push(
    `- ${t("taskDebugger.statusLabel")}: ${t(`taskDebugger.status.${report.status}`)}`,
    `- ${t("taskDebugger.totalTime")}: ${formatMs(report.totals.wallMs)}`,
    `- ${t("taskDebugger.phase.model")}: ${formatMs(report.totals.modelMs)}`,
    `- ${t("taskDebugger.phase.tool")}: ${formatMs(report.totals.toolMs)} (${report.totals.toolCalls})`,
    `- ${t("taskDebugger.phase.idle")}: ${formatMs(report.totals.idleMs)}`,
  );
  if (report.totals.wastedMs > 0) {
    lines.push(`- ${t("taskDebugger.wasted")}: ${formatMs(report.totals.wastedMs)}`);
  }
  lines.push("", `## ${t("taskDebugger.findings")}`);
  for (const finding of report.findings) {
    lines.push(
      `- **${t(`taskDebugger.severity.${finding.severity}`)}** ${findingText(finding, t)}`,
    );
  }
  if (report.slowest.length) {
    lines.push("", `## ${t("taskDebugger.slowest")}`);
    for (const step of report.slowest) {
      lines.push(
        `- ${step.label}${step.detail ? ` (${step.detail})` : ""} - ${formatMs(step.durationMs)} (${formatShare(step.share)})`,
      );
    }
  }
  if (report.failures.length) {
    lines.push("", `## ${t("taskDebugger.failures")}`);
    for (const failure of report.failures) {
      lines.push(`- ${failure.label}: ${failure.error || t("taskDebugger.unknownError")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function findingText(finding, t) {
  return t(`taskDebugger.finding.${finding.code}`, finding.params || {});
}

function renderSummary(report, t) {
  const section = element("section", "session-analysis-summary");
  const status = element(
    "span",
    `session-analysis-status session-analysis-status--${report.status}`,
  );
  status.textContent = t(`taskDebugger.status.${report.status}`);
  const headline = element("div", "session-analysis-headline");
  headline.append(status, element("strong", "", formatMs(report.totals.wallMs)));
  section.appendChild(headline);

  const stats = element("div", "session-analysis-stats");
  const rows = [
    [t("taskDebugger.turns"), String(report.totals.turns)],
    [t("taskDebugger.toolCalls"), String(report.totals.toolCalls)],
    [t("taskDebugger.failures"), String(report.totals.failureCount)],
    [t("taskDebugger.wasted"), formatMs(report.totals.wastedMs)],
  ];
  if (report.totals.usage.cost > 0) {
    rows.push([t("taskDebugger.cost"), `$${report.totals.usage.cost.toFixed(4)}`]);
  }
  for (const [label, value] of rows) {
    const stat = element("div", "session-analysis-stat");
    stat.append(
      element("span", "session-analysis-stat-label", label),
      element("span", "session-analysis-stat-value", value),
    );
    stats.appendChild(stat);
  }
  section.appendChild(stats);
  return section;
}

function renderPhases(report, t) {
  const section = element("section", "session-analysis-section");
  section.appendChild(element("h3", "session-analysis-heading", t("taskDebugger.timeSplit")));

  const bar = element("div", "session-analysis-bar");
  for (const kind of PHASE_ORDER) {
    const phase = report.phases.find((entry) => entry.kind === kind);
    if (!phase || phase.ms <= 0) continue;
    const segment = element(
      "span",
      `session-analysis-bar-segment session-analysis-bar-segment--${kind}`,
    );
    segment.style.flexGrow = String(phase.ms);
    segment.title = `${t(`taskDebugger.phase.${kind}`)} ${formatMs(phase.ms)}`;
    bar.appendChild(segment);
  }
  if (!bar.childElementCount) bar.appendChild(element("span", "session-analysis-bar-empty"));
  section.appendChild(bar);

  const legend = element("ul", "session-analysis-legend");
  for (const kind of PHASE_ORDER) {
    const phase = report.phases.find((entry) => entry.kind === kind);
    if (!phase) continue;
    const item = element(
      "li",
      `session-analysis-legend-item session-analysis-legend-item--${kind}`,
    );
    item.append(
      element("span", "session-analysis-legend-label", t(`taskDebugger.phase.${kind}`)),
      element(
        "span",
        "session-analysis-legend-value",
        `${formatMs(phase.ms)} · ${formatShare(phase.share)}`,
      ),
    );
    legend.appendChild(item);
  }
  section.appendChild(legend);
  return section;
}

function renderFindings(report, t) {
  const section = element("section", "session-analysis-section");
  section.appendChild(element("h3", "session-analysis-heading", t("taskDebugger.findings")));
  const list = element("ul", "session-analysis-findings");
  for (const finding of report.findings) {
    const item = element(
      "li",
      `session-analysis-finding session-analysis-finding--${finding.severity}`,
    );
    item.append(
      element(
        "span",
        "session-analysis-finding-severity",
        t(`taskDebugger.severity.${finding.severity}`),
      ),
      element("span", "session-analysis-finding-text", findingText(finding, t)),
    );
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

/**
 * Ranking only earns its own section once it actually filters something out
 * of the full step list -- otherwise it is a verbatim re-render of the same
 * rows the step timeline already shows just below it (same `stepRow`
 * renderer, same durations), which reads as a duplicated section rather
 * than a distinct view.
 */
function renderSteps(report, t) {
  if (report.totalSteps <= report.slowest.length) return null;
  const section = element("section", "session-analysis-section");
  section.appendChild(element("h3", "session-analysis-heading", t("taskDebugger.slowest")));
  const list = element("ol", "session-analysis-steps");
  for (const step of report.slowest) {
    list.appendChild(stepRow(step, t));
  }
  section.appendChild(list);
  return section;
}

/**
 * A model step can close with no `text` block at all -- a completion that is
 * nothing but tool calls, or pure reasoning with no visible reply -- and
 * without a fallback the row shows a duration and nothing else, which reads
 * as missing data rather than as "this step didn't say anything."
 */
function stepDetail(step, t) {
  if (step.detail) return step.detail;
  if (step.kind === "model" && step.toolNames?.length) {
    return t("taskDebugger.stepToolCalls", { tools: step.toolNames.join(", ") });
  }
  if (step.kind === "model") return t("taskDebugger.stepNoOutput");
  return "";
}

function stepRow(step, t) {
  const item = element("li", `session-analysis-step session-analysis-step--${step.status}`);
  const head = element("div", "session-analysis-step-head");
  head.append(
    element("span", "session-analysis-step-label", step.label),
    element("span", "session-analysis-step-duration", formatMs(step.durationMs)),
  );
  item.appendChild(head);
  const detail = stepDetail(step, t);
  if (detail) item.appendChild(element("div", "session-analysis-step-detail", detail));
  if (step.error) item.appendChild(element("div", "session-analysis-step-error", step.error));
  if (step.status === "unfinished") {
    item.appendChild(
      element("div", "session-analysis-step-error", t("taskDebugger.neverFinished")),
    );
  }
  return item;
}

function renderTimeline(turns, t) {
  const section = element("section", "session-analysis-section");
  section.appendChild(element("h3", "session-analysis-heading", t("taskDebugger.timeline")));
  const list = element("ol", "session-analysis-timeline");
  let rendered = 0;
  for (const turn of turns) {
    for (const step of turn.steps) {
      if (rendered >= MAX_TIMELINE_STEPS) break;
      rendered += 1;
      list.appendChild(stepRow({ ...step, durationMs: step.durationMs ?? 0 }, t));
    }
  }
  if (!rendered) {
    section.appendChild(element("p", "session-analysis-empty", t("taskDebugger.noSteps")));
    return section;
  }
  section.appendChild(list);
  return section;
}

/**
 * Build the Info panel's task analysis section.
 *
 * @param {{
 *   getTurns: () => Array<object>,
 *   loadHistoryTurns?: () => Promise<Array<object>> | Array<object>,
 *   analyze?: (turns: Array<object>, options?: object) => object,
 *   resolveTurns?: () => Promise<Array<object>> | Array<object>,
 *   analyzeWithAi?: (turns: Array<object>) => Promise<string>,
 *   t?: (key: string, params?: object) => string,
 *   writeText?: (text: string) => Promise<void> | void,
 * }} options
 * @returns {{
 *   element: HTMLElement,
 *   refresh: () => Promise<void>,
 *   rerender: () => void,
 *   resetHistory: () => void,
 *   setStreaming: (value: boolean) => void,
 *   getReport: () => object | null,
 * }}
 */
export function createSessionTaskAnalysis({
  getTurns,
  loadHistoryTurns = null,
  analyze = analyzeTurns,
  resolveTurns,
  analyzeWithAi = null,
  t = translate,
  writeText = (text) => navigator.clipboard?.writeText(text),
} = {}) {
  const section = element("section", "session-analysis");
  const uid = ++instanceSeq;
  section.setAttribute("aria-labelledby", `session-analysis-heading-${uid}`);

  const head = element("div", "session-analysis-head");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "session-analysis-toggle";
  const caret = element("span", "session-analysis-caret", "▾");
  caret.setAttribute("aria-hidden", "true");
  const title = element("span", "session-analysis-title", t("taskDebugger.title"));
  title.id = `session-analysis-heading-${uid}`;
  toggle.append(caret, title);

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className =
    "ui-icon-button ui-icon-button--xs ui-icon-button--ghost session-analysis-copy";
  copyButton.append(createIcon("clipboard", { size: 14 }));
  head.append(toggle, copyButton);

  const content = element("div", "session-analysis-content");
  const scope = element("div", "session-analysis-scope");
  scope.setAttribute("role", "radiogroup");
  scope.setAttribute("aria-label", t("taskDebugger.title"));
  const scopeInputs = ["last", "session"].map((value) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `session-analysis-scope-${uid}`;
    input.value = value;
    if (value === "last") input.checked = true;
    label.append(
      input,
      element("span", "", t(`taskDebugger.scope${value === "last" ? "Last" : "Session"}`)),
    );
    scope.appendChild(label);
    return input;
  });

  const body = element("div", "session-analysis-body");
  content.append(scope, body);
  section.append(head, content);

  let streaming = false;
  let scopeValue = "last";
  let collapsed = false;
  let lastReport = null;
  let historyTurns = [];
  let historyState = typeof loadHistoryTurns === "function" ? "idle" : "off";
  // Guards a session switch (or a concurrent refresh) from letting a stale read
  // of the previous session's log repaint the section.
  let historySeq = 0;

  const aiAnalysis =
    typeof analyzeWithAi === "function" && typeof resolveTurns === "function"
      ? createSessionAiAnalysis({
          t,
          resolveTurns,
          analyzeWithAi,
          isStreaming: () => streaming,
        })
      : null;

  function availableTurns() {
    return mergeTurnSources(historyTurns, getTurns?.() ?? []);
  }

  function selectedTurns() {
    const turns = availableTurns();
    // A turn still streaming has open spans; calling them "stuck" would be a
    // lie, so it is left out until it settles.
    const settled = streaming ? turns.filter((turn) => turn.status !== "running") : turns;
    if (scopeValue === "session") return settled;
    const finished = settled.filter((turn) => turn.status !== "running");
    const last = finished.length ? finished[finished.length - 1] : settled[settled.length - 1];
    return last ? [last] : [];
  }

  function renderCopyButton() {
    copyButton.disabled = !lastReport;
    const label = t("taskDebugger.copyReport");
    copyButton.title = label;
    copyButton.setAttribute("aria-label", label);
  }

  function renderBody() {
    const turns = selectedTurns();
    body.replaceChildren();
    if (!turns.length) {
      const key =
        historyState === "loading"
          ? "taskDebugger.loadingHistory"
          : historyState === "failed"
            ? "taskDebugger.historyFailed"
            : "taskDebugger.noTurns";
      body.appendChild(element("p", "session-analysis-empty", t(key)));
      lastReport = null;
      return;
    }
    const report = analyze(turns);
    lastReport = report;
    body.append(
      ...[
        renderSummary(report, t),
        renderFindings(report, t),
        renderPhases(report, t),
        renderSteps(report, t),
        renderTimeline(turns, t),
      ].filter(Boolean),
    );
    // Rebuilt spans come from the saved log, which records no compaction and no
    // step the runtime never wrote down. Say so rather than letting a thinner
    // report read as a complete one.
    if (turns.some((turn) => turn.source === "history")) {
      body.appendChild(element("p", "session-analysis-note", t("taskDebugger.historyNote")));
    }
    if (aiAnalysis) body.appendChild(aiAnalysis.element);
  }

  function render() {
    content.classList.toggle("hidden", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    caret.textContent = collapsed ? "▸" : "▾";
    // Labels change with the locale; re-render them here rather than only at build.
    title.textContent = t("taskDebugger.title");
    scope.setAttribute("aria-label", t("taskDebugger.title"));
    for (const input of scopeInputs) {
      input.parentElement.querySelector("span").textContent = t(
        `taskDebugger.scope${input.value === "last" ? "Last" : "Session"}`,
      );
    }
    renderBody();
    renderCopyButton();
    aiAnalysis?.refresh();
  }

  /**
   * Re-read the saved log: a turn that ended since the last look is exactly the
   * one the user came to see, and the read is a single file.
   */
  async function refresh() {
    if (typeof loadHistoryTurns !== "function") return;
    const seq = ++historySeq;
    historyState = "loading";
    if (!historyTurns.length) render();
    try {
      const turns = await loadHistoryTurns();
      if (seq !== historySeq) return;
      historyTurns = Array.isArray(turns) ? turns : [];
      historyState = "ready";
    } catch (error) {
      if (seq !== historySeq) return;
      console.warn("[TaskAnalysis] session history rebuild failed:", error);
      historyTurns = [];
      historyState = "failed";
    }
    render();
  }

  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    render();
  });
  for (const input of scopeInputs) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      scopeValue = input.value;
      render();
    });
  }
  let copyResetTimer = null;
  copyButton.addEventListener("click", async () => {
    if (!lastReport) return;
    try {
      const result = writeText?.(buildMarkdownReport(lastReport, t));
      if (!result) throw new Error("Clipboard unavailable");
      await result;
      copyButton.title = t("taskDebugger.copied");
      copyButton.setAttribute("aria-label", t("taskDebugger.copied"));
    } catch {
      copyButton.title = t("taskDebugger.copyFailed");
      copyButton.setAttribute("aria-label", t("taskDebugger.copyFailed"));
    }
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(renderCopyButton, 1500);
  });

  render();

  return {
    element: section,
    refresh,
    /** Repaint translated labels from cached state (locale change, scope change). */
    rerender: render,
    /** A session switch invalidates the rebuilt history, not the live trace. */
    resetHistory() {
      historySeq += 1;
      historyTurns = [];
      historyState = typeof loadHistoryTurns === "function" ? "idle" : "off";
      aiAnalysis?.reset();
      render();
    },
    /** Streaming turns are excluded: their open spans are not "stuck" yet. */
    setStreaming(value) {
      streaming = Boolean(value);
      render();
    },
    getReport: () => lastReport,
  };
}
