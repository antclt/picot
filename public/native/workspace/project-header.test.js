import { afterEach, describe, expect, it, vi } from "vitest";
import { setupProjectHeader } from "./project-header.js";

const BASE_HTML = `
  <div id="workspace-indicator" class="hidden"></div>
  <button id="diff-sidebar-toggle" class="git-branch-toggle hidden">
    <span id="git-branch-indicator" class="git-branch-toggle__label"></span>
  </button>
`;

describe("project header", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("shows the full workspace path in the header pill", async () => {
    document.body.innerHTML = BASE_HTML;
    const fullPath = "/Users/ShixinGuo/code/pi/pi-web-ui";
    const data = {
      workspaceInfo: vi.fn().mockResolvedValue({ info: { path: fullPath } }),
    };

    await setupProjectHeader({ data, workspaceId: "workspace-a" });

    const indicator = document.getElementById("workspace-indicator");
    expect(data.workspaceInfo).toHaveBeenCalledWith("workspace-a");
    expect(indicator.textContent).toBe(fullPath);
    expect(indicator.title).toBe(fullPath);
    expect(indicator.classList.contains("hidden")).toBe(false);
  });

  it("shows git branch toggle with branch name when git info is available", async () => {
    document.body.innerHTML = BASE_HTML;
    const data = {
      workspaceInfo: vi.fn().mockResolvedValue({
        info: { path: "/some/path", gitBranch: "main" },
      }),
    };

    await setupProjectHeader({ data, workspaceId: "workspace-b" });

    const toggle = document.getElementById("diff-sidebar-toggle");
    const label = document.getElementById("git-branch-indicator");
    expect(toggle.classList.contains("hidden")).toBe(false);
    expect(label.textContent).toBe("main");
    expect(toggle.title).toContain("main");
  });

  it("hides git branch toggle when project has no git info", async () => {
    document.body.innerHTML = BASE_HTML;
    const data = {
      workspaceInfo: vi.fn().mockResolvedValue({
        info: { path: "/some/non-git-path" },
      }),
    };

    await setupProjectHeader({ data, workspaceId: "workspace-c" });

    const toggle = document.getElementById("diff-sidebar-toggle");
    expect(toggle.classList.contains("hidden")).toBe(true);
  });
});
