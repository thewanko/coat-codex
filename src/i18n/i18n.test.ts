// i18n/i18n.test.ts — i18n全キー棚卸しの機械チェック（技術計画v2.2 §4.2 T41）
//
// (a)(b) ja.json/en.jsonのキー集合完全一致・空文字列翻訳ゼロ
// (c)(d) ソースコードから静的t()呼び出し・キー文字列リテラル代入（messageKey等）を機械抽出し、
//        ja.jsonへの存在を検証。動的名前空間（techniques.<presetKey>）は名前空間単位で
//        ja/en双方の存在・一致を検証する（(d)は想定外の動的名前空間出現も検出する閉包アサーション付き）
// (e) 仕様名指しキー（recipe.untitledTitle・mix.totalWarning・工程写真UI文言）の存在
// (f) 逆方向チェック: ja.jsonの全キーが「静的抽出キー ∪ techniques.*」に含まれる
//     （＝デッドキー検出。(c)は使用キー⊆ja.jsonの片方向のみのため、未使用キーの
//     再混入は(f)がなければ検出できない）
// 言語切替永続化: coat-codex:lang（src/i18n/index.ts）の書き込み・復元

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import ja from "./locales/ja.json";
import en from "./locales/en.json";
import { TECHNIQUE_PRESET_KEYS } from "../lib/techniques";

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

const jaKeys = new Set(flatten(ja as unknown as JsonRecord));
const enKeys = new Set(flatten(en as unknown as JsonRecord));

// i18nextの複数形サフィックス（CLDR plural categories）。`t()`呼び出し側は
// count渡し時にベースキー（例: `volumesCount`）のみを参照し、i18nextが実行時に
// `_one`/`_other`等へ自動解決するため、キー一致・使用網羅・デッドキーの各チェックは
// このサフィックスを剥がした「ベースキー」単位で比較する。ja/en間で複数形カテゴリ数が
// 異なっても（例: ja=`_other`のみ, en=`_one`/`_other`）ベースキーが揃っていれば整合とみなす。
const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];
const pluralSuffixRegex = new RegExp(`_(?:${PLURAL_SUFFIXES.join("|")})$`);

function toBaseKey(key: string): string {
  return key.replace(pluralSuffixRegex, "");
}

function toBaseKeySet(keys: Iterable<string>): Set<string> {
  return new Set([...keys].map(toBaseKey));
}

const jaBaseKeys = toBaseKeySet(jaKeys);
const enBaseKeys = toBaseKeySet(enKeys);

// --- ソースコード走査（テストファイル・locales自体を除くsrc/**/*.ts, *.tsx） ---
// node:fs（tsc -bのtype-check対象。@types/node非導入のため使用不可）の代わりに
// Vite組み込みのimport.meta.globで生ソースを静的取得する（ビルド時のtsc型検査を
// 通過しつつ、テスト実行時はeager評価で全文字列を読み込める）。

const rawSourceModules = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sourceFileContents = new Map<string, string>();
for (const [filePath, content] of Object.entries(rawSourceModules)) {
  const isTest =
    filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx");
  const isLocales = filePath.includes("/i18n/locales/");
  if (!isTest && !isLocales) {
    sourceFileContents.set(filePath, content);
  }
}
const sourceFiles = [...sourceFileContents.keys()];

/**
 * 静的キー抽出: `t("x.y")` / `t('x.y')` 直呼び出し、および `messageKey = "x.y"` や
 * 三項演算子で `t()` に渡されるキー変数へ代入される文字列リテラル（`errors.saveFailed`
 * `share.titleWhole` 等）の両方を捕捉する。ja.jsonの実在トップレベル名前空間で始まる
 * ドット区切り文字列リテラルのみを対象とすることで、CSSクラス名等のノイズを除外する。
 * テンプレートリテラル（`techniques.${presetKey}` 等）は正規表現の対象外＝動的キーとして
 * (d) で別途検証する。
 */
