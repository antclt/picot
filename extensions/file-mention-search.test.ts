// ABOUTME: Verifies the pure @-file-mention path parser, root resolver, bounded walker,
// ABOUTME: scorer, and platform path forms without going through the HTTP layer.

import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  InvalidMentionQueryError,
  parseMentionQuery,
  searchFileMentions,
} from "./file-mention-search";

function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "atm-ws-"));
  return root;
}

/** Build the canonical fixture tree used across parsing/ranking assertions. */
function buildFixture() {
  const root = makeWorkspace();
  mkdirSync(join(root, "src", "components"), { recursive: true });
  mkdirSync(join(root, "my folder"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  mkdirSync(join(root, ".git", "objects"), { recursive: true });
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "src", "index.ts"), "export {};");
  writeFileSync(join(root, "src", "components", "Button.tsx"), "export {};");
  writeFileSync(join(root, "my folder", "file.ts"), "export {};");
  writeFileSync(join(root, ".github", "workflows", "ci.yml"), "on: [push]");
  writeFileSync(join(root, ".git", "config"), "[core]");
  writeFileSync(join(root, "node_modules", "pkg", "a.js"), "module.exports;");
  writeFileSync(join(root, "dist", "out.js"), "built();");
  // A symlinked directory pointing at a tree with a distinctive file. It must
  // never be expanded recursively, but may surface as a leaf candidate.
  const symTarget = mkdtempSync(join(tmpdir(), "atm-sym-"));
  writeFileSync(join(symTarget, "deepsecret.txt"), "x");
  symlinkSync(symTarget, join(root, "linkdir"), "dir");
  return { root, symTarget };
}

test("basic workspace query returns ranked, slash-separated candidates", async () => {
  const { root } = buildFixture();
  const result = await searchFileMentions({ workspaceRoot: root, query: "@index" });
  expect(result.truncated).toBe(false);
  expect(result.items.map((i) => i.value)).toContain("@src/index.ts");
  const hit = result.items.find((i) => i.value === "@src/index.ts");
  expect(hit).toMatchObject({
    label: "index.ts",
    description: "src/index.ts",
    isDirectory: false,
  });
});

test("quoted path with a space is completed and stays quoted", async () => {
  const { root } = buildFixture();
  const result = await searchFileMentions({ workspaceRoot: root, query: '@"my folder/f' });
  expect(result.items.map((i) => i.value)).toContain('@"my folder/file.ts"');
});

test("hidden non-git paths are eligible; .git and generated dirs are never surfaced", async () => {
  const { root } = buildFixture();
  const result = await searchFileMentions({ workspaceRoot: root, query: "@.github" });
  const values = result.items.map((i) => i.value);
  expect(values).toContain("@.github/workflows/ci.yml");
  for (const value of values) {
    const segments = value.replace(/^@"?/, "").replace(/"$/, "").split("/");
    expect(segments).not.toContain(".git");
    expect(segments).not.toContain("node_modules");
    expect(segments).not.toContain("dist");
  }
});

test("directory candidates carry a trailing slash and an isDirectory flag", async () => {
  const { root } = buildFixture();
  const result = await searchFileMentions({ workspaceRoot: root, query: "@src/" });
  const dir = result.items.find((i) => i.isDirectory);
  expect(dir).toBeTruthy();
  expect(dir?.value.endsWith("/")).toBe(true);
  expect(dir?.label.endsWith("/")).toBe(true);
});

test("parent-relative path searches the sibling tree and preserves the ../ prefix", async () => {
  const parent = mkdtempSync(join(tmpdir(), "atm-parent-"));
  const root = join(parent, "ws");
  const outside = join(parent, "outside");
  mkdirSync(root, { recursive: true });
  mkdirSync(join(outside, "shared"), { recursive: true });
  writeFileSync(join(outside, "shared", "a.ts"), "export {};");

  const result = await searchFileMentions({ workspaceRoot: root, query: "@../outside/shared/a" });
  expect(result.items.map((i) => i.value)).toContain("@../outside/shared/a.ts");
});

test("home-relative path expands the injected home directory", async () => {
  const home = mkdtempSync(join(tmpdir(), "atm-home-"));
  mkdirSync(join(home, "Documents"), { recursive: true });
  writeFileSync(join(home, "Documents", "foo.ts"), "export {};");

  const result = await searchFileMentions({
    workspaceRoot: makeWorkspace(),
    homeDir: home,
    query: "@~/Documents/foo",
  });
  expect(result.items.map((i) => i.value)).toContain("@~/Documents/foo.ts");
});

test("POSIX absolute path searches the named absolute base", async () => {
  const abs = mkdtempSync(join(tmpdir(), "atm-abs-"));
  mkdirSync(join(abs, "sub"), { recursive: true });
  writeFileSync(join(abs, "sub", "x.txt"), "x");

  const result = await searchFileMentions({
    workspaceRoot: makeWorkspace(),
    query: `@${abs}/sub/x`,
  });
  expect(result.items.map((i) => i.value)).toContain(`@${abs}/sub/x.txt`);
});

test("directory symlinks surface as leaves but are never expanded", async () => {
  const { root, symTarget } = buildFixture();
  const result = await searchFileMentions({ workspaceRoot: root, query: "@deepsecret" });
  const values = result.items.map((i) => i.value);
  expect(values).not.toContain("@linkdir/deepsecret.txt");
  expect(values.some((v) => v.includes("deepsecret"))).toBe(false);
  expect(symTarget).toBeTruthy();
});

