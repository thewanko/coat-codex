// tests/fixtures/recipe.ts — RecipeDocの代表フィクスチャファクトリ（技術計画v2.2 M5 T32）
//
// exporters（markdown.ts/noteMarkdown.ts/json.ts）・importRecipe.ts往復テスト等、
// RecipeDocを必要とする複数テストから再利用する汎用ファクトリ。
// 網羅する観点（T32仕様）:
//   - 混色: 合計100・比率併記（3:2） / 約分不能・比率省略 / 合計≠100・警告併記
//   - 単色
//   - 塗料0件（マスキング等）
//   - 工程写真あり・なし
//   - ベース工程
//   - 複数パーツ
//   - 自由入力技法（presetKey=null, label非null）
//
// 実体のないIDでも zod は写真参照の実体存在を検証しない（§2.5-16）ため、
// photoId には photos テーブル同梱なしのダミーIDをそのまま使ってよい。

import type { RecipeDoc, Step } from "../../src/models/recipe";

/** 混色・合計100・約分可能（3:2） → バッジ "60% + 40% (3:2)" */
export function stepMixReducible(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_mix_reducible",
    technique: { presetKey: "basecoat", label: null },
    photoId: "ph_step_basecoat",
    paints: [{ colorId: "col_red" }, { colorId: "col_white" }],
    mix: [60, 40],
    toolIds: ["tool_brush"],
    memo: "2度塗りでムラを消す",
    ...overrides,
  };
}

/** 混色・合計100・約分不能 → バッジ "55% + 45%"（比率省略） */
export function stepMixIrreducible(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_mix_irreducible",
    technique: { presetKey: "layer", label: null },
    photoId: null,
    paints: [{ colorId: "col_red" }, { colorId: "col_white" }],
    mix: [55, 45],
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

/** 混色・合計≠100 → バッジ "60% + 50%"（比率省略）＋警告併記 */
export function stepMixOverTotal(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_mix_over_total",
    technique: { presetKey: "wash", label: null },
    photoId: null,
    paints: [{ colorId: "col_red" }, { colorId: "col_white" }],
    mix: [60, 50],
    toolIds: ["tool_brush"],
    memo: "合計オーバーの警告表示を確認する工程",
    ...overrides,
  };
}

/** 単色（mix=null） */
export function stepSingleColor(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_single_color",
    technique: { presetKey: "drybrush", label: null },
    photoId: "ph_step_drybrush",
    paints: [{ colorId: "col_red" }],
    mix: null,
    toolIds: ["tool_brush"],
    memo: "エッジに軽くドライブラシ",
    ...overrides,
  };
}

/** 塗料0件（マスキング等・paints=[]・mix=null） */
export function stepNoPaint(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_no_paint",
    technique: { presetKey: "masking", label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: ["tool_masking-tape"],
    memo: "",
    ...overrides,
  };
}

/** 自由入力技法（presetKey=null, label非null） */
export function stepCustomTechnique(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_custom_technique",
    technique: { presetKey: null, label: "オリジナルウェザリング" },
    photoId: null,
    paints: [{ colorId: "col_black" }],
    mix: null,
    toolIds: [],
    memo: "自作技法のメモ",
    ...overrides,
  };
}

/** 技法・塗料・ツール・メモ・写真のいずれも未設定の工程（空表示の確認用） */
export function stepEmpty(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_empty",
    technique: { presetKey: null, label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

/**
 * 代表フィクスチャ: 完全なRecipeDocを返す汎用ファクトリ。
 * ベース工程・複数パーツ・上記全観点の工程を網羅する。
 * overridesで部分的な差し替えが可能（浅いマージ。ネストしたフィールドは呼び出し側で組み立てる）。
 */
export function createFixtureRecipe(
  overrides: Partial<RecipeDoc> = {},
): RecipeDoc {
  const base: RecipeDoc = {
    schemaVersion: 1,
    id: "rcp_fixture",
    title: "Space Marine Captain",
    createdAt: "2026-07-02T10:00:00.000Z",
    updatedAt: "2026-07-02T12:34:56.000Z",
    overviewPhotoIds: ["ph_overview_1", "ph_overview_2"],
    palette: [
      {
        id: "col_red",
        source: "preset",
        brand: "Citadel",
        name: "Mephiston Red",
        presetId: "citadel:mephiston-red",
        hex: "#960F0F",
        chipPhotoId: null,
      },
      {
        id: "col_white",
        source: "preset",
        brand: "Citadel",
        name: "White Scar",
        presetId: "citadel:white-scar",
        hex: "#F0F0F0",
        chipPhotoId: null,
      },
      {
        id: "col_black",
        source: "custom",
        brand: null,
        name: "自家調合ブラック",
        presetId: null,
        hex: null,
        chipPhotoId: "ph_chip_black",
      },
    ],
    tools: [
      { id: "tool_brush", name: "筆", note: "面相筆" },
      { id: "tool_masking-tape", name: "マスキングテープ", note: null },
    ],
    baseSteps: [stepMixReducible(), stepSingleColor({ id: "stp_base_single" })],
    parts: [
      {
        id: "part_head",
        name: "頭部",
        steps: [
          stepMixIrreducible({ id: "stp_head_irreducible" }),
          stepCustomTechnique({ id: "stp_head_custom" }),
        ],
      },
      {
        id: "part_body",
        name: "胴体",
        steps: [
          stepMixOverTotal({ id: "stp_body_over_total" }),
          stepNoPaint({ id: "stp_body_no_paint" }),
          stepEmpty({ id: "stp_body_empty" }),
        ],
      },
    ],
  };

  return { ...base, ...overrides };
}
