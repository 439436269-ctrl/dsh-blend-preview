# Changelog

## 0.1.0 — 2026-10-20

First release.

- Register a document-preview renderer for `.blend` files in the DSH right Sidebar: clicking a scene opens an interactive 3D viewport instead of the binary-file empty state.
- Host half: authenticated `GET|HEAD /api/blend-preview` route that exports one GLB plus a scene JSON per file version with `blender --background`, keyed by real path, size, mtime, export recipe and the modifier setting, cached under `~/.dsh/cache/blend-preview` and pruned to `cacheEntries`.
- Browser half: dependency-free WebGL glTF 2.0 viewer (orbit / pan / zoom / double-click reset / wireframe / auto-rotate / contact shadow / axis triad) and a scene panel with per-object triangle counts, millimetre bounding boxes, material swatches, units and export facts.
- Configuration: `enabled`, `routePath`, `extensions`, `blenderPath`, `cacheDir`, `timeoutMs`, `maxBytes`, `applyModifiers`, `cacheEntries`.
- Blender discovery: `DSH_BLENDER`, `BLENDER_PATH`, `PATH`, Steam libraries, `Blender Foundation` installs; a missing binary produces an actionable `BLENDER_MISSING` error instead of a blank panel.
- Verified on Blender 5.2.2 LTS / DSH Desktop 0.2.1-rc.2 with a real scene (22,960 triangles): 27 unit/adapter tests, cold conversion 2.1 s, warm 3 ms, headless browser e2e ready state with 16% non-background canvas pixels.
