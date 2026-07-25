// @vitest-environment node

// ABOUTME: Tests the embedded-server skill command surface: normalization and
// ABOUTME: the owner-only skill-inventory RPC request parsers.

import { describe, expect, test } from "vitest";
import {
  normalizeSkillCommands,
  parseSkillInventoryMutation,
  parseSkillInventoryScope,
} from "./embedded-server.ts";

describe("normalizeSkillCommands", () => {
  test("returns only invokable skills with canonical scope metadata", () => {
    expect(
      normalizeSkillCommands([
        {
          name: "skill:release-notes",
          description: "  Cut a release  ",
          source: "skill",
          sourceInfo: { scope: "project" },
        },
        {
          name: "skill:research",
          source: "skill",
          sourceInfo: { scope: "user" },
        },
        { name: "compact", source: "extension" },
      ]),
    ).toEqual([
      {
        command: "/skill:release-notes",
        name: "release-notes",
        description: "Cut a release",
        scope: "project",
      },
      {
        command: "/skill:research",
        name: "research",
        description: "",
        scope: "personal",
      },
    ]);
  });
});

describe("parseSkillInventoryScope", () => {
  test("accepts the two known scopes", () => {
    expect(parseSkillInventoryScope("global")).toBe("global");
    expect(parseSkillInventoryScope("project")).toBe("project");
  });

  test.each([undefined, null, "local", 1, "Global"])("rejects %s", (value) => {
    expect(() => parseSkillInventoryScope(value)).toThrow("Invalid skill inventory scope");
  });
});

describe("parseSkillInventoryMutation", () => {
  test("round-trips a well-formed skill mutation", () => {
    expect(
      parseSkillInventoryMutation({
        scope: "project",
        target: { kind: "skill", id: "/tmp/a/SKILL.md" },
        enabled: false,
      }),
    ).toEqual({
      scope: "project",
      target: { kind: "skill", id: "/tmp/a/SKILL.md" },
      enabled: false,
    });
  });

  test("accepts a group target", () => {
    expect(
      parseSkillInventoryMutation({
        scope: "global",
        target: { kind: "group", id: "root::skills/foo" },
        enabled: true,
      }),
    ).toEqual({
      scope: "global",
      target: { kind: "group", id: "root::skills/foo" },
      enabled: true,
    });
  });

  test.each([
    null,
    { scope: "bad" },
    { scope: "global", target: { kind: "skill" } },
    { scope: "global", target: { kind: "skill", id: "" } },
    { scope: "global", target: { kind: "unknown", id: "x" }, enabled: true },
    { scope: "global", target: { kind: "skill", id: "x" }, enabled: "yes" },
    { scope: "project", target: { kind: "group", id: "g" } },
  ])("rejects malformed payload %j", (payload) => {
    expect(() => parseSkillInventoryMutation(payload)).toThrow(/Invalid skill inventory/);
  });
});
