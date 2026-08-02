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
  const control = createTaskCompletionNotifications({
    storage,
    notificationApi,
    title: () => "Done",
    body: () => "Finished",
  });
  return { control, notificationApi };
}

describe("task completion notifications", () => {
  it("notifies once when a running task settles", async () => {
    const { control, notificationApi } = setup();
    control.handleRuntimeFrame(runtimeFrame("agent_start"));
    control.handleRuntimeFrame(runtimeFrame("agent_settled"));
    control.handleRuntimeFrame(runtimeFrame("agent_end"));

    await vi.waitFor(() => {
      expect(notificationApi.sendNotification).toHaveBeenCalledOnce();
    });
    expect(notificationApi.sendNotification).toHaveBeenCalledWith({
      title: "Done",
      body: "Finished",
    });
  });

  it("does not notify when the setting is disabled", async () => {
    const { control, notificationApi } = setup({ storedValue: "false" });
    control.handleRuntimeFrame(runtimeFrame("agent_start"));
    control.handleRuntimeFrame(runtimeFrame("agent_end"));

    await Promise.resolve();
    expect(notificationApi.sendNotification).not.toHaveBeenCalled();
  });

  it("requests permission before the first notification", async () => {
    const { control, notificationApi } = setup({ permission: false });
    control.handleRuntimeFrame(runtimeFrame("agent_start"));
    control.handleRuntimeFrame(runtimeFrame("agent_end"));

    await vi.waitFor(() => {
      expect(notificationApi.requestPermission).toHaveBeenCalledOnce();
      expect(notificationApi.sendNotification).toHaveBeenCalledOnce();
    });
  });

  it("ignores completion events without a preceding start", async () => {
    const { control, notificationApi } = setup();
    control.handleRuntimeFrame(runtimeFrame("agent_end"));

    await Promise.resolve();
    expect(notificationApi.sendNotification).not.toHaveBeenCalled();
  });
});
