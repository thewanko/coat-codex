/*
 * public/og-image.png（1200×630 OGP画像）の再生成スクリプト。
 * 意匠を変えるときは同ディレクトリの og-image.html を編集して再実行する。
 *
 * 前提: playwright を任意の作業ディレクトリに npm install し、そこから実行:
 *   npm install playwright && npx playwright install chromium
 *   node capture-og-image.mjs
 *
 * 注意: --allow-file-access-from-files は封蝋ロゴ（file://参照）を
 * canvasで背景透過処理するために必須（無いとcanvasがtaintされハングする）。
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto("file://" + join(here, "og-image.html"));
await page.waitForFunction(() => window.__sealReady === true, { timeout: 15000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
await page.screenshot({
  path: join(here, "../../public/og-image.png"),
  type: "png",
});
await browser.close();
console.log("saved public/og-image.png");
