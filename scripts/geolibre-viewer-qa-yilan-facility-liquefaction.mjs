import { chromium, devices } from "playwright";
import fs from "node:fs";
import { PNG } from "pngjs";

const projectUrl = process.env.GEOLIBRE_PROJECT_URL;
const taskId = process.env.GEOLIBRE_TASK_ID || "geolibre-task";
const outDir = process.env.GEOLIBRE_QA_DIR || `GeoLibre-Web/analysis/${taskId}/viewer-qa`;
if (!projectUrl) throw new Error("GEOLIBRE_PROJECT_URL is required");
fs.mkdirSync(outDir, { recursive: true });

const encoded = encodeURIComponent(projectUrl);
const baseTargets = [
  {
    key: "self-hosted",
    label: "自架 GitHub Pages",
    url: `https://ymguan3-boop.github.io/good-open-source-collection/GeoLibre-Web/?locale=zh-TW&layout=viewer&loading=true&url=${encoded}`,
  },
  {
    key: "official-fallback",
    label: "官方 GeoLibre 備援",
    url: `https://web.geolibre.app/?locale=zh-TW&layout=viewer&loading=true&url=${encoded}`,
  },
];

const profiles = [
  {
    key: "desktop",
    label: "桌面",
    context: {
      viewport: { width: 1365, height: 900 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
    },
  },
  {
    key: "mobile",
    label: "Android 手機",
    context: {
      ...devices["Pixel 7"],
      viewport: { width: 412, height: 915 },
      ignoreHTTPSErrors: true,
    },
  },
];

function imageStats(buffer) {
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png;
  let nonWhite = 0;
  let colored = 0;
  let dark = 0;
  let resultSymbolPixels = 0;
  const total = width * height;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a < 20) continue;
    if (!(r > 248 && g > 248 && b > 248)) nonWhite++;
    if (Math.max(r,g,b) - Math.min(r,g,b) > 14) colored++;
    if (r < 235 || g < 235 || b < 235) dark++;
    if (r >= 155 && g <= 100 && b <= 105 && r - g >= 75 && r - b >= 70) resultSymbolPixels++;
  }
  return {
    width, height,
    nonWhiteRatio: total ? nonWhite / total : 0,
    coloredRatio: total ? colored / total : 0,
    darkRatio: total ? dark / total : 0,
    resultSymbolPixels,
  };
}

