import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const SETTINGS_KEY = "picot-settings-task-notifications";
const LOG_PREFIX = "[DEBUG-picot-notification]";

function describeTarget(target = {}) {
  return {
    instanceId: target.instanceId ?? null,
    workspaceId: target.workspaceId ?? null,
    sessionId: target.sessionId ?? null,
  };
}

function targetKey(target = {}) {
  return target.instanceId || target.sessionId || null;
}

export function createNativeTaskNotificationSender({ invoke, logger = console } = {}) {
  return async ({ title, body, target }) => {
    if (!invoke) {
      logger.warn(`${LOG_PREFIX} native invoke is unavailable`);
      return;
    }
    if (!target?.workspaceId || !target?.sessionId) {
      logger.warn(
        `${LOG_PREFIX} native notification skipped: incomplete target`,
        describeTarget(target),
      );
      return;
    }
    const notificationTarget = describeTarget(target);
    logger.debug(`${LOG_PREFIX} invoking native notification`, notificationTarget);
    await invoke("show_task_completion_notification", {
      title,
      body,
      workspaceId: target.workspaceId,
      sessionId: target.sessionId,
    });
    logger.debug(`${LOG_PREFIX} native notification command completed`, notificationTarget);
  };
}

export function createTaskCompletionNotifications({
  storage = globalThis.localStorage,
  notificationApi = { isPermissionGranted, requestPermission, sendNotification },
  resolveTask = () => null,
  title = (task) => task?.name || task?.firstMessage || "Task completed",
  body = () => "Your task has finished.",
  showNotification = (notification) => notificationApi.sendNotification(notification),
  onError = (error) => console.warn("[Notifications] Failed to show notification:", error),
  logger = console,
} = {}) {
  const runningTargets = new Set();

  const enabled = () => storage?.getItem(SETTINGS_KEY) !== "false";

  async function showCompletion(target) {
    const notificationTarget = describeTarget(target);
    if (!enabled()) {
      logger.debug(`${LOG_PREFIX} completion skipped: setting disabled`, notificationTarget);
      return;
    }
    logger.debug(`${LOG_PREFIX} checking notification permission`, notificationTarget);
    let granted = await notificationApi.isPermissionGranted();
    logger.debug(`${LOG_PREFIX} permission check completed`, { granted });
    if (!granted) {
      const permission = await notificationApi.requestPermission();
      granted = permission === "granted";
      logger.debug(`${LOG_PREFIX} permission request completed`, { permission, granted });
    }
    if (!granted) {
      logger.warn(`${LOG_PREFIX} completion skipped: permission denied`, notificationTarget);
      return;
    }
    const task = resolveTask(target);
    logger.debug(`${LOG_PREFIX} dispatching completion notification`, {
      ...notificationTarget,
      taskResolved: Boolean(task),
    });
    await showNotification({ title: title(task), body: body(task), target, task });
    logger.debug(`${LOG_PREFIX} completion notification dispatched`, notificationTarget);
  }

  function handleRuntimeFrame(frame) {
    if (frame?.type !== "runtime_event") return;
    const key = targetKey(frame.target);
    if (!key) {
      logger.warn(`${LOG_PREFIX} runtime event skipped: target has no key`, {
        eventType: frame.event?.type ?? null,
        ...describeTarget(frame.target),
      });
      return;
    }
    if (frame.event?.type === "agent_start") {
      runningTargets.add(key);
      logger.debug(`${LOG_PREFIX} agent start tracked`, {
        key,
        ...describeTarget(frame.target),
      });
      return;
    }
    if (frame.event?.type !== "agent_settled" && frame.event?.type !== "agent_end") return;
    logger.debug(`${LOG_PREFIX} agent completion received`, {
      eventType: frame.event.type,
      key,
      ...describeTarget(frame.target),
    });
    if (!runningTargets.delete(key)) {
      logger.warn(`${LOG_PREFIX} completion skipped: no matching agent start`, { key });
      return;
    }
    void showCompletion(frame.target).catch(onError);
  }

  return { handleRuntimeFrame };
}
