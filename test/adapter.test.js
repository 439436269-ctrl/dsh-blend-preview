import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const PACKAGE_ROOT = new URL("..", import.meta.url);

/**
 * Copy the real `lib/` into a temporary tree with a stub schemastery, so the
 * host entry can be imported without the DSH runtime present. This is the
 * adapter layer: it proves `apply()` wires the route and the index injection,
 * which the pure unit tests cannot.
 * @returns the module namespace and the temp root.
 */
async function mountHostEntry() {
  const root = await mkdtemp(join(tmpdir(), "blend-preview-adapter-"));
  await cp(new URL("lib", PACKAGE_ROOT), join(root, "lib"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "dsh-blend-preview", type: "module" }));
  const schemasteryDir = join(root, "node_modules", "@deepseek-ai", "schemastery");
  await mkdir(schemasteryDir, { recursive: true });
  await writeFile(
    join(schemasteryDir, "package.json"),
    JSON.stringify({ name: "@deepseek-ai/schemastery", version: "0.0.0", type: "module", main: "index.js" })
  );
  await writeFile(
    join(schemasteryDir, "index.js"),
    [
      "const chain = () => {",
      "  const node = new Proxy(function () {}, {",
      "    get: (_target, key) => (key === 'then' ? undefined : chain()),",
      "    apply: () => chain(),",
      "  });",
      "  return node;",
      "};",
      "const z = new Proxy({}, { get: () => () => chain() });",
      "export default z;",
    ].join("\n")
  );
  const module = await import(pathToFileURL(join(root, "lib", "index.js")).href);
  return { module, root };
}

test("the host entry exposes name, inject and Config", async () => {
  const { module, root } = await mountHostEntry();
  try {
    assert.equal(module.name, "blend-preview");
    assert.deepEqual(module.inject, ["connection"]);
    assert.ok(module.Config !== undefined, "the schema is exported for the loader");
    assert.equal(typeof module.apply, "function");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("apply registers the route, publishes the path, and disposes both effects", async () => {
  const { module, root } = await mountHostEntry();
  try {
    let route;
    const injected = [];
    const handlers = [];
    const disposers = [];
    const ctx = {
      connection: {
        fetch: {
          register: (entry) => {
            route = entry;
            return () => disposers.push("route");
          },
        },
      },
      effect: (factory, label) => {
        const cleanup = factory();
        if (typeof cleanup === "function") disposers.push(label);
      },
      on: (event, listener) => {
        assert.equal(event, "webserver/index-inject");
        handlers.push(listener);
      },
      logger: { warn: () => {} },
    };
    module.apply(ctx, { routePath: "/api/custom-blend", timeoutMs: 9000 });
    assert.equal(route.path, "/api/custom-blend");
    assert.deepEqual(route.methods, ["GET", "HEAD"]);
    assert.equal(route.requestBody, "buffered");
    assert.ok(disposers.includes("blend-preview: conversion route"));
    assert.ok(disposers.includes("blend-preview: blender processes"));

    for (const handler of handlers) handler(injected);
    assert.equal(injected.length, 1);
    assert.equal(injected[0].kind, "global");
    assert.equal(injected[0].name, "__DSH_BLEND_PREVIEW_CONFIG__");
    assert.deepEqual(injected[0].value, { routePath: "/api/custom-blend", extensions: ["blend"] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a disabled plugin mounts nothing", async () => {
  const { module, root } = await mountHostEntry();
  try {
    let registered = 0;
    let listened = 0;
    const ctx = {
      connection: { fetch: { register: () => { registered += 1; } } },
      effect: () => {},
      on: () => { listened += 1; },
    };
    module.apply(ctx, { enabled: false });
    assert.equal(registered, 0);
    assert.equal(listened, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the package declares the client half and ships the python helper", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", PACKAGE_ROOT), "utf8"));
  assert.equal(manifest.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(manifest.dsh.client.platform, "web");
  assert.ok(manifest.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-sidebar-documentpreview"));
  assert.ok(manifest.files.includes("lib/**/*.js"));
  assert.ok(manifest.files.includes("lib/**/*.py"));
  assert.ok(manifest.files.includes("cordis.patch.yml"));
  assert.equal(manifest.exports["./client"], "./lib/client.js");
  assert.deepEqual(manifest.peerDependencies, { "@deepseek-ai/cordis": "^4.0.1" });
  assert.ok(existsSync(new URL("cordis.patch.yml", PACKAGE_ROOT)));
  assert.ok(existsSync(new URL("lib/scene.py", PACKAGE_ROOT)));
});
