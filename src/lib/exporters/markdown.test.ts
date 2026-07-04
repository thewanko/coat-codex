// lib/exporters/markdown.test.ts — 素のMarkdownエクスポータのテスト
// （技術計画v2.2 M5 T32・2026-07-04 FB-F改訂）
//
// 2026-07-04ユーザーフィードバック対応の再設計の回帰防止:
//   - 印刷ビュー（components/print/PrintRecipeSheet.tsx）と同一の情報構造で出力すること
//     （概要行・PALETTE hex表記・PART Iローマ数字見出し・番号付き工程リスト）を固定する
//   - 境界: 空工程・技法名なし・塗料/ツール/メモ/写真の有無組合せ・パーツ0工程・
//     パーツ0件・palette 0件・tools 0件・混合比合計≠100警告

import { describe, expect, test } from "vitest";
import type { RecipeDoc, Step } from "../../models/recipe";
import { DEFAULT_MARKDOWN_LABELS, exportRecipeToMarkdown } from "./markdown";

/** テスト用Step生成ヘルパー。noteMarkdown.test.tsの慣行に倣う */
function makeStep(overrides: Partial<Step> & { id: string }): Step {
  return {
    technique: { presetKey: null, label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

/** テスト用RecipeDoc生成ヘルパー */
function makeDoc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "テストレシピ",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    ...overrides,
  };
}

describe("exportRecipeToMarkdown — 印刷ビュー同構造の固定（フル構成）", () => {
  const doc = makeDoc({
    title: "Space Marine テストレシピ",
    updatedAt: "2026-01-02T00:00:00.000Z",
    palette: [
      {
        id: "col_1",
        source: "preset",
        brand: "Citadel",
        name: "Abaddon Black",
        presetId: "citadel_abaddon_black",
        hex: "#000000",
        chipPhotoId: null,
      },
      {
        id: "col_2",
        source: "custom",
        brand: null,
        name: "自作レッド",
        presetId: null,
        hex: null,
        chipPhotoId: null,
      },
    ],
    tools: [
      { id: "tool_1", name: "平筆", note: null },
      { id: "tool_2", name: "スポンジ", note: "チッピング用" },
    ],
    baseSteps: [
      makeStep({
        id: "step_1",
        technique: { presetKey: "prime", label: null },
        paints: [{ colorId: "col_1" }],
        toolIds: ["tool_1"],
        memo: "全体に薄く",
        photoId: "photo_1",
      }),
      makeStep({
        id: "step_2",
        technique: { presetKey: "basecoat", label: null },
        paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
        mix: [60, 50],
      }),
    ],
    parts: [
      {
        id: "part_1",
        name: "兜",
        steps: [
          makeStep({
            id: "step_3",
            technique: { presetKey: "drybrush", label: null },
            toolIds: ["tool_2"],
          }),
        ],
      },
      {
        id: "part_2",
        name: "肩当て",
        steps: [],
      },
    ],
  });

  const markdown = exportRecipeToMarkdown(doc);

  test("概要行（全N工程・Nパーツ ・ 更新日）を含む", () => {
    expect(markdown).toContain("全3工程・2パーツ ・ 2026-01-02");
  });

  test("PALETTE見出しの各行が色名・ブランド・hexで構成される（ブランドnullは名前のみ）", () => {
    expect(markdown).toContain("## PALETTE — 使用カラー");
    expect(markdown).toContain("- Abaddon Black（Citadel） ・ #000000");
    expect(markdown).toContain("- 自作レッド");
    expect(markdown).not.toContain("自作レッド ・ ");
  });

  test("TOOLS見出し配下にツール一覧（note併記）が並ぶ", () => {
    expect(markdown).toContain("## TOOLS — 使用ツール");
    expect(markdown).toContain("- 平筆");
    expect(markdown).toContain("- スポンジ（チッピング用）");
  });

  test("BASE工程は番号付きリストで技法名・塗料(名前+hex)・ツール・メモ・写真あり注記を持つ", () => {
    expect(markdown).toContain("## BASE — ベース工程（全体）");
    expect(markdown).toContain("1. プライマー");
    expect(markdown).toContain("   - 塗料: Citadel Abaddon Black (#000000)");
    expect(markdown).toContain("   - ツール: 平筆");
    expect(markdown).toContain("   - メモ: 全体に薄く");
    expect(markdown).toContain("   - 写真あり");
  });

  test("混合バッジ・合計≠100警告が工程行に併記される", () => {
    expect(markdown).toContain(
      "2. ベースコート\n   - 塗料: Citadel Abaddon Black (#000000) + 自作レッド — 60% + 50% ⚠ 計 110%",
    );
  });

  test("PARTはローマ数字見出し（PART I）＋パーツ名＋工程数メタで構成される", () => {
    expect(markdown).toContain("## PART I — 兜（1工程）");
    expect(markdown).toContain("1. ドライブラシ");
    expect(markdown).toContain("   - ツール: スポンジ");
  });

  test("0工程のパーツも見出しは出力される（PART II — 肩当て（0工程）シと工程リストなし）", () => {
    expect(markdown).toContain("## PART II — 肩当て（0工程）");
    expect(markdown.split("## PART II — 肩当て（0工程）")[1]).not.toMatch(
      /\d+\. /,
    );
  });

  test("全文スナップショット（印刷同構造の固定）", () => {
    expect(markdown).toBe(
      [
        "# Space Marine テストレシピ",
        "",
        "全3工程・2パーツ ・ 2026-01-02",
        "",
        "## PALETTE — 使用カラー",
        "- Abaddon Black（Citadel） ・ #000000",
        "- 自作レッド",
        "",
        "## TOOLS — 使用ツール",
        "- 平筆",
        "- スポンジ（チッピング用）",
        "",
        "## BASE — ベース工程（全体）",
        "",
        "1. プライマー",
        "   - 塗料: Citadel Abaddon Black (#000000)",
        "   - ツール: 平筆",
        "   - メモ: 全体に薄く",
        "   - 写真あり",
        "",
        "2. ベースコート",
        "   - 塗料: Citadel Abaddon Black (#000000) + 自作レッド — 60% + 50% ⚠ 計 110%",
        "",
        "## PART I — 兜（1工程）",
        "",
        "1. ドライブラシ",
        "   - ツール: スポンジ",
        "",
        "## PART II — 肩当て（0工程）",
      ].join("\n") + "\n",
    );
  });
});

describe("exportRecipeToMarkdown — 空セクションのスキップ挙動", () => {
  test("palette・tools・baseSteps・partsがすべて空のとき見出し自体が出ない（タイトル＋概要行のみ）", () => {
    const doc = makeDoc({
      title: "空レシピ",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    const markdown = exportRecipeToMarkdown(doc);

    expect(markdown).toBe("# 空レシピ\n\n全0工程・0パーツ ・ 2026-01-03\n");
    expect(markdown).not.toContain("PALETTE");
    expect(markdown).not.toContain("TOOLS");
    expect(markdown).not.toContain("BASE");
  });

  test("何も内容がない工程（技法名なし・塗料0件・ツール0件・メモ空・写真なし）はプレースホルダのみ", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "s1" })],
    });
    const markdown = exportRecipeToMarkdown(doc);

    expect(markdown).toContain("1. （未設定）");
    expect(markdown).not.toContain("- 塗料");
    expect(markdown).not.toContain("- ツール");
    expect(markdown).not.toContain("- メモ");
    expect(markdown).not.toContain("- 写真あり");
  });
});

describe("exportRecipeToMarkdown — サニタイズ（markdownSanitize.ts適用の維持）", () => {
  test("タイトル先頭の#はエスケープされ見出し崩れを起こさない", () => {
    const doc = makeDoc({ title: "# 危険なタイトル" });
    const markdown = exportRecipeToMarkdown(doc);

    expect(markdown.startsWith("#  # 危険なタイトル")).toBe(true);
  });

  test("メモ内の改行は空白へ畳み込まれ複数行に分裂しない", () => {
    const doc = makeDoc({
      baseSteps: [
        makeStep({
          id: "s1",
          technique: { presetKey: "wash", label: null },
          memo: "1行目\n2行目",
        }),
      ],
    });
    const markdown = exportRecipeToMarkdown(doc);

    expect(markdown).toContain("   - メモ: 1行目 2行目");
  });
});

describe("DEFAULT_MARKDOWN_LABELS", () => {
  test("techniqueTがtechniques.*キーをja既定文言へフォールバックする", () => {
    expect(DEFAULT_MARKDOWN_LABELS.techniqueT("techniques.prime")).toBe(
      "プライマー",
    );
  });
});
