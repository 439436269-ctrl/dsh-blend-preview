/**
 * The authenticated conversion route: `GET|HEAD <routePath>?path=<absolute>&kind=info|glb`.
 *
 * The route lives under `/api/`, so the composition's connection service has
 * already fenced and authenticated the request before this handler runs.
 * `kind=info` answers the scene JSON; `kind=glb` streams the exported model.
 * Both share one conversion job per file version.
 *
 * @module dsh-blend-preview/route
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { BlendPreviewError } from "./blender.js";

/** Headers shared by every answer; user data is never cached by a proxy. */
const BASE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Register the route for the plugin's lifetime.
 * @param ctx - host context carrying `connection`.
 * @param exporter - the conversion service.
 * @param config - resolved configuration.
 * @returns the disposer removing the route.
 */
export function registerBlendRoute(ctx, exporter, config) {
  return ctx.connection.fetch.register({
    path: config.routePath,
    methods: ["GET", "HEAD"],
    requestBody: "buffered",
    fetch: (request) => serve(request, exporter, config),
  });
}

/**
 * Answer one request.
 * @param request - fetch request built by the bridge.
 * @param exporter - the conversion service.
 * @param config - resolved configuration.
 * @returns the response, possibly streaming.
 */
async function serve(request, exporter, config) {
  if (!config.enabled) return errorResponse(503, "BLEND_DISABLED", "Blender preview is disabled.");
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  const kind = url.searchParams.get("kind") ?? "info";
  if (path === null || path === "") return errorResponse(400, "BLEND_PATH_REQUIRED", "Missing `path`.");
  if (path.includes("\0") || !isAbsolutePath(path)) {
    return errorResponse(400, "BLEND_PATH_INVALID", "An absolute path is required.");
  }
  if (kind !== "info" && kind !== "glb") {
    return errorResponse(400, "BLEND_KIND_INVALID", "`kind` must be `info` or `glb`.");
  }
  const suffix = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (!config.extensions.includes(suffix)) {
    return errorResponse(400, "BLEND_SUFFIX_INVALID", `Only ${config.extensions.map((item) => `.${item}`).join(", ")} files are previewed.`);
  }

  try {
    const fileInfo = await stat(path);
    if (!fileInfo.isFile()) return errorResponse(403, "BLEND_NOT_A_FILE", "This path is not a regular file.");
    const entry = await exporter.export(path, { signal: request.signal });
    if (kind === "info") return infoResponse(entry, method);
    return glbResponse(entry, method);
  } catch (error) {
    return failure(error);
  }
}

/** The scene JSON plus the cache facts the panel shows. */
function infoResponse(entry, method) {
  const body = JSON.stringify({
    ok: true,
    file: {
      name: entry.info.file_name ?? entry.info.file.split(/[\\/]/).pop(),
      path: entry.info.file,
      bytes: entry.source?.bytes ?? 0,
      mtimeMs: entry.source?.mtimeMs ?? 0,
    },
    cache: {
      key: entry.key,
      cached: entry.cached,
      elapsedMs: entry.elapsedMs,
      glbBytes: entry.glbBytes,
    },
    blender: entry.blender,
    scene: entry.info,
  });
  return new Response(method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(body)),
      ETag: etag(entry.key, "info"),
    },
  });
}

/** The exported GLB as a byte stream. */
function glbResponse(entry, method) {
  const headers = {
    ...BASE_HEADERS,
    "Content-Type": "model/gltf-binary",
    "Content-Length": String(entry.glbBytes),
    ETag: etag(entry.key, "glb"),
  };
  if (method === "HEAD") return new Response(null, { status: 200, headers });
  const body = Readable.toWeb(createReadStream(entry.glbPath));
  return new Response(body, { status: 200, headers });
}

/** One JSON failure with a machine code, a message, and an actionable hint. */
function failure(error) {
  if (error instanceof BlendPreviewError) {
    const status = statusOf(error.code);
    return errorResponse(status, error.code, error.message, error.hint, error.detail);
  }
  const code = typeof error?.code === "string" ? error.code : "BLEND_UNKNOWN";
  if (code === "ENOENT") return errorResponse(404, "BLEND_NOT_FOUND", "The .blend file was not found.");
  if (code === "EACCES" || code === "EPERM") return errorResponse(403, "BLEND_PERMISSION_DENIED", "No permission to read this file.");
  if (code === "FS_SANDBOX_DENIED") return errorResponse(403, "BLEND_PERMISSION_DENIED", "The file sandbox denied access to this path.");
  return errorResponse(500, code, error instanceof Error ? error.message : String(error));
}

/** HTTP status for one typed failure. */
function statusOf(code) {
  switch (code) {
    case "BLENDER_MISSING":
      return 503;
    case "BLEND_TIMEOUT":
      return 504;
    case "BLEND_TOO_LARGE":
      return 413;
    case "BLEND_ABORTED":
      return 499;
    case "BLEND_EXPORT_FAILED":
      return 422;
    case "BLEND_OUTPUT_INVALID":
    case "BLEND_UNLOADED":
      return 503;
    case "BLEND_NOT_A_FILE":
    case "BLEND_EMPTY":
      return 400;
    default:
      return 500;
  }
}

/** A small JSON failure answer. */
function errorResponse(status, code, message, hint, detail) {
  const body = JSON.stringify({ ok: false, error: { code, message, hint, detail } });
  return new Response(body, {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(body)),
    },
  });
}

/** A weak validator for one artifact of one cache entry. */
function etag(key, kind) {
  return `W/"${key}-${kind}"`;
}

/** Absolute in either spelling the Host accepts. */
function isAbsolutePath(path) {
  return path.startsWith("/") || /^[A-Za-z]:[/\\]/.test(path) || path.startsWith("\\\\");
}
