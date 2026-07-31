// ABOUTME: Covers session rename validation, append routing, lifecycle binding, and body limits.
// ABOUTME: Keeps the security and persistence contract executable without starting the server.

import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import {
  type ActiveSessionState,
  clearActiveSessionBinding,
  mergeLiveInstanceSessions,
  publishActiveSessionBinding,
  readBoundedJsonBody,
  renameManagedSession,
} from "./embedded-server.ts";

describe("session rename primitives", () => {
  test("clears only the matching active-session generation", () => {
    const state: ActiveSessionState = { nextGeneration: 0, activeSessionBinding: null };
    const api = { setSessionName: vi.fn() };
    const first = publishActiveSessionBinding(state, api, "/sessions/one.jsonl");
    const second = publishActiveSessionBinding(state, api, "/sessions/two.jsonl");

    clearActiveSessionBinding(state, first.generation);
    expect(state.activeSessionBinding?.generation).toBe(second.generation);
    clearActiveSessionBinding(state, second.generation);
    expect(state.activeSessionBinding).toBeNull();
  });

  test("rejects a body larger than 8192 UTF-8 bytes before JSON parsing", async () => {
    const request = Readable.from([Buffer.from(JSON.stringify({ name: "😀".repeat(5000) }))]);
    await expect(readBoundedJsonBody(request, 8192)).rejects.toMatchObject({ status: 413 });
  });

  test("cancels a Bun reader when the byte limit is crossed", async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValue({ done: false, value: new TextEncoder().encode("x".repeat(9000)) }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const request = {
      headers: new Headers(),
      body: { getReader: () => reader },
    } as unknown as Request;
    await expect(readBoundedJsonBody(request, 8192)).rejects.toMatchObject({ status: 413 });
    expect(reader.cancel).toHaveBeenCalledOnce();
  });

  test("rejects blank and overlong names before touching the filesystem", async () => {
    const openSession = vi.fn();
    const deps = {
      sessionsDir: "/does-not-need-to-exist",
      listAll: async () => [],
      getActiveBinding: () => null,
      openSession: openSession as never,
    };
    await expect(
      renameManagedSession({ filePath: "/sessions/a.jsonl", name: "   " }, deps),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      renameManagedSession({ filePath: "/sessions/a.jsonl", name: "😀".repeat(201) }, deps),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    expect(openSession).not.toHaveBeenCalled();
  });

  test("renames a managed historical session through SessionManager.open", async () => {
    const root = await mkdtemp(join(tmpdir(), "picot-session-rename-"));
    await mkdir(join(root, "project"));
    const filePath = join(root, "project", "session.jsonl");
    await writeFile(filePath, '{"type":"session","id":"s1"}\n');
    const appendSessionInfo = vi.fn();
    const result = await renameManagedSession(
      { filePath, name: "  renamed  " },
      {
        sessionsDir: root,
        listAll: async () => [
          {
            path: filePath,
            id: "s1",
            cwd: "/project",
            created: new Date(),
            modified: new Date(),
            messageCount: 1,
            firstMessage: "hello",
            allMessagesText: "hello",
          },
        ],
        getActiveBinding: () => null,
        openSession: (() => ({ appendSessionInfo })) as never,
      },
    );
    expect(result).toEqual({ ok: true, filePath: await realpath(filePath), name: "renamed" });
    expect(appendSessionInfo).toHaveBeenCalledWith("renamed");
  });

  test("uses the matching foreground binding", async () => {
    const root = await mkdtemp(join(tmpdir(), "picot-session-rename-"));
    const filePath = join(root, "session.jsonl");
    await writeFile(filePath, '{"type":"session","id":"s1"}\n');
    const setSessionName = vi.fn();
    const openSession = vi.fn();
    const result = await renameManagedSession(
      { filePath, name: "foreground" },
      {
        sessionsDir: root,
        listAll: async () => [
          {
            path: filePath,
            id: "s1",
            cwd: "/project",
            created: new Date(),
            modified: new Date(),
            messageCount: 1,
            firstMessage: "hello",
            allMessagesText: "hello",
          },
        ],
        getActiveBinding: () => ({ generation: 1, api: { setSessionName }, sessionFile: filePath }),
        openSession,
      },
    );
    expect(result.ok).toBe(true);
    expect(setSessionName).toHaveBeenCalledWith("foreground");
    expect(openSession).not.toHaveBeenCalled();
  });

  test("leaves an unmatched live session unnamed for the localized sidebar fallback", () => {
    const merged = mergeLiveInstanceSessions(
      [],
      [
        {
          port: 3001,
          pid: 42,
          sessionFile: "/sessions/project/new.jsonl",
          cwd: "/project",
        },
      ],
    );
    expect(merged[0].sessions[0].name).toBeUndefined();
  });

  test("rejects paths outside the managed sessions root", async () => {
    const root = await mkdtemp(join(tmpdir(), "picot-session-rename-"));
    const outside = await mkdtemp(join(tmpdir(), "picot-session-rename-outside-"));
    const filePath = join(outside, "session.jsonl");
    await writeFile(filePath, '{"type":"session","id":"s1"}\n');
    const result = await renameManagedSession(
      { filePath, name: "safe" },
      {
        sessionsDir: root,
        listAll: async () => [],
        getActiveBinding: () => null,
        openSession: vi.fn() as never,
      },
    );
    expect(result).toMatchObject({ ok: false, status: 404 });
  });
});
