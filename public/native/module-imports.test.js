import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const STATIC_IMPORT = /^import(?:[^;\n]*\sfrom\s+|\s*\()\s*["'](\.[^"']+)["']/gm;
const BARE_IMPORT = /^import(?:[^;\n]*\sfrom\s+|\s*\()\s*["']([^./][^"']*)["']/gm;

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

function collectBareImports(entryPath) {
  const pending = [entryPath];
  const visited = new Set();
  const bareImports = new Set();

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (visited.has(filePath)) continue;
    visited.add(filePath);

    const source = readFileSync(filePath, "utf8");
    for (const match of source.matchAll(BARE_IMPORT)) bareImports.add(match[1]);
    for (const match of source.matchAll(STATIC_IMPORT)) {
      const importedPath = resolve(dirname(filePath), match[1]);
      if (existsSync(importedPath) && importedPath.endsWith(".js")) pending.push(importedPath);
    }
  }

  return [...bareImports].sort();
}

describe("native application module graph", () => {
  it("only loads module entry points that exist", () => {
    const publicDir = resolve(process.cwd(), "public");
    const indexHtml = readFileSync(resolve(publicDir, "index.html"), "utf8");
    const moduleSources = [
      ...indexHtml.matchAll(/<script\s+type=["']module["']\s+src=["']([^"']+)["']/g),
    ].map(([, source]) => source);

    expect(
      moduleSources.map((source) => resolve(publicDir, source)).filter((path) => !existsSync(path)),
    ).toEqual([]);
  });

  it("does not request missing modules that the static fallback serves as HTML", () => {
    const entryPath = resolve(process.cwd(), "public/native/app.js");

    expect(collectMissingImports(entryPath)).toEqual([]);
  });

  it("maps every browser package import to a same-origin vendor bundle", () => {
    const entryPath = resolve(process.cwd(), "public/native/app.js");
    const indexHtml = readFileSync(resolve(process.cwd(), "public/index.html"), "utf8");
    const importMapSource = indexHtml.match(
      /<script type="importmap">\s*([\s\S]*?)\s*<\/script>/,
    )?.[1];
    const importMap = JSON.parse(importMapSource).imports;

    expect(collectBareImports(entryPath).filter((specifier) => !importMap[specifier])).toEqual([]);
  });
});
