/**
 * Development screenshot harness for the standalone viewer.
 *
 * Serves dev/ over HTTP (fetch() cannot read file:// URLs), opens it in the
 * system Edge through Playwright, waits for the scene to upload, and writes a
 * PNG plus the console output. Not shipped.
 *
 *   node dev/shot.mjs [--out shot.png] [--width 900] [--height 800]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const root = resolve(here, "..");

function argument(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
}

async function loadPlaywright() {
  const cacheRoot = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "npm-cache", "_npx");
  const candidates = [join(process.cwd(), "node_modules", "playwright")];
  if (existsSync(cacheRoot)) {
    const { readdirSync } = await import("node:fs");
    for (const entry of readdirSync(cacheRoot)) candidates.push(join(cacheRoot, entry, "node_modules", "playwright"));
  }
  for (const candidate of candidates) if (existsSync(candidate)) return import(pathToFileURL(join(candidate, "index.mjs")).href);
  throw new Error("playwright not found");
}

const { chromium } = await loadPlaywright();
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".glb": "model/gltf-binary", ".json": "application/json" };
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname).replace(/^\/+/, "");
  if (path === "favicon.ico") {
    response.writeHead(204).end();
    return;
  }
  const file = resolve(root, path === "" ? "dev/viewer.html" : path);
  try {
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    console.log(`404 ${file}`);
    response.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const out = argument("out", join(here, "shot.png"));
const width = Number(argument("width", "900"));
const height = Number(argument("height", "800"));
const browser = await chromium.launch({ headless: true, channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge" });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (message) => logs.push(`${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => logs.push(`pageerror: ${error.message}`));
await page.goto(`http://127.0.0.1:${port}/dev/viewer.html`, { waitUntil: "load" });
await page.waitForFunction(() => window.__ready === true || window.__error !== undefined, { timeout: 20000 });
await page.waitForTimeout(600);
if (process.argv.includes("--wire")) {
  await page.click("#wire");
  await page.waitForTimeout(500);
}
if (process.argv.includes("--spin")) {
  await page.click("#spin");
  await page.waitForTimeout(900);
}
const error = await page.evaluate(() => window.__error);
const stats = await page.evaluate(() => window.__stats);
const pixels = await page.evaluate(() => {
  const canvas = document.getElementById("view");
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d");
  context.drawImage(canvas, 0, 0);
  const data = context.getImageData(0, 0, copy.width, copy.height).data;
  let lit = 0;
  let total = 0;
  for (let index = 0; index < data.length; index += 4 * 7) {
    total += 1;
    if (data[index] + data[index + 1] + data[index + 2] > 60) lit += 1;
  }
  return { lit, total, ratio: lit / total };
});
await page.screenshot({ path: out });
console.log(JSON.stringify({ error, stats, pixels }, null, 2));
if (logs.length > 0) console.log(logs.join("\n"));
await browser.close();
server.close();
