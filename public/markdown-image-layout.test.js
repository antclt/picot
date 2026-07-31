// ABOUTME: Verifies Markdown images remain within their rendering container.
// ABOUTME: Covers assistant chat messages and Markdown file previews.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const stylePath = join(process.cwd(), "public/style.css");

describe("Markdown image layout", () => {
  test("constrains assistant and file-preview images to their container width", async () => {
    const css = await readFile(stylePath, "utf8");

    expect(css).toMatch(
      /\.message\.assistant \.message-content img,\s*\.file-markdown-preview img\s*\{\s*max-width:\s*100%;\s*height:\s*auto;\s*\}/,
    );
  });
});
