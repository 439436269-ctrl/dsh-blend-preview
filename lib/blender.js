/**
 * Blender process management and the conversion cache.
 *
 * One `.blend` version maps to one cache key; a cache entry holds the exported
 * GLB, the scene description JSON, and metadata. Concurrent requests for the
 * same key share one Blender process, and the same file version is never
 * converted twice.
 *
 * @module dsh-blend-preview/blender
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Must match `RECIPE` in scene.py: bump both to invalidate old conversions. */
const RECIPE = 1;

/** Upper bound on each captured Blender stream. */
const MAX_LOG_BYTES = 128 * 1024;

/** Version output is stable for a process lifetime, so it is probed once per binary. */
const versionCache = new Map();

/** A typed failure the route maps onto an HTTP status. */
export class BlendPreviewError extends Error {
  /**
   * @param message - human-readable, model/page-facing message.
   * @param code - stable machine code (e.g. BLENDER_MISSING).
   * @param options - hint shown to the user, and extra detail for the log.
   */
  constructor(message, code, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "BlendPreviewError";
    this.code = code;
    this.hint = options.hint;
    this.detail = options.detail;
  }
}

/**
 * Find the Blender executable without assuming an install layout.
 * @param config - resolved plugin config (`blenderPath` wins when set).
 * @param env - environment to read overrides from.
 * @returns the first existing candidate, or undefined.
 */
export function findBlender(config, env = process.env) {
  for (const candidate of blenderCandidates(config, env)) {
    if (candidate !== "" && existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Every location worth probing, in priority order.
 * @param config - resolved plugin config.
 * @param env - environment to read overrides from.
 * @returns absolute candidate paths (may not exist).
 */
export function blenderCandidates(config, env = process.env) {
  const candidates = [];
  const configured = config !== null && typeof config === "object" ? config.blenderPath : "";
  if (typeof configured === "string" && configured !== "") candidates.push(configured);
  for (const name of ["DSH_BLENDER", "BLENDER_PATH"]) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "") candidates.push(value.trim());
  }
  const pathValue = typeof env.PATH === "string" ? env.PATH : typeof env.Path === "string" ? env.Path : "";
  for (const dir of pathValue.split(process.platform === "win32" ? ";" : ":")) {
    if (dir.trim() === "") continue;
    candidates.push(join(dir.trim(), process.platform === "win32" ? "blender.exe" : "blender"));
  }
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Blender\\blender.exe",
      "C:\\Program Files\\Steam\\steamapps\\common\\Blender\\blender.exe",
      "C:\\Program Files\\Blender Foundation\\Blender\\blender.exe"
    );
    // Steam libraries are commonly moved to a second drive; probe the usual
    // <drive>:\SteamLibrary and <drive>:\Steam layouts instead of hard-coding
    // one machine's drive letter.
    for (const drive of ["C", "D", "E", "F"]) {
      candidates.push(`${drive}:\\SteamLibrary\\steamapps\\common\\Blender\\blender.exe`);
      candidates.push(`${drive}:\\Steam\\steamapps\\common\\Blender\\blender.exe`);
    }
    for (const versioned of versionedBlenderInstalls("C:\\Program Files\\Blender Foundation")) candidates.push(versioned);
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Blender.app/Contents/MacOS/Blender", "/Applications/Blender/Blender.app/Contents/MacOS/Blender");
  } else {
    candidates.push("/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender", "/var/lib/flatpak/exports/bin/org.blender.Blender");
  }
  return [...new Set(candidates)];
}

/** `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`, newest first. */
function versionedBlenderInstalls(root) {
  if (!existsSync(root)) return [];
  const versions = [];
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("Blender")) continue;
      const candidate = join(root, entry.name, "blender.exe");
      if (existsSync(candidate)) versions.push({ candidate, mtime: statSync(candidate).mtimeMs });
    }
  } catch {
    return [];
  }
  return versions.sort((left, right) => right.mtime - left.mtime).map((entry) => entry.candidate);
}

