import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

/** A React stand-in: apply() registers components without rendering them. */
function reactStub() {
  return {
    createElement: () => null,
    Fragment: "fragment",
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
    useEffect: () => {},
    useCallback: (callback) => callback,
  };
}

/**
 * Evaluate the client bundle in a browser-shaped sandbox and materialize its
 * factory, the way the DSH module loader does at boot.
 * @param globals - extra globals visible to the bundle (e.g. the injected route).
 * @returns the module exports and the recorded registration.
 */
async function mountClient(globals = {}) {
  const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  let registration;
  const window = {
    __ModuleLoader__: { load: (value) => { registration = value; } },
    addEventListener: () => {},
    removeEventListener: () => {},
    devicePixelRatio: 1,
    ...globals,
  };
  runInNewContext(source, { window, globalThis: window, console, TextDecoder, performance });
  assert.ok(registration !== undefined, "the bundle registers itself with the module loader");
  return { registration, exports: registration.factory((name) => (name === "react" ? reactStub() : {})) };
}

test("the bundle registers under the package id and exports the body face", async () => {
  const { registration, exports } = await mountClient();
  assert.equal(registration.id, "dsh-blend-preview");
  assert.deepEqual(Array.from(exports.inject), ["slots", "locale", "resources", "documentPreviews"]);
  assert.equal(typeof exports.apply, "function");
  assert.equal(typeof exports.__createViewer, "function");
});

test("apply registers a .blend renderer, its body slot and both dictionaries", async () => {
  const { exports } = await mountClient({
    __DSH_BLEND_PREVIEW_CONFIG__: { routePath: "/api/custom-blend", extensions: ["blend", "blend1"] },
  });
  const renderers = [];
  const slots = [];
  const dictionaries = [];
  const t = (key) => key;
  const ctx = {
    locale: {
      bind: () => t,
      register: (namespace, dictionary) => dictionaries.push({ namespace, dictionary }),
    },
    documentPreviews: {
      register: (definition) => renderers.push(definition),
    },
    slots: {
      inject: (name, factory) => {
        assert.equal(name, "sidebar.right.tab.document");
        factory();
      },
      register: (spec, body) => slots.push({ spec, body }),
    },
    effect: (factory) => factory(),
  };
  exports.apply(ctx);
  assert.equal(renderers.length, 1);
  assert.equal(renderers[0].id, "dsh-blend-preview/blend");
  assert.deepEqual(Array.from(renderers[0].extensions), ["blend", "blend1"]);
  assert.deepEqual(Array.from(renderers[0].binaryExtensions), ["blend", "blend1"]);
  assert.equal(renderers[0].priority, "extension");
  assert.equal(renderers[0].loading, "renderer");
  assert.equal(renderers[0].wrap, false);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].spec.key, "dsh-blend-preview/blend");
  assert.equal(slots[0].spec.locale, "blendPreview");
  assert.equal(typeof slots[0].body, "function");
  const injected = slots[0].spec.inject();
  assert.equal(injected.routePath, "/api/custom-blend");
  assert.equal(injected.t, t);
  assert.equal(dictionaries.length, 1);
  assert.ok(dictionaries[0].dictionary.zh.loading.length > 0);
  assert.ok(dictionaries[0].dictionary.en.loading.length > 0);
});

test("a missing injected config falls back to the Host defaults", async () => {
  const { exports } = await mountClient();
  const renderers = [];
  const slots = [];
  const ctx = {
    locale: { bind: () => (key) => key, register: () => {} },
    documentPreviews: { register: (definition) => renderers.push(definition) },
    slots: { inject: (name, factory) => factory(), register: (spec) => slots.push(spec) },
    effect: (factory) => factory(),
  };
  exports.apply(ctx);
  assert.deepEqual(Array.from(renderers[0].extensions), ["blend"]);
  assert.equal(slots[0].inject().routePath, "/api/blend-preview");
});

