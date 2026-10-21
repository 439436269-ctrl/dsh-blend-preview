/**
 * Build `lib/client.js` from the two development sources.
 *
 * The DSH client bundle must be one self-contained CJS factory file: the module
 * loader hands it a `require` limited to the platform seed table, so the
 * renderer cannot be imported as a sibling module. This script splices the
 * renderer source into the UI factory and verifies the result parses.
 *
 *   node scripts/build-client.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const viewerSource = await readFile(join(root, "dev", "viewer.js"), "utf8");
const clientSource = await readFile(join(root, "dev", "client-body.js"), "utf8");

const start = viewerSource.indexOf("/* @viewer:start");
const end = viewerSource.indexOf("/* @viewer:end");
if (start === -1 || end === -1 || end <= start) throw new Error("dev/viewer.js is missing its @viewer markers");
const viewerBlock = viewerSource.slice(viewerSource.indexOf("\n", start) + 1, end).trimEnd();

const marker = "/* @viewer */";
const at = clientSource.indexOf(marker);
if (at === -1) throw new Error("dev/client-body.js is missing the /* @viewer */ marker");
const output = clientSource.slice(0, at) + viewerBlock + clientSource.slice(at + marker.length);

const target = join(root, "lib", "client.js");
await writeFile(target, output, "utf8");
const check = spawnSync(process.execPath, ["--check", target], { encoding: "utf8" });
if (check.status !== 0) {
  process.stderr.write(check.stderr);
  process.exit(check.status ?? 1);
}
console.log(`built ${target} (${Buffer.byteLength(output)} bytes)`);
