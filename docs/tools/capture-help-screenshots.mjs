/*
 * /help ページのスクリーンショット素材（src/assets/help/*.jpg 12枚）の再生成スクリプト。
 * UIが変わったとき・スクショを別言語で撮り直すときに使う。
 *
 * 前提:
 *   1. dev サーバー起動中（npm run dev / port 5173）
 *   2. 黒狼レシピJSON（写真同梱のエクスポート形式）が IMPORT_JSON のパスに存在
 *   3. playwright を任意の作業ディレクトリに npm install し、そこから実行:
 *        npm install playwright && npx playwright install chromium
 *        node capture-help-screenshots.mjs
 *
 * 各スクショは Playwright の別プロファイル（IndexedDB空）で UIインポート→撮影。
 * 撮影言語は addInitScript の "coat-codex:lang" を変更する。
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:5173";
const OUT = "/Users/ken/Documents/ViveProject/coat-codex/src/assets/help";
const IMPORT_JSON =
  "/Users/ken/Documents/ViveProject/coat-codex/node_modules/.verify-tmp/kurookami.json";

fs.mkdirSync(OUT, { recursive: true });

async function finishAnimations(page) {
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
}

async function settle(page) {
  // hide storage warning banner (playwright profile is never persisted — noise for docs)
  await page.evaluate(() => {
    if (!document.getElementById("help-shot-style")) {
      const s = document.createElement("style");
      s.id = "help-shot-style";
      s.textContent = '[data-testid="storage-status-bar"]{display:none!important}';
      document.head.appendChild(s);
    }
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await finishAnimations(page);
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 85 });
  console.log("saved", name);
}

async function importRecipe(page) {
  await page.goto(BASE + "/");
  await page.getByText("JSONをインポート").waitFor({ timeout: 15000 });
  await page.locator('input[type="file"]').first().setInputFiles(IMPORT_JSON);
  await page.getByText("黒狼", { exact: false }).first().waitFor({ timeout: 20000 });
  // wait for photos to be stored & card thumbnail to render
  await page.waitForTimeout(1500);
  const ids = await page.evaluate(async () => {
    const req = indexedDB.open("coat-codex");
    const db = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const tx = db.transaction("recipes", "readonly");
    const all = await new Promise((res, rej) => {
      const r = tx.objectStore("recipes").getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const doc = all[0];
    return { id: doc.id, partId: doc.parts[0]?.id };
  });
  console.log("imported", ids);
  return ids;
}

async function captureSet(browser, kind, viewport, dsf, isMobile) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: dsf,
    isMobile,
    hasTouch: isMobile,
    locale: "ja-JP",
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("coat-codex:lang", "ja"));
  const { id, partId } = await importRecipe(page);

  const dismissBanner = async () => {
    const later = page.getByRole("button", { name: "あとで" });
    if (await later.count()) {
      await later.first().click();
      await page.waitForTimeout(200);
    }
  };
  const waitToastGone = async () => {
    const toast = page.getByText("をインポートしました", { exact: false });
    if (await toast.count()) {
      await toast.first().waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    }
    await page.waitForTimeout(300);
  };

  // 1. home (import auto-navigates to overview — go back to "/")
  await page.goto(BASE + "/");
  await page.getByText("黒狼", { exact: false }).first().waitFor({ timeout: 10000 });
  await waitToastGone();
  await dismissBanner();
  await page.waitForTimeout(800); // card thumbnail
  await shot(page, `home-${kind}`);

  // 2. setup
  await page.goto(`${BASE}/recipe/${id}/setup`);
  await page.waitForFunction(
    () => [...document.querySelectorAll("input")].some((i) => i.value.includes("黒狼")),
    { timeout: 10000 },
  );
  await shot(page, `setup-${kind}`);

  // 3. overview
  await page.goto(`${BASE}/recipe/${id}`);
  await page.getByText("黒狼", { exact: false }).first().waitFor({ timeout: 10000 });
  await dismissBanner();
  await page.waitForTimeout(800); // photo thumbnails
  // scroll so BASE/PARTS cards are visible (more informative than hero photo alone)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (e) => e.children.length === 0 && e.textContent?.trim() === "BASE",
    );
    el?.scrollIntoView({ block: "start" });
    window.scrollBy(0, -90);
  });
  await page.waitForTimeout(300);
  await shot(page, `overview-${kind}`);

  // 4. editor (part)
  await page.goto(`${BASE}/recipe/${id}/part/${partId}`);
  await page.waitForTimeout(800);
  await finishAnimations(page);
  await shot(page, `editor-${kind}`);

  // 5. share dialog
  await page.goto(`${BASE}/recipe/${id}`);
  await page.getByText("黒狼", { exact: false }).first().waitFor({ timeout: 10000 });
  await dismissBanner();
  await page.waitForTimeout(500);
  if (isMobile) {
    await page.getByRole("button", { name: "出力・共有" }).click();
    await page.waitForTimeout(300);
    await finishAnimations(page);
  }
  await page.getByRole("button", { name: "SNSに投稿" }).first().click();
  // wait for candidate generation to complete ("N / 4 枚選択中" appears)
  await page.getByText("枚選択中", { exact: false }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await shot(page, `share-${kind}`);

  // 6. print view
  await page.goto(`${BASE}/recipe/${id}/print`);
  await page.getByText("PALETTE", { exact: false }).first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  await shot(page, `print-${kind}`);

  await ctx.close();
}

const browser = await chromium.launch();
try {
  await captureSet(browser, "pc", { width: 1280, height: 800 }, 2, false);
  await captureSet(browser, "mobile", { width: 375, height: 812 }, 2, true);
} finally {
  await browser.close();
}
console.log("done");
