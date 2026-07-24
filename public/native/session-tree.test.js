import { describe, expect, it, vi } from "vitest";
import { SessionTreeController } from "./session-tree.js";

const target = { workspaceId: "w", sessionId: "s", instanceId: "i" };

describe("SessionTreeController", () => {
  it("loads the complete tree from the Pi-owned bridge", async () => {
    const runtime = {
      request: vi.fn().mockResolvedValueOnce({
        response: { data: { tree: [{ entry: { id: "root" } }], leafId: "leaf" } },
      }),
    };
    const controller = new SessionTreeController({ runtime, target });
    await expect(controller.load()).resolves.toMatchObject({ leafId: "leaf" });
    expect(runtime.request).toHaveBeenCalledWith({ type: "get_tree" }, target);
  });

  it("preserves a hydrated tree and rejects an invalid payload", async () => {
    const runtime = { request: vi.fn().mockResolvedValue({ response: { data: {} } }) };
    const controller = new SessionTreeController({ runtime, target });
    controller.hydrate({ tree: [{ entry: { id: "existing" } }], leafId: "existing" });
    await expect(controller.load()).rejects.toThrow("invalid session tree");
    expect(controller.current().leafId).toBe("existing");
  });
});
