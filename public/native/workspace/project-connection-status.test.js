import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getProjectDisconnectInfo,
  isProjectDisconnected,
  markProjectConnected,
  markProjectDisconnected,
  subscribeProjectConnectionStatus,
} from "./project-connection-status.js";

describe("project-connection-status", () => {
  beforeEach(() => {
    markProjectConnected("/repo/a");
    markProjectConnected("/repo/b");
  });

  it("starts every project connected", () => {
    expect(isProjectDisconnected("/repo/a")).toBe(false);
  });

  it("marks a project disconnected and reports it back", () => {
    markProjectDisconnected("/repo/a", "host unreachable");
    expect(isProjectDisconnected("/repo/a")).toBe(true);
    expect(getProjectDisconnectInfo("/repo/a")).toEqual({ message: "host unreachable" });
  });

  it("does not affect other projects", () => {
    markProjectDisconnected("/repo/a", "boom");
    expect(isProjectDisconnected("/repo/b")).toBe(false);
  });

  it("clears the mark on markProjectConnected", () => {
    markProjectDisconnected("/repo/a", "boom");
    markProjectConnected("/repo/a");
    expect(isProjectDisconnected("/repo/a")).toBe(false);
    expect(getProjectDisconnectInfo("/repo/a")).toBeNull();
  });

  it("ignores an empty project path", () => {
    markProjectDisconnected("", "boom");
    expect(isProjectDisconnected("")).toBe(false);
  });

  it("notifies subscribers on disconnect and on connect", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProjectConnectionStatus(listener);
    markProjectDisconnected("/repo/a", "boom");
    expect(listener).toHaveBeenCalledTimes(1);
    markProjectConnected("/repo/a");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    markProjectDisconnected("/repo/a", "boom again");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not notify again for the same disconnect message", () => {
    const listener = vi.fn();
    subscribeProjectConnectionStatus(listener);
    markProjectDisconnected("/repo/a", "boom");
    markProjectDisconnected("/repo/a", "boom");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify when already connected", () => {
    const listener = vi.fn();
    subscribeProjectConnectionStatus(listener);
    markProjectConnected("/repo/a");
    expect(listener).not.toHaveBeenCalled();
  });
});
