// ABOUTME: Verifies the ephemeral-environment predicate that gates loopback-only
// ABOUTME: routes (e.g. /api/file-mentions) away from Side/Quick Chat Pi servers.
import { expect, test } from "vitest";
import { parseEphemeralEnv } from "./ephemeral-env.ts";

test("returns null when no ephemeral marker is present", () => {
  expect(parseEphemeralEnv({})).toBeNull();
  expect(parseEphemeralEnv({ PI_STUDIO_EPHEMERAL_KIND: undefined })).toBeNull();
});

test("detects a side-chat ephemeral process", () => {
  expect(
    parseEphemeralEnv({
      PI_STUDIO_EPHEMERAL_KIND: "side-chat",
      PI_STUDIO_EPHEMERAL_INSTANCE_ID: "inst-1",
      PI_STUDIO_EPHEMERAL_GENERATION: "3",
    }),
  ).toEqual({ kind: "side-chat", instanceId: "inst-1", generation: 3 });
});

test("detects a quick-chat ephemeral process", () => {
  expect(
    parseEphemeralEnv({
      PI_STUDIO_EPHEMERAL_KIND: "quick-chat",
      PI_STUDIO_EPHEMERAL_INSTANCE_ID: "q-9",
    }),
  ).toEqual({ kind: "quick-chat", instanceId: "q-9", generation: 0 });
});

test("rejects an unknown kind or missing instance id", () => {
  expect(parseEphemeralEnv({ PI_STUDIO_EPHEMERAL_KIND: "nope" })).toBeNull();
  expect(
    parseEphemeralEnv({
      PI_STUDIO_EPHEMERAL_KIND: "side-chat",
      PI_STUDIO_EPHEMERAL_INSTANCE_ID: "",
    }),
  ).toBeNull();
});

test("any non-null result blocks /api/file-mentions on that Pi server", () => {
  // The route guards on `EPHEMERAL_ENV = parseEphemeralEnv()`; a non-null value
  // means this is a Side/Quick Chat process that must not serve the endpoint.
  for (const kind of ["side-chat", "quick-chat"]) {
    expect(
      parseEphemeralEnv({ PI_STUDIO_EPHEMERAL_KIND: kind, PI_STUDIO_EPHEMERAL_INSTANCE_ID: "x" }),
    ).not.toBeNull();
  }
  expect(parseEphemeralEnv({})).toBeNull();
});
