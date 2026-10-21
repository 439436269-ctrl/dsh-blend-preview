/**
 * Live conversion self-test: cold, warm, concurrent, and cache pruning
 * against a real .blend and the real Blender install.
 *
 *   node scripts/live-selftest.mjs [--file <abs .blend>] [--cache <dir>]
 *
 * Exit code 0 only when every assertion passes.
 */
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlendExporter } from "../lib/blender.js";
import { resolveConfig } from "../lib/config.js";

function argument(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
}

const file = argument("file", "D:/codes/plate-rack-base/out/plate_rack_base.blend");
const cacheDir = argument("cache", await mkdtemp(join(tmpdir(), "blend-selftest-cache-")));
const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : `  ${detail}`}`);
  if (!ok) failures.push(label);
};

await stat(file);
console.log(`file:   ${file}`);
console.log(`cache:  ${cacheDir}\n`);

const config = resolveConfig({ cacheDir, cacheEntries: 2 });
const exporter = new BlendExporter(config, { logger: console });
try {
  const coldStart = Date.now();
  const cold = await exporter.export(file);
  const coldMs = Date.now() - coldStart;
  check("cold conversion produced a GLB", cold.glbBytes > 0, `${cold.glbBytes} bytes`);
  check("cold conversion reports a Blender version", typeof cold.blender === "string", cold.blender);
  check("scene JSON has objects and triangles", cold.info.counts.objects > 0 && cold.info.counts.triangles > 0, `${cold.info.counts.objects} objects / ${cold.info.counts.triangles} tris`);
  check("scene bounds are in millimetres", cold.info.bounds.size_mm.some((value) => value > 1), cold.info.bounds.size_mm.join(" × "));
  check("cold conversion was not a cache hit", cold.cached === false, `${coldMs} ms`);

  const warmStart = Date.now();
  const warm = await exporter.export(file);
  const warmMs = Date.now() - warmStart;
  check("second call is a cache hit", warm.cached === true);
  check("cache hit is much faster than the cold run", warmMs < Math.max(coldMs / 4, 100), `${warmMs} ms`);
  check("both calls share one cache key", warm.key === cold.key, cold.key);

  // A different cache directory forces a second real conversion; firing both
  // callers at once must share one in-flight job.
  const concurrentDir = await mkdtemp(join(tmpdir(), "blend-selftest-concurrent-"));
  const concurrentExporter = new BlendExporter(resolveConfig({ cacheDir: concurrentDir }));
  try {
    const first = concurrentExporter.export(file);
    const second = concurrentExporter.export(file);
    // export() stats the file before it creates the shared job; give the two
    // calls a moment to reach that point.
    for (let attempt = 0; attempt < 20 && concurrentExporter.pending.size === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    check("concurrent requests share one in-flight job", concurrentExporter.pending.size === 1, `${concurrentExporter.pending.size} job(s)`);
    const [a, b] = await Promise.all([first, second]);
    check("concurrent callers get the same artifact", a.key === b.key && a.glbBytes === b.glbBytes);
  } finally {
    concurrentExporter.dispose();
    await rm(concurrentDir, { recursive: true, force: true });
  }

  // Pruning keeps at most cacheEntries directories (one writer ran here).
  const { readdir } = await import("node:fs/promises");
  const entries = (await readdir(cacheDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  check("cache stays within cacheEntries", entries.length <= 2, `${entries.length} entries`);
} finally {
  exporter.dispose();
  await rm(cacheDir, { recursive: true, force: true });
}

console.log(failures.length === 0 ? "\nALL PASS" : `\n${failures.length} FAILURE(S)`);
process.exitCode = failures.length === 0 ? 0 : 1;
