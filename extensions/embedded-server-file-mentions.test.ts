// ABOUTME: Verifies the GET /api/file-mentions policy layer: main-session root
// ABOUTME: binding, error-to-status mapping, and loopback boundary classification.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { handleFileMentionRequest } from "./file-mention-search.ts";
import { isLoopbackOnlyApiRequest } from "./request-access.ts";

test("loopback policy locks GET /api/file-mentions", () => {
  expect(
    isLoopbackOnlyApiRequest("/api/file-mentions?workspaceRoot=%2Frepo&query=%40src", "GET"),
  ).toBe(true);
  expect(isLoopbackOnlyApiRequest("/api/file-mentions", "GET")).toBe(true);
});

test("missing authoritative workspace maps to 503 workspaceUnavailable", async () => {
  const outcome = await handleFileMentionRequest({
    authoritativeRoot: null,
    requestedRoot: "/repo",
    query: "@src",
  });
  expect(outcome).toEqual({ status: 503, code: "workspaceUnavailable" });
});

test("a browser root that does not match the authoritative workspace maps to 409", async () => {
  const outcome = await handleFileMentionRequest({
    authoritativeRoot: "/real-workspace",
    requestedRoot: "/stale-workspace",
    query: "@src",
  });
  expect(outcome).toEqual({ status: 409, code: "workspaceChanged" });
});

test("a NUL-containing query maps to 400 invalidMentionQuery", async () => {
  const root = mkdtempSync(join(tmpdir(), "atm-route-"));
  const outcome = await handleFileMentionRequest({
    authoritativeRoot: root,
    requestedRoot: root,
    query: "@foo\0bar",
  });
  expect(outcome).toEqual({ status: 400, code: "invalidMentionQuery" });
});

test("a matching root and valid query return 200 with ranked candidates", async () => {
  const root = mkdtempSync(join(tmpdir(), "atm-route-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "index.ts"), "export {};");
  const outcome = await handleFileMentionRequest({
    authoritativeRoot: root,
    requestedRoot: root,
    query: "@index",
  });
  expect(outcome.status).toBe(200);
  if (outcome.status === 200) {
    expect(outcome.body.items.map((item) => item.value)).toContain("@src/index.ts");
  }
});

test("an inaccessible base under a matching root returns 200 with an empty list", async () => {
  const root = mkdtempSync(join(tmpdir(), "atm-route-"));
  const outcome = await handleFileMentionRequest({
    authoritativeRoot: root,
    requestedRoot: root,
    query: "@does-not-exist/anything",
  });
  expect(outcome).toEqual({ status: 200, body: { items: [], truncated: false } });
});

test("an already-aborted request signal short-circuits the walk", async () => {
  const root = mkdtempSync(join(tmpdir(), "atm-route-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "index.ts"), "export {};");
  const controller = new AbortController();
  controller.abort();
  const outcome = await handleFileMentionRequest({
    authoritativeRoot: root,
    requestedRoot: root,
    query: "@index",
    signal: controller.signal,
  });
  expect(outcome.status).toBe(200);
  if (outcome.status === 200) expect(outcome.body.items).toEqual([]);
});
