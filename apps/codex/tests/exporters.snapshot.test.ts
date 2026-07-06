// tests/exporters.snapshot.test.ts — markdown.ts / noteMarkdown.ts のスナップショットテスト（技術計画v2.2 M5 T32）
//
// 代表フィクスチャ（tests/fixtures/recipe.ts）で両エクスポータの出力を toMatchSnapshot する。
// 混合バッジは lib/mixRatio.ts formatMixBadge の出力をそのまま使う設計のため、
// バッジ書式（§2.3）自体の単体検証は src/lib/mixRatio.test.ts の責務とし、ここでは
// 出力ドキュメント全体の構造（見出し・箇条書き・警告併記・写真有無・自由入力技法等）を検証する。

import "../src/i18n";
import { beforeAll, describe, expect, test } from "vitest";
import i18next from "../src/i18n";
import { recipeDocSchema } from "../src/models/recipe";
import {
  buildMarkdownLabels,
  exportRecipeToMarkdown,
} from "../src/lib/exporters/markdown";
import { exportRecipeToNoteMarkdown } from "../src/lib/exporters/noteMarkdown";
import {
  createFixtureRecipe,
  stepEmpty,
  stepMixIrreducible,
  stepMixOverTotal,
  stepMixReducible,
  stepMultilineMemo,
  stepNoPaint,
  stepSingleColor,
} from "./fixtures/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("フィクスチャの妥当性", () => {
  test("createFixtureRecipe()はrecipeDocSchemaを通過する（不変条件を満たす）", () => {
    const result = recipeDocSchema.safeParse(createFixtureRecipe());
    expect(result.success).toBe(true);
  });
});

describe("exportRecipeToMarkdown", () => {
  test("代表フィクスチャのスナップショット", () => {
    const recipe = createFixtureRecipe();
    expect(exportRecipeToMarkdown(recipe)).toMatchSnapshot();
  });

  test("印刷ビュー同構造: 概要行（全N工程・Nパーツ ・ 更新日）を含む（2026-07-04 FB-F）", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("全7工程・2パーツ ・ 2026-07-02");
  });

  test("印刷ビュー同構造: PALETTE見出し配下は色名・ブランド・hexで構成される", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("## PALETTE — 使用カラー");
    expect(output).toContain("- Mephiston Red（Citadel） ・ #960F0F");
  });

  test("印刷ビュー同構造: PARTはローマ数字見出し（PART I・PART II）で構成される", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("## PART I — 頭部（2工程）");
    expect(output).toContain("## PART II — 胴体（3工程）");
  });

  test("印刷ビュー同構造: 工程は番号付きリストで構成される", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("1. ベースコート");
    expect(output).toContain("2. ドライブラシ");
  });

  test("混色・合計100・約分可能はformatMixBadgeの比率併記書式を含む", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("60% + 40% (3:2)");
  });

  test("混色・合計100・約分不能は比率省略書式", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("55% + 45%");
    expect(output).not.toContain("55% + 45% (");
  });

  test("混色・合計≠100は警告バッジを併記", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("60% + 50%");
    expect(output).toContain("⚠ 計 110%");
  });

  test("単色工程は混合バッジを含まない（スウォッチ相当のみ）", () => {
    const recipe = createFixtureRecipe({
      baseSteps: [stepSingleColor()],
      parts: [],
    });
    const output = exportRecipeToMarkdown(recipe);
    expect(output).not.toContain("%");
  });

  test("塗料0件工程は技法名のみで塗料行を出力しない", () => {
    const recipe = createFixtureRecipe({
      baseSteps: [stepNoPaint()],
      parts: [],
    });
    const output = exportRecipeToMarkdown(recipe);
    expect(output).not.toContain("塗料:");
  });

  test("工程写真ありは写真ありラベルを出力する", () => {
    const recipe = createFixtureRecipe({
      baseSteps: [stepMixReducible({ photoId: "ph_x" })],
      parts: [],
    });
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("写真あり");
  });

  test("工程写真なしは写真ありラベルを出力しない", () => {
    const recipe = createFixtureRecipe({
      baseSteps: [stepMixIrreducible({ photoId: null })],
      parts: [],
    });
    const output = exportRecipeToMarkdown(recipe);
    expect(output).not.toContain("写真あり");
  });

  test("自由入力技法はlabelをそのまま見出しに使う", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("オリジナルウェザリング");
  });

  test("複数パーツはそれぞれ見出しとして出力される", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("頭部");
    expect(output).toContain("胴体");
  });

  test("ベース工程見出しを含む", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("ベース工程（全体）");
  });

  test("M5修正3: title行頭#・memo内改行はサニタイズされ構造を壊さない（スナップショット）", () => {
    const recipe = createFixtureRecipe({
      title: "# 悪意ある\n改行タイトル",
      baseSteps: [stepMultilineMemo()],
      parts: [],
    });
    expect(exportRecipeToMarkdown(recipe)).toMatchSnapshot();
  });

  test("M5修正3: 出力の行数がmemo内改行の数だけ増えない（1工程=1メモ行に畳み込まれる）", () => {
    const recipe = createFixtureRecipe({
      title: "通常タイトル",
      baseSteps: [stepMultilineMemo()],
      parts: [],
    });
    const output = exportRecipeToMarkdown(recipe);
    const memoLine = output
      .split("\n")
      .find((line) => line.includes("1行目のメモ"));
    expect(memoLine).toBeDefined();
    expect(memoLine).not.toContain("\n");
    // memo内の"## 偽の見出し"・"- 偽の箇条書き"が独立行として出力されていないこと
    expect(output).not.toContain("\n## 偽の見出し");
    expect(output.split("\n- 偽の箇条書き\n").length).toBe(1);
  });

  test("M5修正3: 既存の代表フィクスチャ出力（サニタイズ対象を含まない）は変化しない", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToMarkdown(recipe);
    expect(output).toContain("# Space Marine Captain");
    expect(output).toContain("Citadel Mephiston Red (#960F0F)");
  });

  // レビューM1対応: DEFAULT_MARKDOWN_LABELS（i18n非経由）のみのテストは本番のi18n経路
  // （UI層がbuildMarkdownLabels(t)で注入する経路）を検証できていなかった。
  // buildMarkdownLabels(i18next.t)（ja初期化済み）を注入し、ユーザーが実際に受け取る
  // MD出力を固定する。
  describe("本番i18n経路（buildMarkdownLabels(i18next.t)注入）", () => {
    test("代表フィクスチャのスナップショット（本番i18n経路）", () => {
      const recipe = createFixtureRecipe();
      expect(
        exportRecipeToMarkdown(recipe, buildMarkdownLabels(i18next.t)),
      ).toMatchSnapshot();
    });

    test("概要行・見出し・工程行がDEFAULT_MARKDOWN_LABELSと同一形で出力される（stepsMetaの語順はprint.stepsMeta既定・スコープ外）", () => {
      const recipe = createFixtureRecipe();
      const output = exportRecipeToMarkdown(
        recipe,
        buildMarkdownLabels(i18next.t),
      );
      expect(output).toContain("全7工程・2パーツ ・ 2026-07-02");
      expect(output).toContain("## PALETTE — 使用カラー");
      expect(output).toContain("- Mephiston Red（Citadel） ・ #960F0F");
      expect(output).toContain("## PART I — 頭部（工程 2）");
      expect(output).toContain("1. ベースコート");
    });
  });
});

