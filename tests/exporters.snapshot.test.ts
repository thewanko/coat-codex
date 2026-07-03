// tests/exporters.snapshot.test.ts — markdown.ts / noteMarkdown.ts のスナップショットテスト（技術計画v2.2 M5 T32）
//
// 代表フィクスチャ（tests/fixtures/recipe.ts）で両エクスポータの出力を toMatchSnapshot する。
// 混合バッジは lib/mixRatio.ts formatMixBadge の出力をそのまま使う設計のため、
// バッジ書式（§2.3）自体の単体検証は src/lib/mixRatio.test.ts の責務とし、ここでは
// 出力ドキュメント全体の構造（見出し・箇条書き・警告併記・写真有無・自由入力技法等）を検証する。

import { describe, expect, test } from "vitest";
import { recipeDocSchema } from "../src/models/recipe";
import { exportRecipeToMarkdown } from "../src/lib/exporters/markdown";
import { exportRecipeToNoteMarkdown } from "../src/lib/exporters/noteMarkdown";
import {
  createFixtureRecipe,
  stepEmpty,
  stepMixIrreducible,
  stepMixOverTotal,
  stepMixReducible,
  stepNoPaint,
  stepSingleColor,
} from "./fixtures/recipe";

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
});

describe("exportRecipeToNoteMarkdown", () => {
  test("代表フィクスチャのスナップショット", () => {
    const recipe = createFixtureRecipe();
    expect(exportRecipeToNoteMarkdown(recipe)).toMatchSnapshot();
  });

  test("末尾にハッシュタグ#coat-codexを含む", () => {
    const recipe = createFixtureRecipe();
    const output = exportRecipeToNoteMarkdown(recipe);
    expect(output.trim().endsWith("#coat-codex")).toBe(true);
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
      partsHeading: "パーツ",
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
    expect(output).not.toContain("#coat-codex");
  });
});
