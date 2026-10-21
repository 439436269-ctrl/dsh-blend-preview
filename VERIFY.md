# Verification record — dsh-blend-preview 0.1.0

Date: 2026-10-20. Machine: Windows 11, DeepSeek Harness Desktop **0.2.1-rc.2**
(`<DSH install>`), **Blender 5.2.2 LTS**
(`<Blender install>\blender.exe`), Node 24.22.0.
Scene under test: `<workspace>\plate-rack-base\out\plate_rack_base.blend`
(280,645 bytes, 5 mesh objects, 22,960 triangles, 3 materials, 2 collections).

## L1 — unit / adapter tests

```
node --test test/*.test.js
# tests 27  pass 27  fail 0
```

| file | what it proves |
|---|---|
| `test/config.test.js` | defaults; route forced under `/api/`; suffix normalization; numeric clamps; `~` expansion; custom cache dir |
| `test/blender.test.js` | candidate order (config → env → PATH → platform installs); cache-key sensitivity to size / mtime / modifiers; `runProcess` output + exit code + timeout; missing scene refused before spawning; a broken Blender run surfaces `BLEND_EXPORT_FAILED` with the log tail; a complete cache entry is returned without Blender; `BLENDER_MISSING` hint names `blenderPath` and the probed locations |
| `test/route.test.js` | info JSON (scene + cache facts + Blender version); GLB bytes with `model/gltf-binary` and exact length; HEAD without a body; `path`/`kind`/suffix validation before any conversion; 404 for a missing file; `BLENDER_MISSING` → 503 with the hint |
| `test/adapter.test.js` | the Host entry imports with a stub schemastery; `apply()` registers `GET|HEAD /api/blend-preview`, publishes `__DSH_BLEND_PREVIEW_CONFIG__`, disposes both effects; `enabled: false` mounts nothing; the manifest ships `lib/**/*.py` and the client export |
| `test/client.test.js` | the bundle evaluates in a browser-shaped sandbox, registers id `dsh-blend-preview`, exports `apply`/`inject`/`__createViewer`; `apply()` registers one renderer (`.blend`, extension priority, renderer-owned loading), one body slot and both dictionaries; the injected route path is honoured, and a missing injection falls back to `/api/blend-preview` |

## L2 — live conversion (`scripts/live-selftest.mjs`)

```
file:   <workspace>/plate-rack-base/out/plate_rack_base.blend
cache:  %TEMP%\blend-selftest-cache-*

PASS  cold conversion produced a GLB  1050200 bytes
PASS  cold conversion reports a Blender version  Blender 5.2.2 LTS
PASS  scene JSON has objects and triangles  5 objects / 22960 tris
PASS  scene bounds are in millimetres  322 × 144.809 × 182.555
PASS  cold conversion was not a cache hit  1325 ms
PASS  second call is a cache hit
PASS  cache hit is much faster than the cold run  3 ms
PASS  both calls share one cache key  fcff667d0558178e6981ed49
PASS  concurrent requests share one in-flight job  1 job(s)
PASS  concurrent callers get the same artifact
PASS  cache stays within cacheEntries  1 entries

ALL PASS
```

The exported GLB is 1,050,200 bytes; the scene JSON reports
`Base_Full` 322 × 129 × 16 mm (9,092 tris), `Half_L` / `Half_R`
161 × 129 × 16 mm (4,546 tris each), `Plate` 196 × 126.7 × 157.4 mm,
`Rack_Proxy` 306 × 113 × 123 mm; units `MILLIMETERS (1000 mm/unit)`.

## L3 — HTTP route on a real DSH host

Temporary profile `blendverify` (web template + the packed tarball),
`dsh --profile blendverify --no-open --port 0`, authenticated with the
printed `?token=` cookie:

```
index: 200 len=35270
boot has plugin: True
__DSH_BLEND_PREVIEW_CONFIG__ injected: True
info:  200 in 1.4s len=2415
scene: 22960 tris, blender=Blender 5.2.2 LTS, cached=False, glb=1050200
glb:   200 bytes=1050200 type=model/gltf-binary
```

## L4 — headless browser end-to-end (`scripts/e2e-browser.mjs`)

Flow: open the app with the token, start a conversation, open the right
Sidebar, Workspace files, walk `codes → plate-rack-base → out`, open
`plate_rack_base.blend`, wait for the preview, sample canvas pixels, toggle
wireframe and the info panel.

