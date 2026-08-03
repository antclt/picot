import { describe, expect, it, vi } from "vitest";
import { createTaskCompletionNotifications } from "./task-completion-notifications.js";

function runtimeFrame(type, instanceId = "instance-a") {
  return { type: "runtime_event", target: { instanceId }, event: { type } };
}

function setup({ storedValue, permission = true } = {}) {
  const storage = {
    getItem: vi.fn().mockReturnValue(storedValue ?? null),
  };
  const notificationApi = {
    isPermissionGranted: vi.fn().mockResolvedValue(permission),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    sendNotification: vi.fn(),
  };
  const task = { id: "session-a", name: "Fix notification routing" };
  const showNotification = vi.fn();
  const control = createTaskCompletionNotifications({
    storage,
    notificationApi,
    resolveTask: () => task,
    title: (resolvedTask) => resolvedTask.name,
    body: () => "Finished",
    showNotification,
  });
  return { control, notificationApi, showNotification, task };
}

describe("task completion notifications", () => {
  it("notifies once when a running task settles", async () => {
    const { control, showNotification, task } = setup();
    control.handleRuntimeFrame(runtimeFrame("agent_start"));
    control.handleRuntimeFrame(runtimeFrame("agent_settled"));
    control.handleRuntimeFrame(runtimeFrame("agent_end"));

    await vi.waitFor(() => {
      expect(showNotification).toHaveBeenCalledOnce();
    });
    expect(showNotification).toHaveBeenCalledWith({
      title: "Fix notification routing",
      body: "Finished",
      target: { instanceId: "instance-a" },
      task,
    });
  });

  it("does not notify when the setting is disabled", async () => {
    const { control, showNotification } = setup({ storedValue: "false" });
    control.handleRuntimeFrame(runtimeFrame("agent_start"));
    control.handleRuntimeFrame(runtimeFrame("agent_end"));

    await Promise.resolve();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it("requests permission before the first notification", async () => {
    const { control, notificationApi, showNotification } = setup({ permission: false });
    control.handleRuntimeFrame(runtimeFrame("agent_start"));
    control.handleRuntimeFrame(runtimeFrame("agent_end"));

    await vi.waitFor(() => {
      expect(notificationApi.requestPermission).toHaveBeenCalledOnce();
      expect(showNotification).toHaveBeenCalledOnce();
    });
  });

  it("ignores completion events without a preceding start", async () => {
    const { control, showNotification } = setup();
    control.handleRuntimeFrame(runtimeFrame("agent_end"));

    await Promise.resolve();
    expect(showNotification).not.toHaveBeenCalled();
  });
});
