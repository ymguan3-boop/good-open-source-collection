#!/usr/bin/env node
// Bundle the gallery into dist/gallery (a static site: GitHub Pages or any host) and dist/page (one page plus
// one script, system font fallback, for hosts that take a page body).
//
//   node tools/index.mjs && node tools/build-gallery.mjs

import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/fxlib.mjs";

const G = join(ROOT, "gallery"), OUT = join(ROOT, "dist", "gallery"), PAGE = join(ROOT, "dist", "page");
mkdirSync(OUT, { recursive: true });
mkdirSync(PAGE, { recursive: true });

await build({ entryPoints: [join(G, "app.js")], bundle: true, format: "esm", minify: true, outfile: join(OUT, "app.js"), legalComments: "none" });
// 專有 Patch Pixel 字型未收錄；由系統字型顯示。
writeFileSync(join(OUT, "style.css"), readFileSync(join(G, "style.css")));
writeFileSync(join(OUT, "index.html"), readFileSync(join(G, "index.html")));

// the one-page version: <title> and <style> first, then the body markup with system-font fallback
const html = readFileSync(join(G, "index.html"), "utf8");
const body = html.slice(html.indexOf("<!--BODY-->") + 11, html.indexOf("<!--/BODY-->"));
const css = readFileSync(join(G, "style.css"), "utf8");
writeFileSync(
  join(PAGE, "index.html"),
  [
    "<title>像素特效與動畫庫 pixelfx</title>",
    '<meta name="claude:viewport-fit-sides" content="cover">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Funnel+Sans:wght@400;500&family=Red+Hat+Mono:wght@400;500&display=swap">',
    `<style>\n${css}\n</style>`,
    body.trim(),
    '<script type="module" src="app.js"></script>',
  ].join("\n"),
);
cpSync(join(OUT, "app.js"), join(PAGE, "app.js"));
console.log(`dist/gallery and dist/page built (${(readFileSync(join(OUT, "app.js")).length / 1024).toFixed(0)} KB of script)`);
