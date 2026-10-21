import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULTS, expandHome, resolveConfig } from "../lib/config.js";

test("defaults keep the route under /api and the suffix list normalized", () => {
  const config = resolveConfig(undefined);
  assert.equal(config.enabled, true);
  assert.equal(config.routePath, "/api/blend-preview");
  assert.deepEqual(config.extensions, ["blend"]);
  assert.equal(config.applyModifiers, true);
  assert.equal(config.timeoutMs, DEFAULTS.timeoutMs);
  assert.ok(config.cacheDir.endsWith(join(".dsh", "cache", "blend-preview")));
});

test("a route outside /api falls back to the fenced default", () => {
  assert.equal(resolveConfig({ routePath: "/blend" }).routePath, "/api/blend-preview");
  assert.equal(resolveConfig({ routePath: "media/blend" }).routePath, "/api/blend-preview");
  assert.equal(resolveConfig({ routePath: "/api/custom/" }).routePath, "/api/custom");
});

test("suffixes are lowercased, de-duplicated and stripped of dots", () => {
  assert.deepEqual(resolveConfig({ extensions: [".BLEND", " blend ", "blend1", ""] }).extensions, ["blend", "blend1"]);
  assert.deepEqual(resolveConfig({ extensions: [] }).extensions, ["blend"]);
  assert.deepEqual(resolveConfig({ extensions: ["..."] }).extensions, ["blend"]);
});

test("numeric settings are clamped instead of trusted", () => {
  assert.equal(resolveConfig({ timeoutMs: 1 }).timeoutMs, 5000);
  assert.equal(resolveConfig({ timeoutMs: 10_000_000 }).timeoutMs, 900_000);
  assert.equal(resolveConfig({ maxBytes: 0 }).maxBytes, 1);
  assert.equal(resolveConfig({ cacheEntries: 9999 }).cacheEntries, 500);
  assert.equal(resolveConfig({ timeoutMs: Number.NaN }).timeoutMs, DEFAULTS.timeoutMs);
});

test("tilde paths expand against the home directory", async () => {
  const home = expandHome("~/somewhere");
  assert.ok(home.includes("somewhere"));
  assert.ok(!home.startsWith("~"));
  const dir = await mkdtemp(join(tmpdir(), "blend-config-"));
  try {
    assert.equal(resolveConfig({ cacheDir: dir }).cacheDir, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
