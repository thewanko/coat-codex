// i18n/i18n.test.ts — en/ja ロケールのキー構造一致テスト（codex i18n.test.ts (a) の流儀）
// ＋ 言語切替永続化（scriptorium:lang）の最小テスト

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import en from "../locales/en.json";
import ja from "../locales/ja.json";

type JsonRecord = { [key: string]: JsonRecord | string };

function flatten(obj: JsonRecord, prefix = ""): string[] {
  let out: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") {
      out = out.concat(flatten(value as JsonRecord, fullKey));
    } else {
      out.push(fullKey);
    }
  }
  return out;
}

function flattenWithValues(obj: JsonRecord, prefix = ""): [string, string][] {
  let out: [string, string][] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") {
      out = out.concat(flattenWithValues(value as JsonRecord, fullKey));
    } else {
      out.push([fullKey, value as string]);
    }
  }
  return out;
}

describe("i18n key inventory (en/ja structural parity)", () => {
  test("en/jaのキー集合が完全一致する（欠落ゼロ・双方向）", () => {
    const enKeys = new Set(flatten(en as unknown as JsonRecord));
    const jaKeys = new Set(flatten(ja as unknown as JsonRecord));

    const missingInJa = [...enKeys].filter((k) => !jaKeys.has(k));
    const missingInEn = [...jaKeys].filter((k) => !enKeys.has(k));
    expect(missingInJa, "en→ja missing").toEqual([]);
    expect(missingInEn, "ja→en missing").toEqual([]);
  });

  test("空文字列の翻訳値が存在しない（en/ja）", () => {
    const enEmpty = flattenWithValues(en as unknown as JsonRecord).filter(
      ([, value]) => value === "",
    );
    const jaEmpty = flattenWithValues(ja as unknown as JsonRecord).filter(
      ([, value]) => value === "",
    );
    expect(enEmpty).toEqual([]);
    expect(jaEmpty).toEqual([]);
  });
});

describe("i18n language persistence (scriptorium:lang)", () => {
  const LANG_STORAGE_KEY = "scriptorium:lang";

  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  test("言語変更でlocalStorageにscriptorium:langが書き込まれる", async () => {
    const { default: i18next } = await import("./index");
    await i18next.changeLanguage("ja");
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe("ja");

    await i18next.changeLanguage("en");
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe("en");
  });

  test("初期化時にlocalStorageの言語設定を復元する", async () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, "ja");
    const { default: i18next } = await import("./index");
    expect(i18next.language).toBe("ja");
  });

  test("localStorageに値がない場合はnavigator.languageから判定する（既定en）", async () => {
    const { default: i18next } = await import("./index");
    expect(i18next.language).toBe("en");
  });

  test("localStorageの値が不正な言語コードの場合はnavigator.language判定にフォールバックする", async () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, "zz");
    const { default: i18next } = await import("./index");
    expect(i18next.language).toBe("en");
  });
});
