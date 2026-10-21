import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BlendExporter, BlendPreviewError, blenderCandidates, internals, runProcess } from "../lib/blender.js";
import { resolveConfig } from "../lib/config.js";

test("a configured blenderPath wins and the search list still covers PATH", () => {
  const candidates = blenderCandidates(
    { blenderPath: "C:\\tools\\blender.exe" },
    { PATH: "C:\\a;C:\\b", BLENDER_PATH: "C:\\env\\blender.exe" }
  );
  assert.equal(candidates[0], "C:\\tools\\blender.exe");
  assert.ok(candidates.includes("C:\\env\\blender.exe"));
  assert.ok(candidates.some((entry) => /blender(\.exe)?$/.test(entry)));
});

test("cache keys separate size, mtime and the modifier recipe", () => {
  const base = internals.cacheKey("/x/a.blend", 10, 1000, true);
  assert.equal(base, internals.cacheKey("/x/a.blend", 10, 1000, true));
  assert.notEqual(base, internals.cacheKey("/x/a.blend", 11, 1000, true));
  assert.notEqual(base, internals.cacheKey("/x/a.blend", 10, 1001, true));
  assert.notEqual(base, internals.cacheKey("/x/a.blend", 10, 1000, false));
});

test("runProcess captures output and the exit code", async () => {
  const result = await runProcess(process.execPath, ["-e", "console.log('out'); console.error('err'); process.exit(3)"], {
    timeoutMs: 20_000,
  });
  assert.equal(result.code, 3);
  assert.match(result.stdout, /out/);
  assert.match(result.stderr, /err/);
  assert.equal(result.timedOut, false);
});

test("runProcess reports a timeout without hanging", async () => {
  const result = await runProcess(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { timeoutMs: 300 });
  assert.equal(result.timedOut, true);
});

test("a missing scene is refused before any process starts", async () => {
  const config = resolveConfig({ blenderPath: process.execPath });
  const exporter = new BlendExporter(config);
  try {
    await assert.rejects(
      exporter.export(join(tmpdir(), "dsh-blend-preview-does-not-exist.blend")),
      (error) => error instanceof Error && error.code === "ENOENT"
    );
  } finally {
    exporter.dispose();
  }
});

test("a broken Blender run surfaces BLEND_EXPORT_FAILED with the log tail", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blend-exporter-"));
  try {
    const blend = join(dir, "scene.blend");
    await writeFile(blend, "not really a blend");
    const exporter = new BlendExporter(resolveConfig({ blenderPath: process.execPath, cacheDir: join(dir, "cache"), timeoutMs: 20_000 }));
    try {
      await assert.rejects(exporter.export(blend), (error) => {
        assert.ok(error instanceof BlendPreviewError);
        assert.equal(error.code, "BLEND_EXPORT_FAILED");
        assert.match(error.detail ?? "", /bad option|background|node/i);
        return true;
      });
    } finally {
      exporter.dispose();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a complete cache entry is returned without touching Blender", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blend-cache-"));
  try {
    const blend = join(dir, "scene.blend");
    await writeFile(blend, "blend-bytes");
    const info = await stat(blend);
    const config = resolveConfig({ blenderPath: "C:\\definitely-missing-blender.exe", cacheDir: join(dir, "cache") });
    const key = internals.cacheKey(blend, info.size, info.mtimeMs, true);
    const entry = join(config.cacheDir, key);
    await mkdir(entry, { recursive: true });
    await writeFile(join(entry, "model.glb"), "glTF\0\0\0");
    await writeFile(join(entry, "scene.json"), JSON.stringify({ blender: "Blender test", counts: { triangles: 2 } }));
    await writeFile(
      join(entry, "meta.json"),
      JSON.stringify({ key, recipe: 1, blender: "Blender test", elapsedMs: 5, glbBytes: 10, createdAt: new Date().toISOString() })
    );
    const exporter = new BlendExporter(config);
    try {
      const cached = await exporter.export(blend);
      assert.equal(cached.cached, true);
      assert.equal(cached.glbBytes, 7);
      assert.equal(cached.info.counts.triangles, 2);
    } finally {
      exporter.dispose();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an undiscoverable Blender produces an actionable BLENDER_MISSING", () => {
  const error = internals.missingBlenderError({ blenderPath: "C:\\no-such-blender.exe" });
  assert.equal(error.code, "BLENDER_MISSING");
  assert.match(error.hint ?? "", /blenderPath/);
  assert.match(error.hint ?? "", /no-such-blender/);
});

test("a bad configured path does not mask a discovered Blender", () => {
  const candidates = blenderCandidates({ blenderPath: "C:\\no-such-blender.exe" }, { PATH: "" });
  assert.equal(candidates[0], "C:\\no-such-blender.exe");
  assert.ok(candidates.length > 1, "the fallback search still runs after the explicit path");
});
