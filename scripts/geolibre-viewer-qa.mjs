import { chromium } from "playwright";
import fs from "node:fs";
import { PNG } from "pngjs";

const projectUrl = process.env.GEOLIBRE_PROJECT_URL;
const taskId = process.env.GEOLIBRE_TASK_ID || "geolibre-task";
const outDir = process.env.GEOLIBRE_QA_DIR || `GeoLibre-Web/analysis/${taskId}/viewer-qa`;
if (!projectUrl) throw new Error("GEOLIBRE_PROJECT_URL is required");
fs.mkdirSync(outDir, { recursive: true });

const encoded = encodeURIComponent(projectUrl);
const targets = [
  {
    key: "self-hosted",
    label: "自架 GitHub Pages",
    url: `https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW&layout=viewer&loading=true&url=${encoded}&qa=${Date.now()}`,
  },
  {
    key: "official-fallback",
    label: "官方 GeoLibre 備援",
    url: `https://web.geolibre.app/?locale=zh-TW&layout=viewer&loading=true&url=${encoded}&qa=${Date.now()}`,
  },
];

function imageStats(buffer) {
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png;
  let nonWhite = 0;
  let colored = 0;
  let dark = 0;
  const total = width * height;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a < 20) continue;
    if (!(r > 248 && g > 248 && b > 248)) nonWhite++;
    if (Math.max(r,g,b) - Math.min(r,g,b) > 14) colored++;
    if (r < 235 || g < 235 || b < 235) dark++;
  }
  return {
    width, height,
    nonWhiteRatio: total ? nonWhite / total : 0,
    coloredRatio: total ? colored / total : 0,
    darkRatio: total ? dark / total : 0,
  };
}

