// lib/exporters/noteMarkdown.test.ts — note.com向けMarkdownエクスポータのテスト（技術計画v2.2 M5 T32）
//
// 2026-07-03ユーザー実機報告を受けた再設計の回帰防止:
//   - note.com公式ヘルプ「Markdownショートカット」が実際に対応する記法（##・###・-・1.・---）のみ
//     使用していること（h1「^# 」・h4以降「^#### 」・太字「**」が出力に含まれないことを固定）
//   - 全文比較で構成（タイトル→パレット/ツール→ベース工程→パーツ→ハッシュタグ）を検証
//   - 境界: 空工程・技法名なし・塗料/ツール/メモ/写真の有無組合せ・パーツ0件・palette 0件

import { describe, expect, test } from "vitest";
import type { RecipeDoc, Step } from "@coat-codex/recipe-core";
import {
  DEFAULT_NOTE_MARKDOWN_LABELS,
  exportRecipeToNoteMarkdown,
} from "./noteMarkdown";

/** テスト用Step生成ヘルパー。json.test.tsの慣行に倣う */
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
    schemaVersion: 3,
    id: "rcp_1",
    title: "テストレシピ",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    source: null,
    ...overrides,
  };
}

/** 出力にnote.comが変換対応しない記法（h1・h4以降・太字）が含まれないことを検証する共通アサーション */
function expectOnlySupportedSyntax(markdown: string): void {
  const lines = markdown.split("\n");
  for (const line of lines) {
    expect(line).not.toMatch(/^# /); // h1不可
    expect(line).not.toMatch(/^#{4,} /); // h4以降不可
  }
  expect(markdown).not.toContain("**"); // 太字不可
}

describe("exportRecipeToNoteMarkdown", () => {
  test("フル構成（パレット・ツール・ベース工程・複数パーツ）の全文がnote.com対応記法のみで構成される", () => {
    const doc = makeDoc({
      title: "Space Marine テストレシピ",
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

    const markdown = exportRecipeToNoteMarkdown(doc);

    expectOnlySupportedSyntax(markdown);

    expect(markdown).toBe(
      [
        "## Space Marine テストレシピ",
        "",
        "---",
        "",
        "### 🖌️ 使用カラー",
        "- Citadel Abaddon Black",
        "- 自作レッド",
        "",
        "### 🧰 使用ツール",
        "- 平筆",
        "- スポンジ（チッピング用）",
        "",
        "---",
        "",
        "### 🛡️ ベース工程（全体）",
        "",
        "1. 🎨 プライマー — 塗料: Citadel Abaddon Black ／ ツール: 平筆 ／ メモ: 全体に薄く ／ 📷 写真あり",
        "2. 🎨 ベースコート — 塗料: Citadel Abaddon Black + 自作レッド — 60% + 50% ⚠ 計 110%",
        "",
        "---",
        "",
        "### ⚔️ 兜",
        "",
        "1. 🎨 ドライブラシ — ツール: スポンジ",
        "",
        "---",
        "",
        "### ⚔️ 肩当て",
        "",
        "---",
        "",
        "#coatcodex",
        "",
      ].join("\n"),
    );
  });

  test("工程が実番号（1. 2. 3. …）で連番出力される（note.comの貼り付け変換が連番を保証しないための固定）", () => {
    const doc = makeDoc({
      baseSteps: [
        makeStep({
          id: "step_1",
          technique: { presetKey: "prime", label: null },
        }),
        makeStep({
          id: "step_2",
          technique: { presetKey: "basecoat", label: null },
        }),
        makeStep({
          id: "step_3",
          technique: { presetKey: "layer", label: null },
        }),
      ],
      parts: [
        {
          id: "part_1",
          name: "腕",
          steps: [
            makeStep({
              id: "step_4",
              technique: { presetKey: "wash", label: null },
            }),
            makeStep({
              id: "step_5",
              technique: { presetKey: "drybrush", label: null },
            }),
          ],
        },
      ],
    });

    const markdown = exportRecipeToNoteMarkdown(doc);

    expectOnlySupportedSyntax(markdown);
    // ベース工程は1始まりの実番号で連番
    expect(markdown).toContain("1. 🎨 プライマー");
    expect(markdown).toContain("2. 🎨 ベースコート");
    expect(markdown).toContain("3. 🎨 レイヤー");
    // パーツは新しいリストのため1始まりに戻り、実番号で連番
    expect(markdown).toContain("1. 🎨 ウォッシュ");
    expect(markdown).toContain("2. 🎨 ドライブラシ");
    // 全行が"1."固定になっていないこと（連番になっていることの直接確認）
    const stepLines = markdown
      .split("\n")
      .filter((line) => /^\d+\. /.test(line));
    expect(stepLines).toEqual([
      "1. 🎨 プライマー",
      "2. 🎨 ベースコート",
      "3. 🎨 レイヤー",
      "1. 🎨 ウォッシュ",
      "2. 🎨 ドライブラシ",
    ]);
  });

  test("palette・tools・baseSteps・parts全て0件のとき、タイトルとハッシュタグのみになる", () => {
    const doc = makeDoc();

    const markdown = exportRecipeToNoteMarkdown(doc);

    expectOnlySupportedSyntax(markdown);
    expect(markdown).toBe(
      ["## テストレシピ", "", "---", "", "#coatcodex", ""].join("\n"),
    );
  });

  test("全要素なしの空工程は emptyStepLabel を1.リストで出す", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "step_empty" })],
    });

    const markdown = exportRecipeToNoteMarkdown(doc);

    expectOnlySupportedSyntax(markdown);
    expect(markdown).toContain(
      `1. ${DEFAULT_NOTE_MARKDOWN_LABELS.emptyStepLabel}`,
    );
  });

  test("技法名なし・要素ありの工程はstepLabelをフォールバック見出しに使う", () => {
    const doc = makeDoc({
      baseSteps: [
        makeStep({
          id: "step_no_technique",
          memo: "技法未設定だがメモあり",
        }),
      ],
    });

    const markdown = exportRecipeToNoteMarkdown(doc);

    expectOnlySupportedSyntax(markdown);
    expect(markdown).toContain(
      `1. ${DEFAULT_NOTE_MARKDOWN_LABELS.stepLabel(1)} — ${DEFAULT_NOTE_MARKDOWN_LABELS.memoLabel}: 技法未設定だがメモあり`,
    );
  });

  test("技法名のみで他要素なしの工程は見出しのみの1行になる", () => {
    const doc = makeDoc({
      baseSteps: [
        makeStep({
          id: "step_technique_only",
          technique: { presetKey: "wash", label: null },
        }),
      ],
    });

    const markdown = exportRecipeToNoteMarkdown(doc);

    expectOnlySupportedSyntax(markdown);
    expect(markdown).toContain("1. 🎨 ウォッシュ\n");
  });

  test("塗料1件のみ（mixバッジなし）は '+' 連結や% badge を出さない", () => {
    const doc = makeDoc({
      palette: [
        {
          id: "col_1",
          source: "custom",
          brand: null,
          name: "単色",
          presetId: null,
          hex: null,
          chipPhotoId: null,
        },
      ],
      baseSteps: [
        makeStep({
          id: "step_single_paint",
          paints: [{ colorId: "col_1" }],
        }),
      ],
    });

    const markdown = exportRecipeToNoteMarkdown(doc);

    expectOnlySupportedSyntax(markdown);
    expect(markdown).toContain(
      `1. ${DEFAULT_NOTE_MARKDOWN_LABELS.stepLabel(1)} — ${DEFAULT_NOTE_MARKDOWN_LABELS.paintsLabel}: 単色`,
    );
  });

  test("パーツ0件・ベース工程ありのとき、パーツセクションは出力されない", () => {
    const doc = makeDoc({
      baseSteps: [makeStep({ id: "step_1" })],
      parts: [],
    });

    const markdown = exportRecipeToNoteMarkdown(doc);

    expectOnlySupportedSyntax(markdown);
    expect(markdown).not.toContain("⚔️");
  });

  test("hashtagが空文字なら末尾の区切り線・ハッシュタグ行を出力しない", () => {
    const doc = makeDoc();

    const markdown = exportRecipeToNoteMarkdown(doc, {
      ...DEFAULT_NOTE_MARKDOWN_LABELS,
      hashtag: "",
    });

    expectOnlySupportedSyntax(markdown);
    expect(markdown).toBe(["## テストレシピ", ""].join("\n"));
  });

  test("タイトル・メモ・パーツ名の行頭記号は sanitizeMarkdownText で無害化される", () => {
    const doc = makeDoc({
      title: "# 危険なタイトル",
      baseSteps: [
        makeStep({
          id: "step_danger",
          memo: "- 箇条書き風メモ",
        }),
      ],
      parts: [
        {
          id: "part_danger",
          name: "> 引用風パーツ名",
          steps: [],
        },
      ],
    });

    const markdown = exportRecipeToNoteMarkdown(doc);

    expectOnlySupportedSyntax(markdown);
    expect(markdown).toContain("##  # 危険なタイトル");
    expect(markdown).toContain("メモ:  - 箇条書き風メモ");
    expect(markdown).toContain("### ⚔️  > 引用風パーツ名");
  });

  test("ツール名の行頭記号（箇条書き記号）も sanitizeMarkdownText で無害化される", () => {
    const doc = makeDoc({
      tools: [{ id: "tool_danger", name: "- 危険ツール", note: null }],
      baseSteps: [
        makeStep({
          id: "step_danger_tool",
          toolIds: ["tool_danger"],
        }),
      ],
    });

    const markdown = exportRecipeToNoteMarkdown(doc);

    expectOnlySupportedSyntax(markdown);
    // 使用ツール一覧（"- "箇条書き記法）内のツール名自体が"-"始まりでも、
    // sanitizeMarkdownTextにより行頭スペースが挿入され二重の箇条書き記号にならない
    // （"- " + " - 危険ツール" = "-  - 危険ツール"。行頭が"- "1つだけの見た目になる）
    expect(markdown).toContain("-  - 危険ツール");
    // 工程行のツール参照（"ツール: "の後）でも同様に無害化される
    expect(markdown).toContain("ツール:  - 危険ツール");
  });
});
