import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const SETTINGS_KEY = "picot-settings-task-notifications";

function targetKey(target = {}) {
  return target.instanceId || target.sessionId || null;
}

export function createNativeTaskNotificationSender({ invoke } = {}) {
  return ({ title, body, target }) => {
    if (!invoke || !target?.workspaceId || !target?.sessionId) return;
    return invoke("show_task_completion_notification", {
      title,
      body,
      workspaceId: target.workspaceId,
      sessionId: target.sessionId,
    });
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
} = {}) {
  const runningTargets = new Set();

  const enabled = () => storage?.getItem(SETTINGS_KEY) !== "false";

  async function showCompletion(target) {
    if (!enabled()) return;
    let granted = await notificationApi.isPermissionGranted();
    if (!granted) granted = (await notificationApi.requestPermission()) === "granted";
    if (!granted) return;
    const task = resolveTask(target);
    await showNotification({ title: title(task), body: body(task), target, task });
  }

  function handleRuntimeFrame(frame) {
    if (frame?.type !== "runtime_event") return;
    const key = targetKey(frame.target);
    if (!key) return;
    if (frame.event?.type === "agent_start") {
      runningTargets.add(key);
      return;
    }
    if (frame.event?.type !== "agent_settled" && frame.event?.type !== "agent_end") return;
    if (!runningTargets.delete(key)) return;
    void showCompletion(frame.target).catch(onError);
  }

  return { handleRuntimeFrame };
}