```
tree segment codes: opened
tree segment plate-rack-base: opened
tree segment out: opened
{
  "state": "ready",
  "triangles": "22960",
  "canvasSize": { "width": 719, "height": 489 },
  "pixels": { "lit": 8195, "total": 50228, "ratio": 0.1632 },
  "objectNames": ["Base_Full", "Half_L", "Half_R", "Plate", "Rack_Proxy"],
  "panelLen": 341,
  "panelHasSize": true,
  "panelHidden": "false",
  "failure": "",
  "errors": []
}
```

The renderer-owned loading flag resolved (`data-blend-state="ready"`), the
canvas is 719 × 489 device pixels, 16.3% of the sampled pixels are brighter
than the background (the model is actually drawn, not a blank canvas), all
five mesh objects appear in the panel, the panel shows `322 … mm`, there are
no console errors, and the wireframe toggle changes the frame (screenshot).

Screenshots: `scripts/shots/03-preview.png` (solid), `04-wireframe.png`
(wireframe), `02-sidebar.png` (file tree), and the user-facing copy
`docs/blender-preview.png`.

## Desktop profile installation

The running app owns its profile, so `dsh plugin --profile desktop …` is
refused. Installed the same way the earlier media-preview plugin was:

1. Backed up `package.json`, `pnpm-lock.yaml`, `cordis.patch.yml`
   (`*.bak-blend-20261020-232354`).
2. Added `"dsh-blend-preview": "file:<repo>/dsh-blend-preview-0.1.0.tgz"`
   and appended `dsh-blend-preview` to `dsh.profile.bundles`.
3. `node ~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.cjs install --dir ~/.dsh/profiles/desktop`
   → `+ dsh-blend-preview 0.1.0`, done in 3.7 s.
4. Composition proven on a copy of the desktop profile with a junctioned
   `node_modules`: `--dump-config` contains one `id: blend-preview` row with
   the shipped config; `--dump-config-schema` reports `status: schema`
   (Config imported, no `Cannot find package`), then the copy was removed
   (junction unlinked with `rmdir`, desktop `node_modules` untouched).
5. Installed `lib/client.js` hash equals the built file
   `19BDAC036C53637FA857EA638651FD5F82FBB8F5F9B83A787D63D012638A3F6C`.

**Not yet exercised: the restarted desktop app.** The desktop host composes
its plugin tree at boot, so the new row activates on the next launch. The
same code and the same client API were exercised end-to-end on the 0.2.0
web host above; 0.2.1-rc.2 is the release media-preview 0.1.2 already runs
on, so the document-preview surface is unchanged.

Side effect to know about: `pnpm install` also refreshed an unrelated
satisfied range, `@vfvrpq/dsh-pinned-sessions` 0.4.0 → 0.4.1 (the profile
already excludes that version from the release-age gate).

## Pitfalls found

| Symptom | Root cause | Fix |
|---|---|---|
| `blend-preview (dsh-blend-preview): failed to import` with no detail; `--dump-config-schema` says `Cannot find package '@deepseek-ai/schemastery' imported from <repo>\lib\schema.js` | `pnpm add <directory>` installs a **link**; Node resolves `@deepseek-ai/schemastery` from the real package path (`<workspace>\…`), which never reaches `~/.dsh/profiles/node_modules` | install from a packed tarball (`pnpm pack` → `dsh plugin add <tgz>`); the copy lives under the profile and resolves the shared `profiles/node_modules` |
| Preview shows 「这个浏览器/显卡组合不支持 WebGL」 while the canvas is 300×150 | the viewer was created in a mount effect that ran while the component still rendered the “loading” branch (no canvas); it never retried when the canvas appeared | create the viewer from the canvas `ref` callback, dispose on `null`; the model fetch then finds a live viewer |
| Wireframe toggle changes the button state but not the picture | the LINES pass drew with the triangle index buffer bound instead of the generated edge buffer | bind `primitive.lineIndices` for the edge pass; edges replace the surface (a 68k-edge overlay on top of the solid turned to mush) |
| Blender reports success but no GLB appears | the glTF exporter rewrites the filepath to end in `.glb`, so `model.glb.part` became `model.glb.part.glb` | write `model.part.glb` and rename to `model.glb` |
