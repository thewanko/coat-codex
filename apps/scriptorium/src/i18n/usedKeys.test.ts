// i18n/usedKeys.test.ts — コード中で使用されるi18nキー ⇔ ロケールファイルの双方向突き合わせ
// （coat-scriptorium 技術計画v1 §S8 ST-33: i18n棚卸し・privacy.*キーを含む）
//
// i18n.test.ts / requiredI18nKeys.test.ts は「ロケール2言語の構造一致」「REQUIRED_I18N_KEYS網羅」を
// 検証するが、「コードが実際に使うキーとロケールの整合」は未検証だったため本ファイルで恒久化する。
//
// node:fs（tsc -bのtype-check対象。@types/node非導入のため使用不可）の代わりに
// Vite組み込みのimport.meta.globで生ソースを静的取得する（apps/codex/src/i18n/i18n.test.tsと
// 同じ流儀）。ビルド時のtsc型検査を通過しつつ、テスト実行時はeager評価で全文字列を読み込める。

import { describe, expect, test } from "vitest";
import { REQUIRED_I18N_KEYS } from "@coat-codex/recipe-ui";
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

function resolveKey(data: JsonRecord, key: string): string | undefined {
  const parts = key.split(".");
  let current: JsonRecord | string = data;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    const record: JsonRecord = current;
    const next: JsonRecord | string | undefined = record[part];
    if (next === undefined) {
      return undefined;
    }
    current = next;
  }
  return typeof current === "string" ? current : undefined;
}

const rawSourceModules = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sourceFileContents = new Map<string, string>();
for (const [filePath, content] of Object.entries(rawSourceModules)) {
  const isTest =
    filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx");
  if (!isTest) {
    sourceFileContents.set(filePath, content);
  }
}
const SOURCE_FILES = [...sourceFileContents.keys()];
const COMBINED_SOURCE = [...sourceFileContents.values()].join("\n");

