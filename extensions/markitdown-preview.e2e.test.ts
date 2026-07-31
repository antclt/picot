// ABOUTME: Runs opt-in real MarkItDown conversions against stable-format fixtures.
// ABOUTME: Keeps ordinary test runs independent from the host Python installation and package.

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { createMarkItDownPreviewService } from "./markitdown-preview.ts";

const E2E_ENABLED = process.env.MARKITDOWN_E2E === "1";
const FIXTURE_ROOT = path.join(import.meta.dirname, "fixtures", "markitdown");
const FIXTURES = ["sample.docx", "sample.pptx", "sample.xlsx", "sample.xls", "sample.msg"] as const;
const probeService = E2E_ENABLED ? createMarkItDownPreviewService() : null;
const dependency = probeService ? await probeService.probe() : null;
const dependencyUnavailable = dependency?.status === "unavailable";

if (E2E_ENABLED && dependencyUnavailable) {
  console.info(
    `[MarkItDown E2E] Skipped: compatible local dependency unavailable (${dependency.reason}` +
      `${dependency.pythonVersion ? ` ${dependency.pythonVersion}` : ""}).`,
  );
}

describe.skipIf(!E2E_ENABLED || dependencyUnavailable)(
  "MarkItDown real conversion smoke tests",
  () => {
    for (const fixture of FIXTURES) {
      test(`converts ${fixture} to non-empty Markdown`, async () => {
        const fixturePath = path.join(FIXTURE_ROOT, fixture);
        if (!fs.existsSync(fixturePath)) {
          throw new Error(
            `MARKITDOWN_E2E=1 requires the checked-in fixture ${fixturePath}; ` +
              "ordinary test runs intentionally skip this suite",
          );
        }

        const fd = fs.openSync(fixturePath, fs.constants.O_RDONLY);
        try {
          const stat = fs.fstatSync(fd);
          const suffix = path.extname(fixture).slice(1) as "docx" | "pptx" | "xlsx" | "xls" | "msg";
          const service = createMarkItDownPreviewService();
          const result = await service.convertFromDescriptor({
            fd,
            size: stat.size,
            suffix,
            signal: new AbortController().signal,
          });
          expect(result.status).toBe("ready");
          if (result.status === "ready") expect(result.markdown.trim()).not.toBe("");
          await service.dispose();
        } finally {
          try {
            fs.closeSync(fd);
          } catch (error) {
            expect(error?.code).toBe("EBADF");
          }
        }
      });
    }
  },
);