async function testCase(browser, target, profile) {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", err => pageErrors.push(String(err?.stack || err)));
  page.on("requestfailed", req => failedRequests.push({ url: req.url(), error: req.failure()?.errorText || "request failed" }));

  const qaNonce = Date.now();
  const url = target.url + `&qa=${qaNonce}`;
  const key = `${target.key}-${profile.key}`;
  const result = {
    key,
    targetKey: target.key,
    profileKey: profile.key,
    label: `${target.label}｜${profile.label}`,
    url,
    startedAt: new Date().toISOString(),
    pass: false,
    checks: {},
    consoleErrors,
    pageErrors,
    failedRequests,
  };

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    result.httpStatus = response?.status() ?? null;
    await page.waitForTimeout(3000);

    try {
      await page.waitForFunction(() => {
        const state = document.documentElement.dataset.geolibreLoadState;
        return state === "ready" || state === "error";
      }, { timeout: 90000 });
    } catch {}

    if (!(await page.locator("body").innerText()).includes("篩選結果：中／高潛勢或300公尺內")) {
      const controls = page.getByRole("button", { name: /圖層|圖資|layers|layer/i });
      for (let i = 0, n = Math.min(await controls.count(), 6); i < n; i++) {
        if (await controls.nth(i).isVisible()) {
          await controls.nth(i).click().catch(() => {});
          await page.waitForTimeout(700);
          if ((await page.locator("body").innerText()).includes("篩選結果：中／高潛勢或300公尺內")) break;
        }
      }
    }

    const dom = await page.evaluate(() => {
      const root = document.querySelector("#root");
      const rootRect = root?.getBoundingClientRect();
      const txt = document.body?.innerText || "";
      const canvases = [...document.querySelectorAll("canvas")].map(c => {
        const r = c.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
          visible: !!(r.width > 100 && r.height > 100),
          cls: c.className?.toString?.() || "",
        };
      });
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
        hasExpectedLayerName: txt.includes("篩選結果：中／高潛勢或300公尺內"),
        bodyPreview: txt.slice(0, 2500),
      };
    });
    result.dom = dom;

    const fullShot = await page.screenshot({ path: `${outDir}/${key}.png`, fullPage: false });
    result.screenshot = `${key}.png`;
    result.image = imageStats(fullShot);

    let canvasStats = null;
    try {
      const count = await page.locator("canvas").count();
      for (let i = 0; i < count; i++) {
        const loc = page.locator("canvas").nth(i);
        const box = await loc.boundingBox();
        if (box && box.width > 250 && box.height > 220) {
          const buf = await loc.screenshot({ path: `${outDir}/${key}-canvas.png` });
          canvasStats = imageStats(buf);
          result.canvasScreenshot = `${key}-canvas.png`;
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
      appMounted: dom.rootWidth > 280 && dom.rootHeight > 300 && dom.bodyTextLength > 20,
      ready: dom.state === "ready",
      noLoadErrors: loadErrors.length === 0,
      visibleCanvas: dom.visibleCanvasCount > 0,
      notWhiteScreen: result.image.nonWhiteRatio > 0.03 && result.image.darkRatio > 0.02,
      canvasHasPixels: !!canvasStats && canvasStats.nonWhiteRatio > 0.02 && canvasStats.coloredRatio > 0.002,
      visibleResultSymbols: !!canvasStats && canvasStats.resultSymbolPixels > 20,
      expectedLayerVisibleInUi: dom.hasExpectedLayerName,
    };
    result.checks = checks;
    result.pass = Object.values(checks).every(Boolean);
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
for (const target of baseTargets) {
  for (const profile of profiles) {
    results.push(await testCase(browser, target, profile));
  }
}
await browser.close();

const targetSummary = baseTargets.map(target => {
  const cases = results.filter(r => r.targetKey === target.key);
  return {
    key: target.key,
    label: target.label,
    desktopPass: !!cases.find(r => r.profileKey === "desktop")?.pass,
    mobilePass: !!cases.find(r => r.profileKey === "mobile")?.pass,
    pass: cases.length === profiles.length && cases.every(r => r.pass),
  };
});

const summary = {
  taskId,
  projectUrl,
  generatedAt: new Date().toISOString(),
  minimumPassRule: "At least one viewer endpoint must pass both desktop and Android-mobile visual QA: ready, no load errors, nonblank rendered map canvas, and expected analysis layer visible in UI.",
  pass: targetSummary.some(t => t.pass),
  targetSummary,
  results,
};
fs.writeFileSync(`${outDir}/viewer-qa.json`, JSON.stringify(summary, null, 2));

const md = [
  "# GeoLibre Viewer QA",
  "",
  `- Task: ${taskId}`,
  `- Overall: **${summary.pass ? "PASS" : "FAIL"}**`,
  `- Rule: at least one endpoint must pass both desktop and Android mobile.`,
  "",
  ...targetSummary.flatMap(t => [
    `## ${t.label}`,
    `- Endpoint result: **${t.pass ? "PASS" : "FAIL"}**`,
    `- Desktop: ${t.desktopPass ? "PASS" : "FAIL"}`,
    `- Android mobile: ${t.mobilePass ? "PASS" : "FAIL"}`,
    "",
    ...results.filter(r => r.targetKey === t.key).flatMap(r => [
      `### ${r.profileKey}`,
      `- Result: **${r.pass ? "PASS" : "FAIL"}**`,
      `- State: ${r.dom?.state ?? "n/a"}`,
      `- Visible canvases: ${r.dom?.visibleCanvasCount ?? 0}`,
      `- Expected layer text: ${r.dom?.hasExpectedLayerName ? "yes" : "no"}`,
      `- Full screenshot non-white ratio: ${(r.image?.nonWhiteRatio ?? 0).toFixed(4)}`,
      `- Map canvas non-white ratio: ${(r.canvasImage?.nonWhiteRatio ?? 0).toFixed(4)}`,
      `- Load errors: ${r.dom?.errors ?? "[]"}`,
      "",
    ]),
  ]),
];
fs.writeFileSync(`${outDir}/viewer-qa.md`, md.join("\n"));
console.log(JSON.stringify(summary, null, 2));
if (!summary.pass) process.exit(2);