// 限界: 負の後読みに"."を含むため、i18n.t("x") のようなメンバ呼び出し形は
// 意図的に除外される（t( の直前が識別子や"."だと不一致になる）。将来
// i18n.t(...) の直呼びを導入する場合はこのregexの追従（後読み条件の緩和）が必要。
const T_CALL_KEY_RE = /(?<![A-Za-z0-9_.])t\(\s*["']([A-Za-z0-9_.-]+)["']/g;

function extractStaticTCallKeys(): Set<string> {
  const keys = new Set<string>();
  for (const content of sourceFileContents.values()) {
    for (const match of content.matchAll(T_CALL_KEY_RE)) {
      keys.add(match[1]);
    }
  }
  return keys;
}

const EN_FLAT = new Set(flatten(en as unknown as JsonRecord));
const STATIC_T_CALL_KEYS = extractStaticTCallKeys();

const DYNAMIC_TEMPLATE_PREFIXES = [
  "admin.settings.values.",
  "admin.settings.",
  "admin.tabs.",
];

// 限界（over-inclusion）: この関数はコメント内文字列でも真になる（コードの
// 文字列リテラルとコメント中の同一文字列を区別しない）。誤検出は許容し、
// 見逃し（本来孤児であるキーを説明可能と誤判定すること）を避ける側に倒す。
// apps/codex/src/i18n/i18n.test.ts の同種チェックと同じ限界を持つ。
function isStringLiteralInSource(key: string): boolean {
  return (
    COMBINED_SOURCE.includes(`"${key}"`) || COMBINED_SOURCE.includes(`'${key}'`)
  );
}

function isExplainable(key: string): boolean {
  // 1. ソース中の文字列リテラルとして出現（t()直書きに限らない間接参照を含む）
  if (isStringLiteralInSource(key)) {
    return true;
  }
  // 2. 複数形バリアント（i18next count複数形）
  // 限界: 現状 "_other" サフィックスのみに対応する。i18next の複数形ルールは
  // 言語によって "_one"/"_few"/"_many"/"_two"/"_zero" 等の追加クローズを持つため、
  // 将来これらを導入する場合は判定条件（endsWithの追加分岐）の拡張が必要。
  if (key.endsWith("_other")) {
    const base = key.slice(0, -"_other".length);
    if (isExplainable(base)) {
      return true;
    }
  }
  // 3. REQUIRED_I18N_KEYS
  if ((REQUIRED_I18N_KEYS as readonly string[]).includes(key)) {
    return true;
  }
  // 4. 動的テンプレートプレフィックス
  // AdminPage.tsx の t(`admin.tabs.${statusTab}`) 等、変数展開を含む動的キーは
  // t()呼び出しの静的抽出（T_CALL_KEY_RE）で捕捉できない。ただし、これらの変数値は
  // 全てSTATUS/SETTINGSタブ配列・キー配列・値マップの文字列リテラル定数として
  // ソース中に実在するため、プレフィックス一致だけでなく「プレフィックス除去後の
  // 残りセグメントが各々ソース中に文字列リテラルとして存在する」ことまで確認する。
  // これにより、ロケールに足しただけでUI未結線の孤児キー（例:
  // admin.settings.newToggle）はプレフィックス一致のみでは救済されず赤くなる。
  // 残余限界: セグメントは独立照合のため、既存セグメント名の無効な組合せ
  // （例: values.circuit_breaker.auto）や "on"/"off" 等の汎用単語 leaf の
  // 偶然一致は救済され得る（R2レビューで許容と裁定・完全閉包はソース構造への
  // 脆い結合を招くため採らない）。
  for (const prefix of DYNAMIC_TEMPLATE_PREFIXES) {
    if (key.startsWith(prefix)) {
      const remainder = key.slice(prefix.length);
      if (remainder.length === 0) {
        continue;
      }
      const segments = remainder.split(".");
      if (segments.every((segment) => isStringLiteralInSource(segment))) {
        return true;
      }
    }
  }
  return false;
}

describe("i18n used-keys inventory（コード使用キー ⇔ ロケール突き合わせ・ST-33）", () => {
  test("走査対象ソースファイルが存在する（テスト自体の健全性）", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
  });

  test("静的t()キーは全て en/ja 両方で非空文字列に解決される", () => {
    const missingInEn: string[] = [];
    const missingInJa: string[] = [];
    for (const key of STATIC_T_CALL_KEYS) {
      const enValue = resolveKey(en as unknown as JsonRecord, key);
      const jaValue = resolveKey(ja as unknown as JsonRecord, key);
      if (enValue === undefined || enValue === "") {
        missingInEn.push(key);
      }
      if (jaValue === undefined || jaValue === "") {
        missingInJa.push(key);
      }
    }
    expect(missingInEn, "en missing/empty for static t() keys").toEqual([]);
    expect(missingInJa, "ja missing/empty for static t() keys").toEqual([]);
  });

  test("en.jsonの全キーは使用として説明可能である（孤児キー検出）", () => {
    const unexplained = [...EN_FLAT].filter((key) => !isExplainable(key));
    expect(unexplained, "orphan keys in en.json").toEqual([]);
  });

  test("AdminPage.tsxの動的テンプレートプレフィックス3種が実在する（形骸化防止）", () => {
    const adminPageEntry = [...sourceFileContents.entries()].find(([path]) =>
      path.endsWith("routes/AdminPage.tsx"),
    );
    expect(adminPageEntry, "AdminPage.tsx not found in scan").toBeDefined();
    const content = adminPageEntry?.[1] ?? "";
    expect(content.includes("t(`admin.tabs.${")).toBe(true);
    expect(content.includes("t(`admin.settings.${")).toBe(true);
    expect(content.includes("t(`admin.settings.values.${")).toBe(true);
  });

  test("privacy.*キーがen/ja両方に1件以上存在し、全て静的使用に含まれる（ST-37回帰固定）", () => {
    const enPrivacyKeys = [...EN_FLAT].filter((k) => k.startsWith("privacy."));
    const jaFlat = new Set(flatten(ja as unknown as JsonRecord));
    const jaPrivacyKeys = [...jaFlat].filter((k) => k.startsWith("privacy."));
    expect(enPrivacyKeys.length).toBeGreaterThan(0);
    expect(jaPrivacyKeys.length).toBeGreaterThan(0);

    const notStaticallyUsed = enPrivacyKeys.filter(
      (k) => !STATIC_T_CALL_KEYS.has(k),
    );
    expect(
      notStaticallyUsed,
      "privacy.* keys not found as static t() usage",
    ).toEqual([]);
  });
});