describe("exportRecipeToNoteMarkdown", () => {
  test("代表フィクスチャのスナップショット", () => {
    const recipe = createFixtureRecipe();
    expect(exportRecipeToNoteMarkdown(recipe)).toMatchSnapshot();
  });

  test("末尾にハッシュタグ#coatcodexを含む", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToNoteMarkdown(recipe);
    expect(output.trim().endsWith("#coatcodex")).toBe(true);
  });

  test("混色・合計≠100は警告バッジを併記", () => {
    const recipe = createFixtureRecipe({
      baseSteps: [stepMixOverTotal()],
      parts: [],
    });
    const output = exportRecipeToNoteMarkdown(recipe);
    expect(output).toContain("60% + 50%");
    expect(output).toContain("⚠ 計 110%");
  });

  test("区切り線(---)を含む", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToNoteMarkdown(recipe);
    expect(output).toContain("---");
  });

  test("何も内容がない工程はプレースホルダを出力する", () => {
    const recipe = createFixtureRecipe({
      baseSteps: [stepEmpty()],
      parts: [],
    });
    const output = exportRecipeToNoteMarkdown(recipe);
    expect(output).toContain("（未設定）");
  });

  test("hashtag=''のときハッシュタグ行を省略する", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToNoteMarkdown(recipe, {
      paletteHeading: "使用カラー",
      toolsHeading: "使用ツール",
      baseStepsHeading: "ベース工程（全体）",
      stepLabel: (n) => `STEP ${n}`,
      paintsLabel: "塗料",
      toolsLabel: "ツール",
      memoLabel: "メモ",
      hasPhotoLabel: "写真あり",
      mixTotalWarning: (total) => `⚠ 計 ${total}%`,
      emptyStepLabel: "（未設定）",
      techniqueT: (key) => key,
      hashtag: "",
    });
    expect(output).not.toContain("#coatcodex");
  });

  test("M5修正3: title行頭#・memo内改行はサニタイズされ構造を壊さない（スナップショット）", () => {
    const recipe = createFixtureRecipe({
      title: "# 悪意ある\n改行タイトル",
      baseSteps: [stepMultilineMemo()],
      parts: [],
    });
    expect(exportRecipeToNoteMarkdown(recipe)).toMatchSnapshot();
  });

  test("M5修正3: memo内の偽見出し・偽箇条書きが独立行として出力されない", () => {
    const recipe = createFixtureRecipe({
      title: "通常タイトル",
      baseSteps: [stepMultilineMemo()],
      parts: [],
    });
    const output = exportRecipeToNoteMarkdown(recipe);
    expect(output).not.toContain("\n## 偽の見出し");
    expect(output.split("\n- 偽の箇条書き\n").length).toBe(1);
  });
});
