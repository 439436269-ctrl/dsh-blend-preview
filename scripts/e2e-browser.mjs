/**
 * Headless end-to-end check for dsh-blend-preview against a locally started
 * DSH web host: open the app, open a session, reveal the right Sidebar's
 * workspace files, open one .blend, and prove the WebGL preview mounted,
 * rendered non-background pixels, and can toggle its controls.
 *
 * Usage:
 *   node scripts/e2e-browser.mjs --base http://127.0.0.1:57505 --token <token>
 *     [--file "D:\\codes\\plate-rack-base\\out\\plate_rack_base.blend"]
 *     [--out scripts/shots]
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Resolve playwright from a local install, then from the npx cache. */
async function loadPlaywright() {
  const cacheRoot = join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "npm-cache", "_npx");
  const candidates = [
    process.env.PLAYWRIGHT_MODULE_DIR,
    join(process.cwd(), "node_modules", "playwright"),
    join(homedir(), "node_modules", "playwright"),
  ].filter(Boolean);
  if (existsSync(cacheRoot)) {
    const { readdirSync } = await import("node:fs");
    for (const entry of readdirSync(cacheRoot)) candidates.push(join(cacheRoot, entry, "node_modules", "playwright"));
  }
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return import(pathToFileURL(join(candidate, "index.mjs")).href);
  }
  throw new Error("playwright not found; set PLAYWRIGHT_MODULE_DIR to a directory containing playwright/");
}

function argument(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
}

const { chromium } = await loadPlaywright();
const base = argument("base", "http://127.0.0.1:57505");
const token = argument("token");
const outDir = argument("out", join(process.cwd(), "scripts", "shots"));
const file = argument("file", "D:\\codes\\plate-rack-base\\out\\plate_rack_base.blend");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge" });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

await page.goto(token === undefined ? base : `${base}/?token=${token}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

// First-run overlays are native dialogs whose buttons are matched by text.
for (const label of ["结束", "继续", "我知道了", "跳过"]) {
  const button = page.getByText(label, { exact: true }).first();
  if ((await button.count()) > 0) await button.click({ timeout: 2000 }).catch(() => {});
}
await page.waitForTimeout(600);

// A fresh profile opens on the home screen; start a conversation.
const newChat = page.getByRole("button", { name: /新会话|New conversation/i }).first();
if ((await newChat.count()) > 0) {
  await newChat.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: join(outDir, "01-session.png") });

// Reveal the right Sidebar and open its workspace file tab.
const openRight = page.getByRole("button", { name: /打开右侧边栏|Open right sidebar/i }).first();
if ((await openRight.count()) > 0) {
  await openRight.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
const newTab = page.getByRole("button", { name: /新标签页|New tab/i }).first();
if ((await newTab.count()) > 0) {
  await newTab.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
}
const filesEntry = page.getByText("工作区文件", { exact: true }).first();
if ((await filesEntry.count()) > 0) {
  await filesEntry.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: join(outDir, "02-sidebar.png") });
await writeFile(join(outDir, "02-body.txt"), await page.locator("body").innerText(), "utf8");

// Walk the tree to the file. The root can be the drive or the workspace, so
// the first segment that actually exists is where the walk starts.
const fileName = file.split(/[\\/]/).pop();
const directory = file.slice(0, file.length - fileName.length).replace(/[\\/]+$/, "");
const segments = directory.split(/[\\/]/).filter(Boolean).filter((segment) => !/^[A-Za-z]:$/.test(segment));
const tail = segments.slice(-3);
const openSegment = async (name) => {
  const row = page.getByText(name, { exact: true }).first();
  for (let attempt = 0; attempt < 3 && (await row.count()) === 0; attempt += 1) {
    await page.mouse.move(1350, 620);
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(300);
  }
  if ((await row.count()) === 0) return false;
  await row.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return true;
};
for (const segment of tail) {
  if (segment === fileName) break;
  const opened = await openSegment(segment);
  console.log(`tree segment ${segment}: ${opened ? "opened" : "not found"}`);
}
let fileRow = page.getByText(fileName, { exact: true }).first();
for (let attempt = 0; attempt < 8 && (await fileRow.count()) === 0; attempt += 1) {
  await page.mouse.move(1350, 620);
  await page.mouse.wheel(0, 380);
  await page.waitForTimeout(300);
}
if ((await fileRow.count()) > 0) {
  await fileRow.click({ timeout: 5000 }).catch(() => {});
} else {
  console.log(`file row not found: ${fileName}`);
}

// The first open converts with Blender; give it room.
const root = page.locator("[data-blend-preview]").first();
await root.waitFor({ state: "attached", timeout: 20000 }).catch(() => {});
for (let attempt = 0; attempt < 60; attempt += 1) {
  const state = await root.getAttribute("data-blend-state").catch(() => null);
  if (state === "ready" || state === "failed") break;
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(800);
await page.screenshot({ path: join(outDir, "03-preview.png") });

const state = await root.getAttribute("data-blend-state").catch(() => null);
const triangles = await root.getAttribute("data-blend-triangles").catch(() => null);
const canvas = page.locator("[data-blend-canvas]").first();
const canvasSize = await canvas.evaluate((element) => ({ width: element.width, height: element.height })).catch(() => null);
const pixels = await canvas
  .evaluate((element) => {
    const copy = document.createElement("canvas");
    copy.width = element.width;
    copy.height = element.height;
    const context = copy.getContext("2d");
    context.drawImage(element, 0, 0);
    const data = context.getImageData(0, 0, copy.width, copy.height).data;
    let lit = 0;
    let total = 0;
    for (let index = 0; index < data.length; index += 4 * 7) {
      total += 1;
      if (data[index] + data[index + 1] + data[index + 2] > 70) lit += 1;
    }
    return { lit, total, ratio: total === 0 ? 0 : lit / total };
  })
  .catch(() => null);
const body = await page.locator("body").innerText();
await writeFile(join(outDir, "03-body.txt"), body, "utf8");

const panel = page.locator("[data-blend-panel]").first();
const panelText = await panel.innerText().catch(() => "");
const objectNames = await page.locator("[data-blend-object]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-blend-object")));

// Controls: wireframe toggle, info toggle, reset.
const wire = page.locator('[data-blend-action="wireframe"]').first();
if ((await wire.count()) > 0) {
  await wire.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(outDir, "04-wireframe.png") });
  await wire.click();
  await page.waitForTimeout(300);
}
const info = page.locator('[data-blend-action="info"]').first();
if ((await info.count()) > 0) {
  await info.click();
  await page.waitForTimeout(300);
}
const panelHidden = await panel.getAttribute("data-open").catch(() => null);
const reset = page.locator('[data-blend-action="reset"]').first();
if ((await reset.count()) > 0) await reset.click().catch(() => {});

const failure = await page.locator("[data-blend-error-message]").first().innerText().catch(() => "");
console.log(
  JSON.stringify(
    {
      state,
      triangles,
      canvasSize,
      pixels,
      objectNames,
      panelLen: panelText.length,
      panelHasSize: /322/.test(panelText) && /mm/.test(panelText),
      panelHidden,
      failure,
      errors: errors.slice(0, 10),
    },
    null,
    2
  )
);
await writeFile(join(outDir, "errors.txt"), errors.join("\n"), "utf8");
await browser.close();
if (state !== "ready") process.exitCode = 1;
