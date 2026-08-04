// ABOUTME: Tests for createSidebarResizer — drag handle creation, width clamping, localStorage persistence.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSidebarResizer } from "./sidebar-resizer.js";

beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeSidebar(id = "test-sidebar") {
  const el = document.createElement("div");
  el.id = id;
  // offsetWidth is 0 in jsdom; set it via defineProperty so resolveWidth works
  Object.defineProperty(el, "offsetWidth", { configurable: true, value: 250 });
  document.body.append(el);
  return el;
}

describe("createSidebarResizer", () => {
  it("creates a drag handle element next to the sidebar", () => {
    const sidebar = makeSidebar();
    const resizer = createSidebarResizer({
      sidebarEl: sidebar,
      side: "left",
      storageKey: "test-width",
    });
    expect(resizer).not.toBeNull();
    expect(resizer.element).toBeInstanceOf(HTMLElement);
    expect(resizer.element.className).toBe("sidebar-resizer");
    expect(resizer.element.dataset.side).toBe("left");
    // Handle should be inserted after the sidebar (afterend for left side)
    expect(sidebar.nextElementSibling).toBe(resizer.element);
    resizer.destroy();
  });

  it("inserts handle before sidebar for right-side panel", () => {
    const sidebar = makeSidebar();
    const resizer = createSidebarResizer({
      sidebarEl: sidebar,
      side: "right",
      storageKey: "test-width",
    });
    expect(sidebar.previousElementSibling).toBe(resizer.element);
    resizer.destroy();
  });

  it("applies the CSS variable on the sidebar element", () => {
    const sidebar = makeSidebar();
    const resizer = createSidebarResizer({
      sidebarEl: sidebar,
      side: "left",
      storageKey: "test-width",
      initialWidth: 300,
    });
    expect(sidebar.style.getPropertyValue("--sidebar-width")).toBe("300px");
    resizer.destroy();
  });

  it("uses --file-sidebar-width for right side", () => {
    const sidebar = makeSidebar();
    const resizer = createSidebarResizer({
      sidebarEl: sidebar,
      side: "right",
      storageKey: "test-width",
      initialWidth: 280,
    });
    expect(sidebar.style.getPropertyValue("--file-sidebar-width")).toBe("280px");
    resizer.destroy();
  });

  it("clamps width to minWidth/maxWidth", () => {
    const sidebar = makeSidebar();
    const resizer = createSidebarResizer({
      sidebarEl: sidebar,
      side: "left",
      storageKey: "test-width",
      minWidth: 200,
      maxWidth: 500,
      initialWidth: 100,
    });
    expect(sidebar.style.getPropertyValue("--sidebar-width")).toBe("200px");
    resizer.setWidth(999);
    expect(sidebar.style.getPropertyValue("--sidebar-width")).toBe("500px");
    resizer.destroy();
  });

  it("persists width to localStorage", () => {
    const sidebar = makeSidebar();
    const resizer = createSidebarResizer({
      sidebarEl: sidebar,
      side: "left",
      storageKey: "picot-sidebar-width",
      initialWidth: 250,
    });
    resizer.setWidth(350);
    expect(localStorage.getItem("picot-sidebar-width")).toBe("350");
    resizer.destroy();
  });

  it("restores width from localStorage on init", () => {
    localStorage.setItem("picot-sidebar-width", "320");
    const sidebar = makeSidebar();
    const resizer = createSidebarResizer({
      sidebarEl: sidebar,
      side: "left",
      storageKey: "picot-sidebar-width",
    });
    expect(sidebar.style.getPropertyValue("--sidebar-width")).toBe("320px");
    resizer.destroy();
  });

  it("returns null for invalid arguments", () => {
    expect(createSidebarResizer({ side: "left", storageKey: "x" })).toBeNull();
    expect(() =>
      createSidebarResizer({
        sidebarEl: makeSidebar(),
        side: "top",
        storageKey: "x",
      }),
    ).toThrow();
  });

  it("destroy removes the handle and cleans up", () => {
    const sidebar = makeSidebar();
    const resizer = createSidebarResizer({
      sidebarEl: sidebar,
      side: "left",
      storageKey: "test-width",
    });
    const handle = resizer.element;
    expect(document.body.contains(handle)).toBe(true);
    resizer.destroy();
    expect(document.body.contains(handle)).toBe(false);
  });
});
