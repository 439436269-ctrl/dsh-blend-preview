/**
 * The schemastery schema alone, separated from the defaulting helpers so
 * `lib/config.js` stays importable in a plain `node --test` run (schemastery is
 * supplied by the DSH host at runtime, not by this package).
 *
 * @module dsh-blend-preview/schema
 */
import z from "@deepseek-ai/schemastery";

/** Largest scene converted by default (1 GiB). */
const MAX_BYTES = 1024 * 1024 * 1024;
/** Wall-clock ceiling for one cold conversion. */
const TIMEOUT_MS = 180_000;

/** Schema the loader validates and the settings page renders. */
export const Config = z.object({
  enabled: z.boolean().default(true).description(
    "Register the preview renderer and its conversion route at all. Off keeps the plugin idle."
  ),
  routePath: z.string().default("/api/blend-preview").description(
    "Absolute pathname of the authenticated conversion route; it must stay under /api so the connection fence authenticates it."
  ),
  extensions: z.array(z.string()).default(["blend"]).description(
    "File suffixes that open in the 3D preview (no leading dot, lowercase)."
  ),
  blenderPath: z.string().default("").description(
    "Absolute path of blender(.exe). Empty auto-detects DSH_BLENDER / BLENDER_PATH, PATH, Steam and Blender Foundation install locations."
  ),
  cacheDir: z.string().default("").description(
    "Directory holding exported GLB files and scene metadata. Empty uses ~/.dsh/cache/blend-preview."
  ),
  timeoutMs: z.number().step(1).min(5000).max(900000).default(TIMEOUT_MS).description(
    "Wall-clock ceiling for one cold Blender conversion, in milliseconds."
  ),
  maxBytes: z.number().step(1).min(1).max(8 * 1024 * 1024 * 1024).default(MAX_BYTES).description(
    "Largest .blend file the route will convert, in bytes."
  ),
  applyModifiers: z.boolean().default(true).description(
    "Apply modifiers during export (what Blender renders is what the preview shows)."
  ),
  cacheEntries: z.number().step(1).min(1).max(500).default(24).description(
    "Cached conversions kept on disk before the oldest are pruned."
  ),
}).description("Blender preview: one authenticated conversion route plus the right-Sidebar WebGL viewer.");
