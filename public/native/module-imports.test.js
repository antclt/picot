import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const STATIC_IMPORT = /^import(?:[^;\n]*\sfrom\s+|\s*\()\s*["'](\.[^"']+)["']/gm;

function collectMissingImports(entryPath) {
  const pending = [entryPath];
  const visited = new Set();
  const missing = [];

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (visited.has(filePath)) continue;
    visited.add(filePath);

    const source = readFileSync(filePath, "utf8");
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const importedPath = resolve(dirname(filePath), match[1]);
      if (!existsSync(importedPath)) {
        missing.push(`${filePath} imports missing ${importedPath}`);
        continue;
      }
      if (importedPath.endsWith(".js")) pending.push(importedPath);
    }
  }

  return missing;
}

describe("native application module graph", () => {
  it("does not request missing modules that the static fallback serves as HTML", () => {
    const entryPath = resolve(process.cwd(), "public/native/app.js");

    expect(collectMissingImports(entryPath)).toEqual([]);
  });
});
