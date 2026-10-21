/**
 * Host configuration defaults and normalization.
 *
 * The schemastery schema lives in `./schema.js` so this module stays importable
 * without the host-supplied `@deepseek-ai/schemastery` package (unit tests and
 * the route run against these helpers directly).
 *
 * @module dsh-blend-preview/config
 */
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

/** Suffixes handed to the Blender converter. */
export const DEFAULT_EXTENSIONS = ["blend"];

/** Largest scene the route agrees to convert, in bytes (1 GiB). */
export const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;

/** A cold conversion is one Blender process; this is its wall-clock ceiling. */
export const DEFAULT_TIMEOUT_MS = 180_000;

/** Cached conversions kept on disk before the oldest are pruned. */
export const DEFAULT_CACHE_ENTRIES = 24;

/** Where conversions live when no cache directory is configured. */
export function defaultCacheDir() {
  return join(homedir(), ".dsh", "cache", "blend-preview");
}

/** Fallback when the loader supplies no config object at all. */
export const DEFAULTS = Object.freeze({
  enabled: true,
  routePath: "/api/blend-preview",
  extensions: DEFAULT_EXTENSIONS,
  blenderPath: "",
  cacheDir: "",
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxBytes: DEFAULT_MAX_BYTES,
  applyModifiers: true,
  cacheEntries: DEFAULT_CACHE_ENTRIES,
});

/**
 * Merge a loader-supplied config over the defaults, normalizing the parts the
 * route and the converter depend on. Hand-written rather than schema-driven
 * because the loader may call `apply()` with a raw object while the settings
 * page goes through `Config`.
 * @param config - whatever the loader supplied.
 * @returns a complete, validated-enough config.
 */
export function resolveConfig(config) {
  const input = config !== null && typeof config === "object" ? config : {};
  return {
    enabled: input.enabled === undefined ? DEFAULTS.enabled : input.enabled === true,
    routePath: normalizeRoutePath(input.routePath),
    extensions: normalizeExtensions(input.extensions, DEFAULT_EXTENSIONS),
    blenderPath: typeof input.blenderPath === "string" ? expandHome(input.blenderPath.trim()) : "",
    cacheDir: normalizeCacheDir(input.cacheDir),
    timeoutMs: clampInteger(input.timeoutMs, DEFAULT_TIMEOUT_MS, 5_000, 900_000),
    maxBytes: clampInteger(input.maxBytes, DEFAULT_MAX_BYTES, 1, 8 * 1024 * 1024 * 1024),
    applyModifiers: input.applyModifiers === undefined ? DEFAULTS.applyModifiers : input.applyModifiers === true,
    cacheEntries: clampInteger(input.cacheEntries, DEFAULT_CACHE_ENTRIES, 1, 500),
  };
}

/**
 * Normalize one suffix list, falling back to the defaults for an empty answer.
 * @param value - untrusted suffix list.
 * @param fallback - suffixes used when the list is absent or empty.
 * @returns lowercase suffixes without leading dots, without duplicates.
 */
export function normalizeExtensions(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const cleaned = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const suffix = entry.trim().replace(/^\.+/, "").toLowerCase();
    if (suffix === "" || cleaned.includes(suffix)) continue;
    cleaned.push(suffix);
  }
  return cleaned.length > 0 ? cleaned : [...fallback];
}

/** Keep the route under /api; anything else would skip the authenticated fence. */
function normalizeRoutePath(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const candidate = raw === "" ? DEFAULTS.routePath : raw;
  const withSlash = candidate.startsWith("/") ? candidate : `/${candidate}`;
  if (!withSlash.startsWith("/api/")) return DEFAULTS.routePath;
  return withSlash.replace(/\/+$/, "");
}

/** Resolve a configured cache directory, or the default when it is empty. */
function normalizeCacheDir(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return defaultCacheDir();
  return resolvePath(expandHome(raw));
}

/**
 * Turn a leading `~` into the home directory.
 * @param path - configured path.
 * @returns the expanded path (unchanged when there is no leading `~`).
 */
export function expandHome(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

/** An integer inside a closed range, or the fallback. */
function clampInteger(value, fallback, min, max) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.floor(number), min), max);
}