/**
 * Read `blender --version` once per binary.
 * @param binary - absolute Blender path.
 * @param timeoutMs - probe ceiling.
 * @returns e.g. `Blender 5.2.2 LTS`, or undefined when the probe fails.
 */
export async function blenderVersion(binary, timeoutMs = 20_000) {
  const cached = versionCache.get(binary);
  if (cached !== undefined && Date.now() - cached.at < 10 * 60 * 1000) return cached.version;
  const result = await runProcess(binary, ["--version"], { timeoutMs });
  const match = /Blender\s+([0-9][^\r\n]*)/.exec(result.stdout + result.stderr);
  const version = match === null ? undefined : `Blender ${match[1].trim()}`;
  if (version !== undefined) versionCache.set(binary, { version, at: Date.now() });
  return version;
}

/** Converts `.blend` files into cache entries and answers from them. */
export class BlendExporter {
  /**
   * @param config - resolved plugin config.
   * @param options - logger (Cordis-style) for best-effort pruning warnings.
   */
  constructor(config, options = {}) {
    this.config = config;
    this.logger = options.logger;
    this.scriptPath = fileURLToPath(new URL("./scene.py", import.meta.url));
    this.pending = new Map();
    this.children = new Set();
    this.disposed = false;
  }

  /**
   * Convert (or answer from cache) one `.blend` file version.
   * @param blendPath - absolute path to the scene.
   * @param options - abort signal for the caller; the shared job keeps running for others.
   * @returns the cache entry.
   */
  async export(blendPath, options = {}) {
    if (this.disposed) throw new BlendPreviewError("The Blender preview plugin has been unloaded.", "BLEND_UNLOADED");
    const signal = options.signal;
    throwIfAborted(signal);

    const info = await stat(blendPath);
    if (!info.isFile()) throw new BlendPreviewError("This path is not a regular file.", "BLEND_NOT_A_FILE");
    if (info.size === 0) throw new BlendPreviewError("This .blend file is empty.", "BLEND_EMPTY");
    if (info.size > this.config.maxBytes) {
      throw new BlendPreviewError(
        `The scene is larger than the configured ${formatBytes(this.config.maxBytes)} limit.`,
        "BLEND_TOO_LARGE"
      );
    }
    const resolved = await realpath(blendPath).catch(() => blendPath);
    const key = cacheKey(resolved, info.size, info.mtimeMs, this.config.applyModifiers);
    const directory = join(this.config.cacheDir, key);

    const cached = await readCacheEntry(directory, key);
    if (cached !== null) return cached;

    let job = this.pending.get(key);
    if (job === undefined) {
      job = this.convert(resolved, info, key, directory).finally(() => this.pending.delete(key));
      this.pending.set(key, job);
    }
    return raceAbort(job, signal);
  }