test("a broken symlink is never surfaced as a candidate", async () => {
  const root = makeWorkspace();
  symlinkSync(join(root, "does-not-exist"), join(root, "brokenlink"), "file");
  const result = await searchFileMentions({ workspaceRoot: root, query: "@brokenlink" });
  expect(result.items.map((i) => i.value)).not.toContain("@brokenlink");
});

test("an explicitly narrowed ignored directory returns an empty list", async () => {
  const { root } = buildFixture();
  const result = await searchFileMentions({ workspaceRoot: root, query: "@node_modules/react" });
  expect(result.items).toEqual([]);
  expect(result.truncated).toBe(false);
});

test("ranking is case-insensitive and prefers exact basename matches", async () => {
  const root = makeWorkspace();
  writeFileSync(join(root, "index"), "x");
  writeFileSync(join(root, "index-extra"), "x");
  writeFileSync(join(root, "README.md"), "x");
  writeFileSync(join(root, "readme.txt"), "x");

  const result = await searchFileMentions({ workspaceRoot: root, query: "@index" });
  const values = result.items.map((i) => i.value);
  expect(values[0]).toBe("@index");
  expect(values).toContain("@index-extra");
  const readme = await searchFileMentions({ workspaceRoot: root, query: "@readme" });
  expect(readme.items.map((i) => i.value)).toEqual(
    expect.arrayContaining(["@README.md", "@readme.txt"]),
  );
});

test("the 20-candidate display cap holds without marking the response truncated", async () => {
  const root = makeWorkspace();
  for (let i = 0; i < 25; i += 1) {
    writeFileSync(join(root, `f${String(i).padStart(2, "0")}.ts`), "x");
  }
  const result = await searchFileMentions({ workspaceRoot: root, query: "@f" });
  expect(result.items.length).toBe(20);
  expect(result.truncated).toBe(false);
});

test("a missing or inaccessible base returns an empty list, not an error", async () => {
  const root = makeWorkspace();
  const result = await searchFileMentions({
    workspaceRoot: root,
    query: "@nope-such-dir/anything",
  });
  expect(result.items).toEqual([]);
  expect(result.truncated).toBe(false);
});

test("NUL bytes in the query are rejected as invalid", async () => {
  const root = makeWorkspace();
  await expect(
    searchFileMentions({ workspaceRoot: root, query: "@foo\0bar" }),
  ).rejects.toBeInstanceOf(InvalidMentionQueryError);
});

test("Windows bare @/ is rejected; drive and UNC forms classify without throwing", () => {
  const opts = { workspaceRoot: "C:\\repo", homeDir: "C:\\Users\\me", platform: "win32" as const };
  expect(() => parseMentionQuery("@/", opts)).toThrow(InvalidMentionQueryError);
  expect(() => parseMentionQuery("@/foo", opts)).toThrow(InvalidMentionQueryError);
  // A trailing slash means "list this directory", so the whole typed path is the base.
  const drive = parseMentionQuery("@C:/repo/a/", opts);
  expect(drive.baseDir.replace(/\\/g, "/")).toBe("C:/repo/a/");
  const unc = parseMentionQuery("@//server/share/a/", opts);
  expect(unc.baseDir.replace(/\\/g, "/")).toBe("//server/share/a/");
});

test("searching a synthetic Windows drive base returns empty rather than throwing", async () => {
  const result = await searchFileMentions({
    workspaceRoot: "C:\\repo",
    homeDir: "C:\\Users\\me",
    platform: "win32",
    query: "@C:/repo/a",
  });
  expect(result.items).toEqual([]);
});

test("the 10,000-entry traversal budget stops the walk and reports truncation", async () => {
  const root = makeWorkspace();
  const fakeDirents = Array.from({ length: 10001 }, (_, i) => ({
    name: `entry${i}.ts`,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  }));
  const result = await searchFileMentions({
    workspaceRoot: root,
    query: "@entry",
    readDir: async () => fakeDirents,
  });
  expect(result.truncated).toBe(true);
  expect(result.items.length).toBeLessThanOrEqual(20);
});

test("the 500 ms wall-clock budget stops the walk and reports truncation", async () => {
  const root = makeWorkspace();
  for (let i = 0; i < 10; i += 1) {
    writeFileSync(join(root, `slow${i}.ts`), "x");
  }
  let calls = 0;
  const now = () => {
    calls += 1;
    return calls < 5 ? 0 : 600;
  };
  const result = await searchFileMentions({ workspaceRoot: root, query: "@slow", now });
  expect(result.truncated).toBe(true);
});

test("an aborted signal stops the walk promptly", async () => {
  const root = makeWorkspace();
  const fakeDirents = Array.from({ length: 100 }, (_, i) => ({
    name: `ab${i}.ts`,
    isDirectory: () => false,
    isSymbolicLink: () => false,
  }));
  const controller = new AbortController();
  controller.abort();
  const result = await searchFileMentions({
    workspaceRoot: root,
    query: "@ab",
    readDir: async () => fakeDirents,
    signal: controller.signal,
  });
  expect(result.items).toEqual([]);
});
