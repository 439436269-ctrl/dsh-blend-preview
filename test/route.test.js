import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BlendPreviewError } from "../lib/blender.js";
import { resolveConfig } from "../lib/config.js";
import { registerBlendRoute } from "../lib/route.js";

/** A route mounted on a stub connection service, plus one temporary .blend. */
async function fixture(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "blend-route-"));
  const blend = join(dir, "scene.blend");
  const glb = join(dir, "model.glb");
  await writeFile(blend, "blend");
  await writeFile(glb, "glTF-binary-data");
  const entry = {
    key: "key123",
    glbPath: glb,
    glbBytes: 16,
    elapsedMs: 12.5,
    cached: false,
    blender: "Blender 5.2.2 LTS",
    source: { path: blend, bytes: 5, mtimeMs: 1 },
    info: {
      blender: "Blender 5.2.2 LTS",
      file: blend,
      file_name: "scene.blend",
      scene: "Scene",
      counts: { triangles: 12, objects: 1, visible_meshes: 1, materials: 1, cameras: 0, lights: 0, collections: 1 },
      bounds: { size_mm: [10, 20, 30] },
      objects: [],
      materials: [],
    },
  };
  const calls = [];
  const state = { route: undefined };
  const ctx = {
    connection: {
      fetch: {
        register: (value) => {
          state.route = value;
          return () => calls.push("disposed");
        },
      },
    },
  };
  const config = resolveConfig({ ...overrides });
  const exporter = {
    export: async (path, options) => {
      calls.push({ path, signal: options?.signal !== undefined });
      return entry;
    },
  };
  registerBlendRoute(ctx, exporter, config);
  return {
    dir,
    blend,
    glb,
    entry,
    config,
    calls,
    register(newExporter) {
      registerBlendRoute(ctx, newExporter, config);
    },
    async request(query) {
      const url = new URL(`http://x${config.routePath}`);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      return state.route.fetch(new Request(url));
    },
    async head(query) {
      const url = new URL(`http://x${config.routePath}`);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      return state.route.fetch(new Request(url, { method: "HEAD" }));
    },
  };
}

test("info answers the scene document with cache facts", async () => {
  const fx = await fixture();
  try {
    const response = await fx.request({ path: fx.blend, kind: "info" });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.scene.counts.triangles, 12);
    assert.equal(body.cache.key, "key123");
    assert.equal(body.cache.cached, false);
    assert.equal(body.blender, "Blender 5.2.2 LTS");
    assert.equal(body.file.name, "scene.blend");
  } finally {
    await rm(fx.dir, { recursive: true, force: true });
  }
});

test("glb streams the exported model with its exact length", async () => {
  const fx = await fixture();
  try {
    const response = await fx.request({ path: fx.blend, kind: "glb" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "model/gltf-binary");
    assert.equal(response.headers.get("content-length"), "16");
    assert.equal(await response.text(), "glTF-binary-data");
  } finally {
    await rm(fx.dir, { recursive: true, force: true });
  }
});

test("HEAD answers headers without a body and still converts", async () => {
  const fx = await fixture();
  try {
    const response = await fx.request({ path: fx.blend, kind: "glb" });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    const head = await fx.head({ path: fx.blend, kind: "glb" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.equal(fx.calls.filter((call) => typeof call === "object").length, 2);
  } finally {
    await rm(fx.dir, { recursive: true, force: true });
  }
});

test("bad parameters are refused before converting", async () => {
  const fx = await fixture();
  try {
    assert.equal((await fx.request({ kind: "info" })).status, 400);
    assert.equal((await fx.request({ path: "relative/scene.blend", kind: "info" })).status, 400);
    assert.equal((await fx.request({ path: fx.blend, kind: "movie" })).status, 400);
    assert.equal((await fx.request({ path: join(fx.dir, "notes.txt"), kind: "info" })).status, 400);
    assert.equal(fx.calls.length, 0, "no conversion happens for a refused request");
  } finally {
    await rm(fx.dir, { recursive: true, force: true });
  }
});

test("a missing file is a 404", async () => {
  const fx = await fixture();
  try {
    const response = await fx.request({ path: join(fx.dir, "gone.blend"), kind: "info" });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "BLEND_NOT_FOUND");
  } finally {
    await rm(fx.dir, { recursive: true, force: true });
  }
});

test("typed exporter failures map to status and a machine code", async () => {
  const fx = await fixture();
  try {
    fx.register({
      export: async () => {
        throw new BlendPreviewError("Blender was not found on this machine.", "BLENDER_MISSING", { hint: "install it" });
      },
    });
    const response = await fx.request({ path: fx.blend, kind: "info" });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "BLENDER_MISSING");
    assert.equal(body.error.hint, "install it");
  } finally {
    await rm(fx.dir, { recursive: true, force: true });
  }
});