  /**
   * Run one Blender conversion and publish the cache entry atomically.
   * @param blendPath - real path of the scene.
   * @param fileInfo - stat of the scene (size and mtime feed the key).
   * @param key - cache key.
   * @param directory - cache entry directory.
   * @returns the fresh cache entry.
   */
  async convert(blendPath, fileInfo, key, directory) {
    const binary = findBlender(this.config);
    if (binary === undefined) throw missingBlenderError(this.config);
    await mkdir(directory, { recursive: true });
    const glbTemp = join(directory, "model.part.glb");
    const infoTemp = join(directory, "scene.part.json");
    const glbPath = join(directory, "model.glb");
    const infoPath = join(directory, "scene.json");
    const startedAt = Date.now();

    const result = await runProcess(
      binary,
      [
        "--background",
        "--disable-autoexec",
        "--python-exit-code",
        "1",
        blendPath,
        "--python",
        this.scriptPath,
        "--",
        glbPath,
        infoPath,
        this.config.applyModifiers ? "1" : "0",
      ],
      { timeoutMs: this.config.timeoutMs, children: this.children }
    );

    if (result.aborted) throw new BlendPreviewError("The conversion was cancelled.", "BLEND_ABORTED");
    if (result.timedOut) {
      throw new BlendPreviewError(
        `Blender did not finish within ${Math.round(this.config.timeoutMs / 1000)}s.`,
        "BLEND_TIMEOUT",
        { hint: "Raise `timeoutMs` in the plugin settings, or simplify the scene.", detail: tail(result.stderr, 4000) }
      );
    }
    if (result.code !== 0) {
      throw new BlendPreviewError(
        `Blender exited with code ${String(result.code)} while exporting this scene.`,
        "BLEND_EXPORT_FAILED",
        { hint: "The Blender log tail is shown in the preview under Details.", detail: tail(result.stderr || result.stdout, 6000) }
      );
    }

    const glb = await stat(glbPath).catch(() => undefined);
    const sceneInfo = await readJson(infoPath).catch(() => undefined);
    if (glb === undefined || glb.size === 0 || sceneInfo === undefined) {
      throw new BlendPreviewError("Blender reported success but produced no preview files.", "BLEND_OUTPUT_INVALID", {
        detail: tail(result.stderr || result.stdout, 4000),
      });
    }
    const magic = await readHead(glbPath, 4);
    if (magic !== "glTF") {
      throw new BlendPreviewError("The exported GLB is not a valid glTF binary.", "BLEND_OUTPUT_INVALID");
    }

    const blender = await blenderVersion(binary);
    const entry = {
      key,
      directory,
      glbPath,
      infoPath,
      info: sceneInfo,
      glbBytes: glb.size,
      blender: blender ?? sceneInfo.blender ?? null,
      elapsedMs: Date.now() - startedAt,
      source: { path: blendPath, bytes: fileInfo.size, mtimeMs: fileInfo.mtimeMs },
      cached: false,
    };
    await writeJson(join(directory, "meta.json"), {
      key,
      recipe: RECIPE,
      blender: entry.blender,
      elapsedMs: entry.elapsedMs,
      glbBytes: entry.glbBytes,
      createdAt: new Date().toISOString(),
      source: entry.source,
    });
    await rm(glbTemp, { force: true });
    await rm(infoTemp, { force: true });
    await this.prune(directory);
    return entry;
  }

  /**
   * Keep the cache bounded, newest first. Best effort: a failure to prune must
   * never fail a preview.
   * @param currentDirectory - entry just produced (never removed).
   */
  async prune(currentDirectory) {
    try {
      const names = await readdir(this.config.cacheDir, { withFileTypes: true });
      const entries = [];
      for (const name of names) {
        if (!name.isDirectory()) continue;
        const directory = join(this.config.cacheDir, name.name);
        if (directory === currentDirectory) continue;
        const meta = await stat(join(directory, "model.glb")).catch(() => undefined);
        entries.push({ directory, mtime: meta === undefined ? 0 : meta.mtimeMs });
      }
      entries.sort((left, right) => right.mtime - left.mtime);
      for (const entry of entries.slice(Math.max(this.config.cacheEntries - 1, 0))) {
        await rm(entry.directory, { recursive: true, force: true });
      }
    } catch (error) {
      this.logger?.warn?.(`[blend-preview] cache prune failed: ${String(error)}`);
    }
  }

  /** Kill any in-flight conversion; called when the plugin unloads. */
  dispose() {
    this.disposed = true;
    for (const child of this.children) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
    this.children.clear();
    this.pending.clear();
  }
}

/** The cache key for one file version and export recipe. */
function cacheKey(realPath, size, mtimeMs, applyModifiers) {
  return createHash("sha1")
    .update(`${realPath}\0${String(size)}\0${String(Math.round(mtimeMs))}\0${String(RECIPE)}\0${applyModifiers ? "1" : "0"}`)
    .digest("hex")
    .slice(0, 24);
}