const topLevelNamespaces = new Set(Object.keys(ja));
const literalKeyRegex = /["']([a-zA-Z][\w-]*(?:\.[a-zA-Z][\w-]*)+)["']/g;

function extractStaticKeys(content: string): Set<string> {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  literalKeyRegex.lastIndex = 0;
  while ((match = literalKeyRegex.exec(content))) {
    const candidate = match[1];
    const namespace = candidate.split(".")[0];
    if (topLevelNamespaces.has(namespace)) {
      found.add(candidate);
    }
  }
  return found;
}

const allStaticKeysUsed = new Set<string>();
const staticKeysByFile = new Map<string, Set<string>>();
for (const [file, content] of sourceFileContents) {
  const keys = extractStaticKeys(content);
  staticKeysByFile.set(file, keys);
  for (const key of keys) {
    allStaticKeysUsed.add(key);
  }
}

// (d) 動的名前空間: `t(\`namespace.${...}\`)` 形式のテンプレートリテラルを検出し、
// 参照される名前空間を洗い出す。
const dynamicNamespaceRegex = /\bt\(\s*`([a-zA-Z][\w-]*)\.\$\{/g;

function extractDynamicNamespaces(content: string): Set<string> {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  dynamicNamespaceRegex.lastIndex = 0;
  while ((match = dynamicNamespaceRegex.exec(content))) {
    found.add(match[1]);
  }
  return found;
}

const allDynamicNamespaces = new Set<string>();
for (const content of sourceFileContents.values()) {
  for (const ns of extractDynamicNamespaces(content)) {
    allDynamicNamespaces.add(ns);
  }
}

describe("i18n key inventory (T41)", () => {
  test("(a) ja.json/en.jsonのキー集合が完全一致する（欠落ゼロ・双方向、複数形サフィックス差は許容）", () => {
    const jaMissingInEn = [...jaBaseKeys].filter((k) => !enBaseKeys.has(k));
    const enMissingInJa = [...enBaseKeys].filter((k) => !jaBaseKeys.has(k));
    expect(jaMissingInEn).toEqual([]);
    expect(enMissingInJa).toEqual([]);
  });

  test("(b) 空文字列の翻訳値が存在しない（ja/en両方）", () => {
    const jaEmpty = flattenWithValues(ja as unknown as JsonRecord).filter(
      ([, value]) => value === "",
    );
    const enEmpty = flattenWithValues(en as unknown as JsonRecord).filter(
      ([, value]) => value === "",
    );
    expect(jaEmpty).toEqual([]);
    expect(enEmpty).toEqual([]);
  });

  test("(c) ソースコードで静的参照される全キーがja.jsonに存在する（複数形はベースキーで判定）", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(allStaticKeysUsed.size).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const [file, keys] of staticKeysByFile) {
      for (const key of keys) {
        if (!jaKeys.has(key) && !jaBaseKeys.has(toBaseKey(key))) {
          missing.push(`${key} (${file})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test("(d) 動的名前空間 techniques.* はja/en双方に存在し、キー集合が一致する", () => {
    // ソースから実際にtechniques.${...}形式のテンプレートリテラルが検出されることを確認
    expect(allDynamicNamespaces.has("techniques")).toBe(true);

    // 閉包アサーション: 想定される動的名前空間はtechniquesのみ。
    // 新しい動的名前空間（`t(\`foo.${x}\`)`等）をソースに追加したら、
    // このリストと本テストの検証ロジックを更新すること。
    expect([...allDynamicNamespaces].sort()).toEqual(["techniques"]);

    const jaTechniqueKeys = new Set(Object.keys(ja.techniques));
    const enTechniqueKeys = new Set(Object.keys(en.techniques));

    expect([...jaTechniqueKeys].sort()).toEqual([...enTechniqueKeys].sort());

    // 実際に参照されうるpresetKey（lib/techniques.ts TECHNIQUE_PRESET_KEYS）が
    // ja/en双方のtechniques名前空間に過不足なく存在すること
    const presetKeySet = new Set<string>(TECHNIQUE_PRESET_KEYS);
    expect([...jaTechniqueKeys].sort()).toEqual([...presetKeySet].sort());
    expect([...enTechniqueKeys].sort()).toEqual([...presetKeySet].sort());
  });

  test("(f) ja.jsonの全キーは到達可能である（静的抽出キー ∪ 動的名前空間techniques.*配下、逆方向: デッドキー検出。複数形はベースキーで判定）", () => {
    // 到達可能キー集合 = ソースから静的抽出された全キー ∪ techniques.*名前空間の全キー
    // （techniquesはpresetKey経由の動的参照 `t(\`techniques.${key}\`)` のため、
    // 個々のキー文字列リテラルとしてはソースに出現しない）
    //
    // 限界（レビューRound 2 Low）: 静的抽出は「名前空間で始まるドット区切りリテラル」を
    // t()経由か否かを問わず「使用」とみなす保守的（見逃し方向）な判定のため、
    // 非i18n文字列（CSSクラス名等）が偶然 `namespace.foo` 形式になった場合、
    // そのキーが実際は未使用でもデッドキー検出をすり抜けうる（現時点でノイズ0件）
    const techniqueNamespaceKeys = new Set(
      Object.keys(ja.techniques).map((k) => `techniques.${k}`),
    );
    const reachableKeys = new Set([
      ...allStaticKeysUsed,
      ...techniqueNamespaceKeys,
    ]);
    const reachableBaseKeys = toBaseKeySet(reachableKeys);

    // ja.jsonの実キー（複数形サフィックス付きの場合あり）はベースキー化した上で、
    // 到達可能キー（サフィックスなしのt()呼び出しキー、またはtechniques.*の完全一致キー）
    // に含まれるかで判定する。
    const deadKeys = [...jaKeys].filter(
      (k) => !reachableKeys.has(k) && !reachableBaseKeys.has(toBaseKey(k)),
    );
    expect(deadKeys).toEqual([]);
  });

  test("(e) 仕様名指しキーがja/en双方に存在する", () => {
    const requiredKeys = [
      "recipe.untitledTitle",
      "mix.totalWarning",
      // 工程写真UI文言（StepPhotoTile / StepPhotoStrip）
      "photo.stepAdd", // 「＋ 写真 1枚」
      "photo.stepTag", // STEP {{n}}タグ
      "photo.uploading",
      "photo.delete",
      "editor.stepPhotoStripLabel",
      "editor.stepPhotoStripItemLabel",
      "editor.stepLabel",
    ];

    for (const key of requiredKeys) {
      expect(jaKeys.has(key), `ja.json missing ${key}`).toBe(true);
      expect(enKeys.has(key), `en.json missing ${key}`).toBe(true);
    }
  });
});

describe("i18n language persistence (coat-codex:lang)", () => {
  const LANG_STORAGE_KEY = "coat-codex:lang";

  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  test("言語変更でlocalStorageにcoat-codex:langが書き込まれる", async () => {
    const { default: i18next } = await import("./index");
    await i18next.changeLanguage("en");
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe("en");

    await i18next.changeLanguage("ja");
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe("ja");
  });

  test("初期化時にlocalStorageの言語設定を復元する", async () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, "en");
    const { default: i18next } = await import("./index");
    expect(i18next.language).toBe("en");
  });

  test("localStorageに値がない場合はja（既定）で初期化する", async () => {
    const { default: i18next } = await import("./index");
    expect(i18next.language).toBe("ja");
  });

  test("localStorageの値が不正な言語コードの場合はja（既定）にフォールバックする", async () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, "fr");
    const { default: i18next } = await import("./index");
    expect(i18next.language).toBe("ja");
  });
});