async function testTarget(browser, target) {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", err => pageErrors.push(String(err?.stack || err)));
  page.on("requestfailed", req => failedRequests.push({
    url: req.url(),
    error: req.failure()?.errorText || "request failed",
  }));

  const result = {
    key: target.key,
    label: target.label,
    url: target.url,
    startedAt: new Date().toISOString(),
    pass: false,
    checks: {},
    consoleErrors,
    pageErrors,
    failedRequests,
  };

  try {
    const response = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    result.httpStatus = response?.status() ?? null;

    await page.waitForTimeout(3000);

    try {
      await page.waitForFunction(() => {
        const state = document.documentElement.dataset.geolibreLoadState;
        return state === "ready" || state === "error";
      }, { timeout: 90000 });
    } catch {}

    const dom = await page.evaluate(() => {
      const root = document.querySelector("#root");
      const rootRect = root?.getBoundingClientRect();
      const canvases = [...document.querySelectorAll("canvas")].map(c => {
        const r = c.getBoundingClientRect();
        return {
          width: r.width, height: r.height,
          visible: !!(r.width > 120 && r.height > 120),
          cls: c.className?.toString?.() || "",
        };
      });
      const txt = document.body?.innerText || "";
      return {
        title: document.title,
        state: document.documentElement.dataset.geolibreLoadState || null,
        pending: document.documentElement.dataset.geolibreLoadPending || null,
        errors: document.documentElement.dataset.geolibreLoadErrors || null,
        bodyTextLength: txt.trim().length,
        rootTextLength: (root?.innerText || "").trim().length,
        rootWidth: rootRect?.width || 0,
        rootHeight: rootRect?.height || 0,
        canvasCount: canvases.length,
        visibleCanvasCount: canvases.filter(x => x.visible).length,
        canvases,
        hasExpectedLayerName: txt.includes("重複施工查核熱點") || txt.includes("施工案件證據"),
        bodyPreview: txt.slice(0, 3000),
      };
    });
    result.dom = dom;

    const fullShot = await page.screenshot({ path: `${outDir}/${target.key}.png`, fullPage: false });
    result.screenshot = `${target.key}.png`;
    result.image = imageStats(fullShot);

    let canvasStats = null;
    const mapCanvas = page.locator("canvas").filter({ visible: true }).first();
    try {
      const count = await page.locator("canvas").count();
      for (let i = 0; i < count; i++) {
        const loc = page.locator("canvas").nth(i);
        const box = await loc.boundingBox();
        if (box && box.width > 300 && box.height > 250) {
          const buf = await loc.screenshot({ path: `${outDir}/${target.key}-canvas.png` });
          canvasStats = imageStats(buf);
          result.canvasScreenshot = `${target.key}-canvas.png`;
          break;
        }
      }
    } catch {}
    result.canvasImage = canvasStats;

    let loadErrors = [];
    try {
      loadErrors = dom.errors ? JSON.parse(dom.errors) : [];
      if (!Array.isArray(loadErrors)) loadErrors = [loadErrors];
    } catch {
      loadErrors = dom.errors ? [dom.errors] : [];
    }

    const checks = {
      httpOk: result.httpStatus === null || (result.httpStatus >= 200 && result.httpStatus < 400),
      appMounted: dom.rootWidth > 300 && dom.rootHeight > 300 && dom.bodyTextLength > 20,
      ready: dom.state === "ready",
      noLoadErrors: loadErrors.length === 0,
      visibleCanvas: dom.visibleCanvasCount > 0,
      notWhiteScreen: result.image.nonWhiteRatio > 0.03 && result.image.darkRatio > 0.02,
      canvasHasPixels: !!canvasStats && canvasStats.nonWhiteRatio > 0.02 && canvasStats.coloredRatio > 0.002,
      expectedLayerVisibleInUi: dom.hasExpectedLayerName,
    };
    result.checks = checks;

    // Critical: not blank + app ready + map canvas has actual rendered pixels + no loader errors.
    // Layer name is also required so we know the intended project, not just the basemap shell, loaded.
    result.pass = checks.httpOk && checks.appMounted && checks.ready &&
      checks.noLoadErrors && checks.visibleCanvas && checks.notWhiteScreen &&
      checks.canvasHasPixels && checks.expectedLayerVisibleInUi;
  } catch (error) {
    result.exception = String(error?.stack || error);
  } finally {
    result.completedAt = new Date().toISOString();
    await context.close();
  }
  return result;
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (const target of targets) results.push(await testTarget(browser, target));
await browser.close();

const summary = {
  taskId,
  projectUrl,
  generatedAt: new Date().toISOString(),
  minimumPassRule: "At least one of self-hosted or official fallback must render the intended project with ready state, no load errors, a nonblank map canvas, and expected layer text.",
  pass: results.some(r => r.pass),
  results,
};
fs.writeFileSync(`${outDir}/viewer-qa.json`, JSON.stringify(summary, null, 2));

const md = [
  "# GeoLibre Viewer QA",
  "",
  `- Task: ${taskId}`,
  `- Overall: **${summary.pass ? "PASS" : "FAIL"}**`,
  "",
  ...results.flatMap(r => [
    `## ${r.label}`,
    `- Result: **${r.pass ? "PASS" : "FAIL"}**`,
    `- URL: ${r.url}`,
    `- State: ${r.dom?.state ?? "n/a"}`,
    `- Visible canvases: ${r.dom?.visibleCanvasCount ?? 0}`,
    `- Expected layer text: ${r.dom?.hasExpectedLayerName ? "yes" : "no"}`,
    `- Full screenshot non-white ratio: ${(r.image?.nonWhiteRatio ?? 0).toFixed(4)}`,
    `- Map canvas non-white ratio: ${(r.canvasImage?.nonWhiteRatio ?? 0).toFixed(4)}`,
    `- Load errors: ${r.dom?.errors ?? "[]"}`,
    "",
  ]),
];
fs.writeFileSync(`${outDir}/viewer-qa.md`, md.join("\n"));

console.log(JSON.stringify(summary, null, 2));
if (!summary.pass) process.exit(2);