/** A complete cache entry, or null when anything is missing or torn. */
async function readCacheEntry(directory, key) {
  try {
    const meta = JSON.parse(await readFile(join(directory, "meta.json"), "utf8"));
    if (meta.key !== key || meta.recipe !== RECIPE) return null;
    const [glb, sceneInfo] = await Promise.all([stat(join(directory, "model.glb")), readJson(join(directory, "scene.json"))]);
    if (glb.size === 0 || sceneInfo === undefined) return null;
    if ((await readHead(join(directory, "model.glb"), 4)) !== "glTF") return null;
    return {
      key,
      directory,
      glbPath: join(directory, "model.glb"),
      infoPath: join(directory, "scene.json"),
      info: sceneInfo,
      glbBytes: glb.size,
      blender: meta.blender ?? sceneInfo.blender ?? null,
      elapsedMs: 0,
      source: meta.source,
      cached: true,
    };
  } catch {
    return null;
  }
}

/** The "no Blender" failure, with the probed locations as the hint. */
function missingBlenderError(config) {
  const probed = blenderCandidates(config)
    .filter((value) => value !== "")
    .slice(0, 8);
  return new BlendPreviewError("Blender was not found on this machine.", "BLENDER_MISSING", {
    hint:
      "Install Blender, or point the `blenderPath` plugin setting (or DSH_BLENDER) at blender.exe. " +
      `Probed: ${probed.join(" | ")}`,
  });
}

/**
 * Run a child process, capturing bounded output.
 * @param binary - executable.
 * @param args - argument vector.
 * @param options - timeout, abort signal, and the set that tracks live children.
 * @returns exit code and the captured streams.
 */
export function runProcess(binary, args, options = {}) {
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 60_000;
  const signal = options.signal;
  const children = options.children;
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let timer;
    let child;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (children !== undefined) children.delete(child);
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const stop = () => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    };
    const onAbort = () => {
      aborted = true;
      stop();
    };
    try {
      child = spawn(binary, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } });
    } catch (error) {
      resolve({ code: -1, stdout: "", stderr: String(error), timedOut: false, aborted: false, durationMs: 0 });
      return;
    }
    if (children !== undefined) children.add(child);
    child.stdout?.on("data", (chunk) => {
      stdout = tailAround(stdout + chunk.toString("utf8"), MAX_LOG_BYTES);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = tailAround(stderr + chunk.toString("utf8"), MAX_LOG_BYTES);
    });
    child.on("error", (error) => {
      stderr = tailAround(`${stderr}${String(error)}`, MAX_LOG_BYTES);
      finish({ code: -1, stdout, stderr, timedOut, aborted, durationMs: Date.now() - startedAt });
    });
    child.on("close", (code) => {
      finish({ code: code ?? -1, stdout, stderr, timedOut, aborted, durationMs: Date.now() - startedAt });
    });
    timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    if (signal !== undefined) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/** Keep the last `limit` characters (Blender's useful lines are at the end). */
function tailAround(text, limit) {
  return text.length <= limit ? text : text.slice(text.length - limit);
}

/** The last `limit` characters of a captured stream. */
function tail(text, limit) {
  return typeof text === "string" ? tailAround(text, limit) : "";
}

/** Read the first `length` bytes of a file as latin1 text. */
async function readHead(path, length) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return buffer.toString("latin1");
  } finally {
    await handle.close();
  }
}

/** Read and parse one JSON file. */
async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

/** Write one JSON file through a temporary name. */
async function writeJson(path, value) {
  const temp = `${path}.part`;
  await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await rename(temp, path);
}

/** Throw the standard abort error when the caller already gave up. */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new BlendPreviewError("The request was cancelled.", "BLEND_ABORTED");
}

/**
 * Reject one caller when it aborts without cancelling the shared conversion.
 * @param promise - the shared job.
 * @param signal - the caller's signal.
 * @returns the job result, or a rejection on abort.
 */
function raceAbort(promise, signal) {
  if (signal === undefined) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new BlendPreviewError("The request was cancelled.", "BLEND_ABORTED"));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

/** Human byte size for the error messages. */
function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? String(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Exposed for tests: the cache directory name for one file version. */
export const internals = { cacheKey, missingBlenderError };
