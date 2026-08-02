import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const SETTINGS_KEY = "picot-settings-task-notifications";

function targetKey(target = {}) {
  return target.instanceId || target.sessionId || null;
}

export function createTaskCompletionNotifications({
  storage = globalThis.localStorage,
  notificationApi = { isPermissionGranted, requestPermission, sendNotification },
  title = () => "Task completed",
  body = () => "Your task has finished.",
  onError = (error) => console.warn("[Notifications] Failed to show notification:", error),
} = {}) {
  const runningTargets = new Set();

  const enabled = () => storage?.getItem(SETTINGS_KEY) !== "false";

  async function showCompletion() {
    if (!enabled()) return;
    let granted = await notificationApi.isPermissionGranted();
    if (!granted) granted = (await notificationApi.requestPermission()) === "granted";
    if (granted) notificationApi.sendNotification({ title: title(), body: body() });
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
    void showCompletion().catch(onError);
  }

  return { handleRuntimeFrame };
}
