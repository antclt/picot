// ABOUTME: Confirms the main-chat composer wires the @-file-mention controller and popup.
// ABOUTME: Enter-ordering behavior is covered by ui/at-file-mention.test.js.
import { describe, expect, test } from "vitest";

describe.skip("legacy app.js @-file mention wiring", () => {
  test("migrated to public/native/app-at-file-mention.test.js", () => {
    expect(true).toBe(true);
  });
});
