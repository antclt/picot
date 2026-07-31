import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupPackageBrowse } from "./package-browse.js";

function renderPackageBrowseDom() {
  document.body.innerHTML = `
    <input id="pkg-browse-search" />
    <div id="pkg-browse-pills">
      <button class="pkg-browse-pill active" data-pkg-type="all">All</button>
    </div>
    <label><input type="checkbox" id="pkg-browse-installed-only" /></label>
    <select id="pkg-browse-sort"><option value="downloads">Most downloads</option></select>
    <span id="pkg-browse-count"></span>
    <div id="pkg-browse-list"></div>
    <div id="pkg-browse-pagination" hidden></div>
  `;
}

function mockCatalog(packages) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ packages, totalPages: 1 }),
    })),
  );
}

function packageRows() {
  return [...document.querySelectorAll(".pkg-browse-row")].map((row) => row.textContent);
}

describe("package browser installed filter", () => {
  beforeEach(() => {
    renderPackageBrowseDom();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("refreshes installed packages when the installed-only filter is enabled after an initial list failure", async () => {
    mockCatalog([
      {
        name: "pi-web-access",
        description: "Web access extension",
        types: ["extension"],
        downloads: 10,
      },
      {
        name: "pi-not-installed",
        description: "Not installed",
        types: ["extension"],
        downloads: 5,
      },
    ]);
    const control = {
      listPiPackages: vi
        .fn()
        .mockRejectedValueOnce(new Error("host not ready"))
        .mockResolvedValueOnce(["npm:pi-web-access"]),
      openExternal: vi.fn(),
      installPiPackage: vi.fn(),
      removePiPackage: vi.fn(),
    };

    const browse = setupPackageBrowse(control);
    await browse.load();

    expect(packageRows()).toHaveLength(2);

    const installedOnly = document.getElementById("pkg-browse-installed-only");
    installedOnly.checked = true;
    installedOnly.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(control.listPiPackages).toHaveBeenCalledTimes(2);
      expect(packageRows()).toHaveLength(1);
    });

    expect(packageRows()[0]).toContain("pi-web-access");
    expect(document.getElementById("pkg-browse-list").textContent).not.toContain(
      "No packages match your filters.",
    );
  });
});
