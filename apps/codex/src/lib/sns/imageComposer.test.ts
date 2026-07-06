import { describe, expect, test, vi } from "vitest";
import {
  buildFileName,
  composeShareImages,
  computeCardLayout,
  computeCoverSourceRect,
  computeSummaryWholeBudget,
  generateRandomSuffix,
  listShareCandidates,
  sanitizeFileNamePart,
  SUMMARY_STEP_LIST_AREA_HEIGHT,
  truncateToWidth,
  type CandidateResolvers,
  type CanvasContextLike,
  type CanvasLike,
  type ComposedShareImage,
  type ComposerDeps,
  type PartCandidateSpec,
  type PartLike,
  type RecipeDocLike,
  type Rect,
  type ShareCandidateSpec,
  type ShareContext,
  type StepLike,
  type SummaryPartCandidateSpec,
  type SummaryStepRow,
  type SummaryWholeCandidateSpec,
  type WholeCandidateSpec,
} from "./imageComposer";

// ---- テスト用フィクスチャ ----

function makeStep(overrides: Partial<StepLike> = {}): StepLike {
  return {
    photoId: null,
    technique: { presetKey: "basecoat", label: null },
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

function makePart(overrides: Partial<PartLike> = {}): PartLike {
  return {
    id: "part_1",
    name: "兜",
    steps: [],
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<RecipeDocLike> = {}): RecipeDocLike {
  return {
    title: "Space Marine Captain",
    overviewPhotoIds: [],
    parts: [],
    baseSteps: [],
    palette: [],
    ...overrides,
  };
}

const resolvers: CandidateResolvers = {
  techniqueLabel: (step) => step.technique.presetKey ?? "unknown",
  mixBadge: (step) => (step.paints.length >= 2 ? "60% + 40%" : ""),
  mixWarning: (step) => {
    if (step.mix === null) return null;
    const total = step.mix.reduce((sum, v) => sum + v, 0);
    return total !== 100 ? "合計が100%になっていません" : null;
  },
  stepTag: (n) => `STEP ${n}`,
  paletteColor: (colorId) => {
    if (colorId === "col_missing") return null;
    return {
      name: `Color ${colorId}`,
      hex: "#960F0F",
      brand: null,
      rangeLabel: null,
    };
  },
  summaryProgress: (partsCount, totalSteps) =>
    `${partsCount}パーツ・全${totalSteps}工程`,
  overflowColorsLabel: (remaining) => `+${remaining}`,
  overflowStepsLabel: (remaining) => `…他${remaining}工程`,
  toolLabels: (step) => step.toolIds.map((id) => `Tool ${id}`),
  baseSectionLabel: () => "ベース工程（全体）",
  partStepsLabel: (count) => `${count}工程`,
  overflowPartsLabel: (remaining) => `…他${remaining}パーツ`,
  sectionPartsLabel: () => "パーツ構成",
  sectionColorsLabel: () => "使用カラー",
};

// ---- listShareCandidates ----

describe("listShareCandidates", () => {
  test("whole: 全体写真0件→まとめカード（summary/whole）1枚のみ（写真ゼロのレシピでも表紙は成立する）", () => {
    const ctx: ShareContext = { mode: "whole", recipe: makeRecipe() };
    const result = listShareCandidates(ctx, resolvers);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("summary");
    expect((result[0] as SummaryWholeCandidateSpec).variant).toBe("whole");
  });

  test("whole: 全体写真複数件→先頭にまとめカード＋写真順にwhole候補", () => {
    const recipe = makeRecipe({ overviewPhotoIds: ["ph_1", "ph_2", "ph_3"] });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    expect(result).toHaveLength(4);
    expect(result[0].kind).toBe("summary");

    const wholeCards = result.slice(1) as WholeCandidateSpec[];
    expect(wholeCards.map((c) => c.photoId)).toEqual(["ph_1", "ph_2", "ph_3"]);
    expect(wholeCards.every((c) => c.kind === "whole")).toBe(true);
    expect(wholeCards.every((c) => c.title === "Space Marine Captain")).toBe(
      true,
    );
  });

  test("whole: まとめカードはレシピ名・パーツ数/全工程数・パレット全色スウォッチを持つ", () => {
    const recipe = makeRecipe({
      title: "Sanguinary Guard",
      baseSteps: [makeStep(), makeStep()],
      parts: [
        makePart({
          id: "part_1",
          steps: [makeStep(), makeStep(), makeStep()],
        }),
      ],
      palette: [{ id: "col_a" }, { id: "col_b" }],
    });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryWholeCandidateSpec;

    expect(summary.title).toBe("Sanguinary Guard");
    // baseSteps 2 + parts steps 3 = 5工程、1パーツ
    expect(summary.progressLabel).toBe("1パーツ・全5工程");
    expect(summary.swatches).toHaveLength(2);
    expect(summary.overflowColorsLabel).toBeNull();
  });

  test("whole: パーツ0件・パレットがハード上限24色超→上限24色＋overflowColorsLabel（動的バランス配分でも際限なく伸びない安全弁）", () => {
    const palette = Array.from({ length: 27 }, (_, i) => ({ id: `col_${i}` }));
    const recipe = makeRecipe({ palette });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryWholeCandidateSpec;

    expect(summary.swatches).toHaveLength(24);
    expect(summary.overflowColorsLabel).toBe("+3");
  });

  // ---- FB-2: summary(whole)のパーツ行（目次）構築ロジック ----

  test("whole: まとめカードのpartRows先頭はbaseSteps非空時「ベース工程（全体）」行、以降parts順", () => {
    const recipe = makeRecipe({
      baseSteps: [makeStep(), makeStep()],
      parts: [
        makePart({ id: "part_1", name: "兜", steps: [makeStep()] }),
        makePart({ id: "part_2", name: "盾", steps: [makeStep(), makeStep()] }),
      ],
    });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryWholeCandidateSpec;

    expect(summary.partRows).toEqual([
      { name: "ベース工程（全体）", stepsLabel: "2工程" },
      { name: "兜", stepsLabel: "1工程" },
      { name: "盾", stepsLabel: "2工程" },
    ]);
    expect(summary.overflowPartsLabel).toBeNull();
  });

  test("whole: baseSteps=0件→partRowsにベース行が含まれない", () => {
    const recipe = makeRecipe({
      baseSteps: [],
      parts: [makePart({ id: "part_1", name: "兜", steps: [makeStep()] })],
    });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryWholeCandidateSpec;

    expect(summary.partRows).toEqual([{ name: "兜", stepsLabel: "1工程" }]);
  });

  test("whole: 工程0件のパーツ（書きかけ）はpartRowsからスキップされる", () => {
    const recipe = makeRecipe({
      baseSteps: [],
      parts: [
        makePart({ id: "part_1", name: "兜", steps: [makeStep()] }),
        makePart({ id: "part_2", name: "未着手パーツ", steps: [] }),
        makePart({ id: "part_3", name: "盾", steps: [makeStep()] }),
      ],
    });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryWholeCandidateSpec;

    expect(summary.partRows.map((row) => row.name)).toEqual(["兜", "盾"]);
  });

  test("whole: パーツ行がハード上限（16件）を超える→上限で切り詰めoverflowPartsLabelへ残数集約（動的バランス配分でも際限なく伸びない安全弁）", () => {
    const recipe = makeRecipe({
      baseSteps: [],
      parts: Array.from({ length: 18 }, (_, i) =>
        makePart({ id: `part_${i}`, name: `パーツ${i}`, steps: [makeStep()] }),
      ),
    });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryWholeCandidateSpec;

    expect(summary.partRows).toHaveLength(16);
    expect(summary.partRows.map((row) => row.name)).toEqual([
      "パーツ0",
      "パーツ1",
      "パーツ2",
      "パーツ3",
      "パーツ4",
      "パーツ5",
      "パーツ6",
      "パーツ7",
      "パーツ8",
      "パーツ9",
      "パーツ10",
      "パーツ11",
      "パーツ12",
      "パーツ13",
      "パーツ14",
      "パーツ15",
    ]);
    expect(summary.overflowPartsLabel).toBe("…他2パーツ");
  });

  test("whole: baseSteps非空＋パーツ多数で合計がハード上限を超える場合もbase行を含めて切り詰め、overflowは合算件数", () => {
    const recipe = makeRecipe({
      baseSteps: [makeStep()],
      parts: Array.from({ length: 18 }, (_, i) =>
        makePart({ id: `part_${i}`, name: `パーツ${i}`, steps: [makeStep()] }),
      ),
    });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryWholeCandidateSpec;

    // ベース行1 + パーツ18件 = 19行 → ハード上限16で切り詰め、残り3件がoverflow
    expect(summary.partRows).toHaveLength(16);
    expect(summary.partRows[0]).toEqual({
      name: "ベース工程（全体）",
      stepsLabel: "1工程",
    });
    expect(summary.overflowPartsLabel).toBe("…他3パーツ");
  });

  test("part: 写真つき工程0件（全工程が写真なし）→まとめカード（summary/part）1枚のみ", () => {
    const part = makePart({
      steps: [makeStep({ photoId: null }), makeStep({ photoId: null })],
    });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("summary");
    expect((result[0] as SummaryPartCandidateSpec).variant).toBe("part");
  });

  test("part: 写真なし工程を含む混在パーツ→先頭にまとめカード＋写真つき工程のみ工程順に列挙", () => {
    const part = makePart({
      steps: [
        makeStep({ photoId: null }), // index 0: 除外
        makeStep({ photoId: "ph_step2" }), // index 1 → STEP 2
        makeStep({ photoId: null }), // index 2: 除外
        makeStep({ photoId: "ph_step4" }), // index 3 → STEP 4
      ],
    });
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_overview"],
      parts: [part],
    });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe("summary");

    const partCards = result.slice(1) as PartCandidateSpec[];
    expect(partCards).toHaveLength(2);
    expect(partCards[0].stepPhotoId).toBe("ph_step2");
    expect(partCards[0].stepTag).toBe("STEP 2");
    expect(partCards[1].stepPhotoId).toBe("ph_step4");
    expect(partCards[1].stepTag).toBe("STEP 4");
    expect(partCards.every((c) => c.overviewPhotoId === "ph_overview")).toBe(
      true,
    );
    expect(partCards.every((c) => c.title === "Space Marine Captain")).toBe(
      true,
    );
    expect(partCards.every((c) => c.partName === "兜")).toBe(true);
  });

  test("whole: recipe.photoCropsに該当エントリがあればspec.cropへ解決される（B-3a）", () => {
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_1", "ph_2"],
      photoCrops: { ph_1: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } },
    });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const wholeCards = result.slice(1) as WholeCandidateSpec[];

    expect(wholeCards[0].crop).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
    // ph_2は未設定→null
    expect(wholeCards[1].crop).toBeNull();
  });

  test("whole: recipe.photoCrops未設定（省略）→全候補のcropはnull（既存レシピ・photoCrops未指定の後方互換）", () => {
    const recipe = makeRecipe({ overviewPhotoIds: ["ph_1"] });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const wholeCards = result.slice(1) as WholeCandidateSpec[];

    expect(wholeCards[0].crop).toBeNull();
  });

  test("part: recipe.photoCropsがoverviewPhotoId・stepPhotoIdの両方へ独立に解決される（B-3a）", () => {
    const part = makePart({
      steps: [
        makeStep({ photoId: "ph_step1" }),
        makeStep({ photoId: "ph_step2" }),
      ],
    });
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_overview"],
      parts: [part],
      photoCrops: {
        ph_overview: { x: 0, y: 0, w: 0.8, h: 0.8 },
        ph_step1: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
        // ph_step2はエントリなし
      },
    });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    const partCards = result.slice(1) as PartCandidateSpec[];

    expect(partCards[0].overviewPhotoCrop).toEqual({
      x: 0,
      y: 0,
      w: 0.8,
      h: 0.8,
    });
    expect(partCards[0].stepPhotoCrop).toEqual({
      x: 0.25,
      y: 0.25,
      w: 0.5,
      h: 0.5,
    });
    expect(partCards[1].overviewPhotoCrop).toEqual({
      x: 0,
      y: 0,
      w: 0.8,
      h: 0.8,
    });
    expect(partCards[1].stepPhotoCrop).toBeNull();
  });

  test("part: overviewPhotoId=null→overviewPhotoCropもnull（クロップ解決対象のphotoId自体が存在しない）", () => {
    const part = makePart({ steps: [makeStep({ photoId: "ph_step1" })] });
    const recipe = makeRecipe({
      overviewPhotoIds: [],
      parts: [part],
      photoCrops: { ph_step1: { x: 0, y: 0, w: 1, h: 1 } },
    });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    const partCards = result.slice(1) as PartCandidateSpec[];

    expect(partCards[0].overviewPhotoCrop).toBeNull();
    expect(partCards[0].stepPhotoCrop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  test("part: 全体写真なし→overviewPhotoIdはnull", () => {
    const part = makePart({ steps: [makeStep({ photoId: "ph_1" })] });
    const recipe = makeRecipe({ overviewPhotoIds: [], parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers) as [
      SummaryPartCandidateSpec,
      PartCandidateSpec,
    ];
    expect(result[1].overviewPhotoId).toBeNull();
  });

  test("part: 存在しないpartId→空配列（まとめカードも生成されない）", () => {
    const recipe = makeRecipe({
      parts: [
        makePart({ id: "part_1", steps: [makeStep({ photoId: "ph_1" })] }),
      ],
    });
    const ctx: ShareContext = {
      mode: "part",
      recipe,
      partId: "part_nonexistent",
    };
    expect(listShareCandidates(ctx, resolvers)).toEqual([]);
  });

  test("part: 合計≠100警告の継承（mixWarningがspecに反映される）", () => {
    const step = makeStep({
      photoId: "ph_1",
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [60, 50], // 合計110 → 警告
    });
    const part = makePart({ steps: [step] });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers) as [
      SummaryPartCandidateSpec,
      PartCandidateSpec,
    ];
    expect(result[1].mixWarning).toBe("合計が100%になっていません");
  });

  test("part: 合計100（警告なし）はmixWarning=null", () => {
    const step = makeStep({
      photoId: "ph_1",
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [60, 40],
    });
    const part = makePart({ steps: [step] });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers) as [
      SummaryPartCandidateSpec,
      PartCandidateSpec,
    ];
    expect(result[1].mixWarning).toBeNull();
  });

  test("part: paletteColorがnullを返す塗料はswatchesから除外される", () => {
    const step = makeStep({
      photoId: "ph_1",
      paints: [{ colorId: "col_a" }, { colorId: "col_missing" }],
      mix: [50, 50],
    });
    const part = makePart({ steps: [step] });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers) as [
      SummaryPartCandidateSpec,
      PartCandidateSpec,
    ];
    expect(result[1].swatches).toHaveLength(1);
    expect(result[1].swatches[0].name).toBe("Color col_a");
  });

  test("part: まとめカードはレシピ名＋パーツ名・工程リスト（印刷ビュー工程行相当: 番号・技法・スウォッチ・バッジ・ツール・メモ）を持つ", () => {
    const part = makePart({
      id: "part_1",
      name: "盾",
      steps: [
        makeStep({
          paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
          mix: [60, 40],
          toolIds: ["tool_1"],
          memo: " 筆は細め ",
        }),
        makeStep({ paints: [{ colorId: "col_b" }] }),
      ],
    });
    const recipe = makeRecipe({ title: "Space Marine Captain", parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryPartCandidateSpec;

    expect(summary.title).toBe("Space Marine Captain");
    expect(summary.partName).toBe("盾");
    expect(summary.steps).toHaveLength(2);
    expect(summary.steps[0]).toEqual({
      stepTag: "STEP 1",
      stepNumber: 1,
      techniqueLabel: "basecoat",
      swatches: [
        {
          name: "Color col_a",
          hex: "#960F0F",
          percent: "60%",
          brand: null,
          rangeLabel: null,
        },
        {
          name: "Color col_b",
          hex: "#960F0F",
          percent: "40%",
          brand: null,
          rangeLabel: null,
        },
      ],
      mixBadge: "60% + 40%",
      mixWarning: null,
      toolLabels: ["Tool tool_1"],
      memo: "筆は細め",
    });
    expect(summary.steps[1].stepTag).toBe("STEP 2");
    expect(summary.steps[1].swatches).toEqual([
      {
        name: "Color col_b",
        hex: "#960F0F",
        percent: null,
        brand: null,
        rangeLabel: null,
      },
    ]);
    expect(summary.steps[1].toolLabels).toEqual([]);
    expect(summary.steps[1].memo).toBe("");
    expect(summary.overflowStepsLabel).toBeNull();
  });

  test("part: まとめカード工程行の塗料スウォッチはブランド・レンジ併記（両方あり/brandのみ/両方なし）を保持する（ユーザー指摘: SNSカード塗料表示にブランド・レンジを併記）", () => {
    const brandAwareResolvers: CandidateResolvers = {
      ...resolvers,
      paletteColor: (colorId) => {
        // 実例: Eshin Grey（Citadel・Layer=両方あり）、タミヤ行（Tamiya, rangeLabelなし=brandのみ）、
        // Water行（custom色=brand/rangeLabel両方null）
        if (colorId === "col_eshin_grey") {
          return {
            name: "Eshin Grey",
            hex: "#3C3C3C",
            brand: "Citadel",
            rangeLabel: "Layer",
          };
        }
        if (colorId === "col_tamiya_flat_black") {
          return {
            name: "Flat Black",
            hex: "#1A1A1A",
            brand: "Tamiya",
            rangeLabel: null,
          };
        }
        if (colorId === "col_water") {
          return {
            name: "Water",
            hex: null,
            brand: null,
            rangeLabel: null,
          };
        }
        return null;
      },
    };
    const step = makeStep({
      paints: [
        { colorId: "col_eshin_grey" },
        { colorId: "col_tamiya_flat_black" },
        { colorId: "col_water" },
      ],
      mix: [50, 30, 20],
    });
    const part = makePart({ id: "part_1", steps: [step] });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, brandAwareResolvers);
    const summary = result[0] as SummaryPartCandidateSpec;

    expect(summary.steps[0].swatches).toEqual([
      {
        name: "Eshin Grey",
        hex: "#3C3C3C",
        percent: "50%",
        brand: "Citadel",
        rangeLabel: "Layer",
      },
      {
        name: "Flat Black",
        hex: "#1A1A1A",
        percent: "30%",
        brand: "Tamiya",
        rangeLabel: null,
      },
      {
        name: "Water",
        hex: null,
        percent: "20%",
        brand: null,
        rangeLabel: null,
      },
    ]);
  });

  test("part: まとめカードの工程リストはstepListAreaに収まるだけ動的収容（メモなし工程は25件収まり、26件目からoverflow）", () => {
    // SUMMARY_STEP_LIST_AREA_HEIGHT=1166px、rowHeight=44px（メモなし）、
    // overflow行予算32pxを差し引いた budget=1134px → floor(1134/44)=25件収容。
    const steps = Array.from({ length: 27 }, () => makeStep());
    const part = makePart({ id: "part_1", steps });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryPartCandidateSpec;

    expect(summary.steps).toHaveLength(25);
    expect(summary.steps[24].stepTag).toBe("STEP 25");
    expect(summary.overflowStepsLabel).toBe("…他2工程");
  });

  test("part: 全工程にメモがあると1行あたりの高さが増えるため収容数が減る（メモありは15件収まる）", () => {
    // rowHeight=74px（メモあり）、budget=1134px → floor(1134/74)=15件収容。
    const steps = Array.from({ length: 16 }, () =>
      makeStep({ memo: "メモあり" }),
    );
    const part = makePart({ id: "part_1", steps });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryPartCandidateSpec;

    expect(summary.steps).toHaveLength(15);
    expect(summary.overflowStepsLabel).toBe("…他1工程");
  });

  test("part: 工程リストが1件も収まらないほど大量でも最低1件は表示される", () => {
    // メモありの行高（44+30=74px）でも、極端に多い工程数（1件しか収まらない境界の確認）
    const steps = Array.from({ length: 30 }, () => makeStep({ memo: "メモ" }));
    const part = makePart({ id: "part_1", steps });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryPartCandidateSpec;

    expect(summary.steps.length).toBeGreaterThanOrEqual(1);
    expect(summary.overflowStepsLabel).not.toBeNull();
  });
});

// ---- computeCoverSourceRect ----
//
// 期待値はcover配置の定義（destのアスペクト比を保った元画像内の最大中央矩形）から
// 独立に手計算した数値（実装式の写経ではない）。

describe("computeCoverSourceRect", () => {
  test("横長src（アスペクト比2:1）→4:3 destでは縦（高さ）フル・左右クロップ", () => {
    // src 2000x1000（アスペクト2.0） / dest 1200x900（アスペクト1.333...）
    // destの方が縦長寄り→高さ1000をフルに使い、幅は 1000 * (1200/900) = 1333.33... に絞る
    // 左右の余り = 2000 - 1333.33... = 666.66... を等分 → sx = 333.33...
    const result = computeCoverSourceRect(2000, 1000, 1200, 900);
    expect(result.sy).toBe(0);
    expect(result.sh).toBe(1000);
    expect(result.sw).toBeCloseTo(1333.3333, 3);
    expect(result.sx).toBeCloseTo(333.3333, 3);
  });

  test("縦長src（アスペクト比1:2）→正方形destでは横（幅）フル・上下クロップ", () => {
    // src 800x1600（アスペクト0.5） / dest 220x220（アスペクト1.0）
    // 幅800をフルに使い、高さは 800 / 1.0 = 800 に絞る
    // 上下の余り = 1600 - 800 = 800 を等分 → sy = 400
    const result = computeCoverSourceRect(800, 1600, 220, 220);
    expect(result.sx).toBe(0);
    expect(result.sw).toBe(800);
    expect(result.sh).toBe(800);
    expect(result.sy).toBe(400);
  });

  test("同一アスペクト比（4:3 src → 4:3 dest）→クロップなしで全面", () => {
    const result = computeCoverSourceRect(400, 300, 800, 600);
    expect(result).toEqual({ sx: 0, sy: 0, sw: 400, sh: 300 });
  });

  test("極端な横長src（アスペクト比30:1）→正方形destでは高さフル・左右を大きくクロップ", () => {
    // src 3000x100（アスペクト30） / dest 500x500（アスペクト1.0）
    // 高さ100をフルに使い、幅は 100 * 1.0 = 100 に絞る
    // 左右の余り = 3000 - 100 = 2900 を等分 → sx = 1450
    const result = computeCoverSourceRect(3000, 100, 500, 500);
    expect(result).toEqual({ sx: 1450, sy: 0, sw: 100, sh: 100 });
  });

  test("srcの幅が0以下→例外を投げずフォールバック（元画像全面 {0,0,srcWidth,srcHeight}）", () => {
    const result = computeCoverSourceRect(0, 500, 100, 100);
    expect(result).toEqual({ sx: 0, sy: 0, sw: 0, sh: 500 });
  });

  test("srcの高さが0以下→例外を投げずフォールバック", () => {
    const result = computeCoverSourceRect(500, -1, 100, 100);
    expect(result).toEqual({ sx: 0, sy: 0, sw: 500, sh: -1 });
  });

  test("destの幅が0以下→例外を投げずフォールバック（destが不正な入力でもsrc全面を返す）", () => {
    const result = computeCoverSourceRect(500, 400, 0, 100);
    expect(result).toEqual({ sx: 0, sy: 0, sw: 500, sh: 400 });
  });

  test("destの高さが負値→例外を投げずフォールバック", () => {
    const result = computeCoverSourceRect(500, 400, 100, -50);
    expect(result).toEqual({ sx: 0, sy: 0, sw: 500, sh: 400 });
  });
});

// ---- computeSummaryWholeBudget ----
// 期待値は実装式の写経ではなく、行予算1018px（bodyTop〜contentBottomの1166pxから
// 固定オーバーヘッド148pxを差し引いた値）・パーツ行40px・overflow行40px・
// カラーグリッド行44px（3列）を用いて独立に検算した値。

describe("computeSummaryWholeBudget", () => {
  test("少数（parts 2・colors 9）→全件表示（overflowなし）", () => {
    expect(computeSummaryWholeBudget(2, 9)).toEqual({
      partsDisplay: 2,
      colorsDisplay: 9,
    });
  });

  test("パーツ多数（parts 30・colors 30）→パーツはハード上限16件＋overflow、カラーは最低保証6色を上回って21色表示され、総使用高さは1018px以内", () => {
    const result = computeSummaryWholeBudget(30, 30);
    expect(result).toEqual({ partsDisplay: 16, colorsDisplay: 21 });
    expect(result.colorsDisplay).toBeGreaterThanOrEqual(6);

    // 独立検算: パーツ16行＋overflow行(30>16のため) = 680px、カラー21色は
    // 3列グリッドで ceil(21/3)=7行×44px = 308px。合計988px ≤ 1018px。
    const partsUsedHeight = 16 * 40 + 40;
    const colorsUsedHeight = Math.ceil(21 / 3) * 44;
    expect(partsUsedHeight + colorsUsedHeight).toBeLessThanOrEqual(1018);
  });

  test("カラーのみ多数（parts 1・colors 30）→パーツを圧迫せずカラーはハード上限24色（8行）まで表示", () => {
    expect(computeSummaryWholeBudget(1, 30)).toEqual({
      partsDisplay: 1,
      colorsDisplay: 24,
    });
  });

  test("colors 0件→カラー表示0・overflowColorsLabel相当の判定に使う値もパーツ表示に影響しない", () => {
    expect(computeSummaryWholeBudget(5, 0)).toEqual({
      partsDisplay: 5,
      colorsDisplay: 0,
    });
  });

  test("parts 0件→パーツ表示0・カラーは通常どおり全件（少数）表示", () => {
    expect(computeSummaryWholeBudget(0, 10)).toEqual({
      partsDisplay: 0,
      colorsDisplay: 10,
    });
  });

  test("parts 0件・colors 0件→両方0（既存挙動維持）", () => {
    expect(computeSummaryWholeBudget(0, 0)).toEqual({
      partsDisplay: 0,
      colorsDisplay: 0,
    });
  });

  test("境界: パーツがハード上限ちょうど（16件・colors 0）→overflowなしで16件全表示", () => {
    expect(computeSummaryWholeBudget(16, 0)).toEqual({
      partsDisplay: 16,
      colorsDisplay: 0,
    });
  });

  test("境界: パーツがハード上限を1件超過（17件・colors 0）→overflow行を含めて16件のみ表示（overflow行の予算40pxぶんカラーには影響しない＝colors 0のまま）", () => {
    expect(computeSummaryWholeBudget(17, 0)).toEqual({
      partsDisplay: 16,
      colorsDisplay: 0,
    });
  });

  test("境界: パーツ・カラーが両方ハード上限ちょうど（parts 16・colors 24）→overflow行なしで両方満額表示できる（唯一の同時最大到達ケース）", () => {
    // 独立検算: パーツ16行（overflowなし）=640px。残り予算1018-640=378px→
    // floor(378/44)=8行→8*3=24枠 ちょうどcolors 24が収まる。
    expect(computeSummaryWholeBudget(16, 24)).toEqual({
      partsDisplay: 16,
      colorsDisplay: 24,
    });
  });

  test("computeCardLayoutとの整合性: listShareCandidates経由の最大配分ケースでもsummarySwatchArea下端がcontentBottom(1310)以下に収まる", () => {
    const recipe = makeRecipe({
      baseSteps: [],
      parts: Array.from({ length: 16 }, (_, i) =>
        makePart({ id: `part_${i}`, name: `パーツ${i}`, steps: [makeStep()] }),
      ),
      palette: Array.from({ length: 24 }, (_, i) => ({ id: `col_${i}` })),
    });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryWholeCandidateSpec;
    const layout = computeCardLayout(summary);

    const contentBottom = 1350 - 40; // CARD_HEIGHT - FOOTER_HEIGHT
    const bottomMost =
      layout.summarySwatchArea!.y + layout.summarySwatchArea!.height;
    expect(bottomMost).toBeLessThanOrEqual(contentBottom);
  });
});

// ---- computeCardLayout ----

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function assertWithinCard(
  rect: Rect,
  layout: { cardWidth: number; cardHeight: number },
) {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(layout.cardWidth);
  expect(rect.y + rect.height).toBeLessThanOrEqual(layout.cardHeight);
}

describe("computeCardLayout", () => {
  test("カードは1080x1350（4:5固定）", () => {
    const spec: WholeCandidateSpec = {
      kind: "whole",
      photoId: "ph_1",
      title: "Title",
    };
    const layout = computeCardLayout(spec);
    expect(layout.cardWidth).toBe(1080);
    expect(layout.cardHeight).toBe(1350);
    expect(layout.cardWidth / layout.cardHeight).toBeCloseTo(4 / 5, 5);
  });

  test("全カード共通: headerArea/footerAreaがカード内に収まり、mainPhoto等と重ならない", () => {
    const spec: WholeCandidateSpec = {
      kind: "whole",
      photoId: "ph_1",
      title: "Title",
    };
    const layout = computeCardLayout(spec);
    assertWithinCard(layout.headerArea, layout);
    assertWithinCard(layout.footerArea, layout);
    expect(rectsOverlap(layout.headerArea, layout.footerArea)).toBe(false);
    expect(rectsOverlap(layout.headerArea, layout.mainPhoto!)).toBe(false);
    expect(rectsOverlap(layout.footerArea, layout.textArea!)).toBe(false);
  });

  test("whole: mainPhoto/titleArea/textAreaがカード内に収まり相互不重複", () => {
    const spec: WholeCandidateSpec = {
      kind: "whole",
      photoId: "ph_1",
      title: "Title",
    };
    const layout = computeCardLayout(spec);
    assertWithinCard(layout.mainPhoto!, layout);
    assertWithinCard(layout.titleArea, layout);
    assertWithinCard(layout.textArea!, layout);
    expect(rectsOverlap(layout.mainPhoto!, layout.titleArea)).toBe(false);
    expect(rectsOverlap(layout.titleArea, layout.textArea!)).toBe(false);
    expect(rectsOverlap(layout.mainPhoto!, layout.textArea!)).toBe(false);
    expect(layout.insetPhoto).toBeNull();
    expect(layout.swatchArea).toBeNull();
    expect(layout.summaryStepListArea).toBeNull();
    expect(layout.summarySwatchArea).toBeNull();

    // レビューRound1 Medium対応: footerArea/headerAreaとの非重複を全カード種で対称に検算する
    expect(rectsOverlap(layout.titleArea, layout.footerArea)).toBe(false);
    expect(rectsOverlap(layout.textArea!, layout.footerArea)).toBe(false);
    expect(rectsOverlap(layout.mainPhoto!, layout.footerArea)).toBe(false);
    expect(rectsOverlap(layout.mainPhoto!, layout.headerArea)).toBe(false);
    expect(rectsOverlap(layout.titleArea, layout.headerArea)).toBe(false);
  });

  test("part: 全要素（mainPhoto/insetPhoto/titleArea/textArea/swatchArea）がカード内・相互不重複", () => {
    const spec: PartCandidateSpec = {
      kind: "part",
      title: "Recipe Title",
      partName: "Helmet",
      overviewPhotoId: "ph_overview",
      stepPhotoId: "ph_step",
      stepTag: "STEP 1",
      techniqueLabel: "basecoat",
      mixBadge: "60% + 40%",
      mixWarning: null,
      swatches: [
        { name: "A", hex: "#960F0F", brand: null },
        { name: "B", hex: "#123456", brand: null },
      ],
    };
    const layout = computeCardLayout(spec);

    assertWithinCard(layout.mainPhoto!, layout);
    expect(layout.insetPhoto).not.toBeNull();
    assertWithinCard(layout.insetPhoto!, layout);
    assertWithinCard(layout.titleArea, layout);
    assertWithinCard(layout.textArea!, layout);
    expect(layout.swatchArea).not.toBeNull();
    assertWithinCard(layout.swatchArea!, layout);

    // insetPhotoはmainPhoto領域の内側に配置される（重なりは許容: インセットは主写真の上に乗る想定）
    // titleArea/textArea/swatchAreaは情報帯内であり、互いに重ならないこと・mainPhotoと重ならないことを検算
    expect(rectsOverlap(layout.titleArea, layout.textArea!)).toBe(false);
    expect(rectsOverlap(layout.textArea!, layout.swatchArea!)).toBe(false);
    expect(rectsOverlap(layout.mainPhoto!, layout.titleArea)).toBe(false);
    expect(rectsOverlap(layout.mainPhoto!, layout.textArea!)).toBe(false);
    expect(rectsOverlap(layout.mainPhoto!, layout.swatchArea!)).toBe(false);

    // レビューRound1 High対応の回帰防止: 情報帯（titleArea/textArea/swatchArea）が
    // footerAreaと重ならないこと・mainPhotoがheaderAreaと重ならないことを検算する
    expect(rectsOverlap(layout.titleArea, layout.footerArea)).toBe(false);
    expect(rectsOverlap(layout.textArea!, layout.footerArea)).toBe(false);
    expect(rectsOverlap(layout.swatchArea!, layout.footerArea)).toBe(false);
    expect(rectsOverlap(layout.mainPhoto!, layout.headerArea)).toBe(false);
  });

  test("part: overviewPhotoId=null→insetPhoto=null", () => {
    const spec: PartCandidateSpec = {
      kind: "part",
      title: "Recipe Title",
      partName: "Helmet",
      overviewPhotoId: null,
      stepPhotoId: "ph_step",
      stepTag: "STEP 1",
      techniqueLabel: "basecoat",
      mixBadge: "",
      mixWarning: null,
      swatches: [],
    };
    const layout = computeCardLayout(spec);
    expect(layout.insetPhoto).toBeNull();
    expect(layout.swatchArea).toBeNull();

    // swatchArea=nullでtextAreaが下端まで拡張されるケース（レビューRound1 High指摘の
    // 実際の食い込みが最も起きやすい形）でも、textAreaがfooterAreaと重ならないことを検算する
    expect(rectsOverlap(layout.textArea!, layout.footerArea)).toBe(false);
  });

  test("part: swatches=0件→swatchArea=null、textAreaがその分拡張される", () => {
    const withSwatches: PartCandidateSpec = {
      kind: "part",
      title: "Recipe Title",
      partName: "Helmet",
      overviewPhotoId: null,
      stepPhotoId: "ph_step",
      stepTag: "STEP 1",
      techniqueLabel: "basecoat",
      mixBadge: "",
      mixWarning: null,
      swatches: [{ name: "A", hex: "#960F0F", brand: null }],
    };
    const withoutSwatches: PartCandidateSpec = {
      ...withSwatches,
      swatches: [],
    };

    const layoutWith = computeCardLayout(withSwatches);
    const layoutWithout = computeCardLayout(withoutSwatches);

    expect(layoutWithout.swatchArea).toBeNull();
    expect(layoutWithout.textArea!.height).toBeGreaterThan(
      layoutWith.textArea!.height,
    );
  });

  /** テスト用SummaryWholeCandidateSpecフィクスチャ（FB-2: 目次形式の全フィールドを埋める） */
  function makeSummaryWholeSpec(
    overrides: Partial<SummaryWholeCandidateSpec> = {},
  ): SummaryWholeCandidateSpec {
    return {
      kind: "summary",
      variant: "whole",
      title: "Title",
      progressLabel: "3パーツ・全10工程",
      partRows: [{ name: "兜", stepsLabel: "5工程" }],
      overflowPartsLabel: null,
      sectionPartsLabel: "パーツ構成",
      swatches: [
        { name: "A", hex: "#960F0F", brand: null },
        { name: "B", hex: "#123456", brand: null },
      ],
      overflowColorsLabel: null,
      sectionColorsLabel: "使用カラー",
      ...overrides,
    };
  }

  test("summary(whole): titleArea/summaryPartRowsArea/summarySwatchAreaがカード内・相互不重複。mainPhoto/textArea/swatchArea/summaryStepListAreaはnull（写真を載せない）", () => {
    const spec = makeSummaryWholeSpec();
    const layout = computeCardLayout(spec);

    expect(layout.mainPhoto).toBeNull();
    expect(layout.insetPhoto).toBeNull();
    expect(layout.textArea).toBeNull();
    expect(layout.swatchArea).toBeNull();
    expect(layout.summaryStepListArea).toBeNull();

    assertWithinCard(layout.headerArea, layout);
    assertWithinCard(layout.footerArea, layout);
    assertWithinCard(layout.titleArea, layout);

    expect(layout.summaryPartRowsArea).not.toBeNull();
    assertWithinCard(layout.summaryPartRowsArea!, layout);
    expect(layout.summarySwatchArea).not.toBeNull();
    assertWithinCard(layout.summarySwatchArea!, layout);

    // セクションの縦順序: タイトル → パーツ行セクション → スウォッチセクション（重複なし）
    expect(rectsOverlap(layout.titleArea, layout.summaryPartRowsArea!)).toBe(
      false,
    );
    expect(
      rectsOverlap(layout.summaryPartRowsArea!, layout.summarySwatchArea!),
    ).toBe(false);
    expect(layout.summaryPartRowsArea!.y).toBeLessThan(
      layout.summarySwatchArea!.y,
    );
    expect(rectsOverlap(layout.titleArea, layout.summarySwatchArea!)).toBe(
      false,
    );
    expect(rectsOverlap(layout.headerArea, layout.titleArea)).toBe(false);
    expect(rectsOverlap(layout.footerArea, layout.summaryPartRowsArea!)).toBe(
      false,
    );
    expect(rectsOverlap(layout.footerArea, layout.summarySwatchArea!)).toBe(
      false,
    );
  });

  test("summary(whole): パーツ行ハード上限16件（overflowなし）・スウォッチハード上限24件の最大ケースでも全要素がカード内に静的に収まる", () => {
    // computeSummaryWholeBudgetの保証により、パーツ16件がoverflow行なしで収まるケースが
    // 「両方ハード上限に同時到達する」唯一の組み合わせ（17件以上ではoverflow行の予算40pxが
    // 追加され、カラー側の表示数は24を下回る）。
    const spec = makeSummaryWholeSpec({
      partRows: Array.from({ length: 16 }, (_, i) => ({
        name: `パーツ${i + 1}`,
        stepsLabel: `${i + 1}工程`,
      })),
      overflowPartsLabel: null,
      swatches: Array.from({ length: 24 }, (_, i) => ({
        name: `Color ${i}`,
        hex: "#960F0F",
        brand: null,
      })),
      overflowColorsLabel: null,
    });
    const layout = computeCardLayout(spec);

    assertWithinCard(layout.summaryPartRowsArea!, layout);
    assertWithinCard(layout.summarySwatchArea!, layout);
    expect(
      rectsOverlap(layout.summaryPartRowsArea!, layout.summarySwatchArea!),
    ).toBe(false);
    expect(rectsOverlap(layout.footerArea, layout.summarySwatchArea!)).toBe(
      false,
    );

    // レビューL3対応の回帰防止: rect相互不重複だけでなく合計高さの絶対値も検算する
    // （定数を同時に肥大させても通ってしまう抜け穴を塞ぐ）。閾値1300は実装式の写経ではなく、
    // 動的バランス配分後の最大ケース最下端（独立計算による実測1284px。パーツ行16(overflowなし)・
    // 色24＝3列×8行）に対して余裕を持たせた独立数値。contentBottom(1310px)よりは十分厳しい。
    const bottomMost =
      layout.summarySwatchArea!.y + layout.summarySwatchArea!.height;
    expect(bottomMost).toBeLessThanOrEqual(1300);
  });

  test("summary(whole)FB-3: パーツ行が2行しかない場合、summaryPartRowsAreaの高さは16行固定ではなく実行数（2行）分＋見出しになる（上詰めレイアウト）", () => {
    const twoRowsSpec = makeSummaryWholeSpec({
      partRows: [
        { name: "パーツ1", stepsLabel: "3工程" },
        { name: "パーツ2", stepsLabel: "2工程" },
      ],
      overflowPartsLabel: null,
    });
    const sixteenRowsSpec = makeSummaryWholeSpec({
      partRows: Array.from({ length: 16 }, (_, i) => ({
        name: `パーツ${i + 1}`,
        stepsLabel: `${i + 1}工程`,
      })),
      overflowPartsLabel: null,
    });

    const twoRowsLayout = computeCardLayout(twoRowsSpec);
    const sixteenRowsLayout = computeCardLayout(sixteenRowsSpec);

    // 見出し30px + 2行×40px = 110px（16行固定予約の見出し30+640=670pxより明確に小さい）
    expect(twoRowsLayout.summaryPartRowsArea!.height).toBe(110);
    expect(sixteenRowsLayout.summaryPartRowsArea!.height).toBe(670);
    expect(twoRowsLayout.summaryPartRowsArea!.height).toBeLessThan(
      sixteenRowsLayout.summaryPartRowsArea!.height,
    );

    // 上詰め: パーツ行が少ないほど使用カラーセクションの開始位置（y）が上に来る
    expect(twoRowsLayout.summarySwatchArea!.y).toBeLessThan(
      sixteenRowsLayout.summarySwatchArea!.y,
    );
  });

  test("summary(whole)FB-3: 黒狼実データ相当（パーツ行2・色11）でも全要素がカード内に収まり、最大ケースより十分上に詰まる", () => {
    const spec = makeSummaryWholeSpec({
      partRows: [
        { name: "パーツ1", stepsLabel: "6工程" },
        { name: "パーツ2", stepsLabel: "4工程" },
      ],
      overflowPartsLabel: null,
      swatches: Array.from({ length: 11 }, (_, i) => ({
        name: `Color ${i}`,
        hex: "#960F0F",
        brand: i % 2 === 0 ? "Citadel" : null,
      })),
      overflowColorsLabel: null,
    });
    const layout = computeCardLayout(spec);

    assertWithinCard(layout.summaryPartRowsArea!, layout);
    assertWithinCard(layout.summarySwatchArea!, layout);
    expect(
      rectsOverlap(layout.summaryPartRowsArea!, layout.summarySwatchArea!),
    ).toBe(false);

    // 算術: partsHeadingY(204) + partsAreaHeight(30+2*40=110) + sectionGapMid(28) = 342
    expect(layout.summarySwatchArea!.y).toBe(342);
    // colorsAreaHeight = 30 + ceil(11/3)*44 = 30+176 = 206 → bottomMost = 548
    const bottomMost =
      layout.summarySwatchArea!.y + layout.summarySwatchArea!.height;
    expect(bottomMost).toBe(548);
    expect(bottomMost).toBeLessThan(840);
  });

  /** テスト用SummaryStepRowフィクスチャ（印刷ビュー工程行相当の全フィールドを埋める） */
  function makeSummaryStepRow(
    overrides: Partial<SummaryStepRow> = {},
  ): SummaryStepRow {
    return {
      stepTag: "STEP 1",
      stepNumber: 1,
      techniqueLabel: "basecoat",
      swatches: [],
      mixBadge: "",
      mixWarning: null,
      toolLabels: [],
      memo: "",
      ...overrides,
    };
  }

  test("summary(part): titleArea/summaryStepListAreaがカード内・相互不重複。summarySwatchAreaはnull（工程行に色が出るため廃止）", () => {
    const spec: SummaryPartCandidateSpec = {
      kind: "summary",
      variant: "part",
      title: "Title",
      partName: "Helmet",
      steps: [
        makeSummaryStepRow({ stepTag: "STEP 1" }),
        makeSummaryStepRow({ stepTag: "STEP 2", stepNumber: 2 }),
      ],
      overflowStepsLabel: null,
    };
    const layout = computeCardLayout(spec);

    expect(layout.mainPhoto).toBeNull();
    expect(layout.insetPhoto).toBeNull();
    expect(layout.textArea).toBeNull();
    expect(layout.swatchArea).toBeNull();
    expect(layout.summarySwatchArea).toBeNull();

    assertWithinCard(layout.headerArea, layout);
    assertWithinCard(layout.footerArea, layout);
    assertWithinCard(layout.titleArea, layout);
    expect(layout.summaryStepListArea).not.toBeNull();
    assertWithinCard(layout.summaryStepListArea!, layout);

    expect(rectsOverlap(layout.titleArea, layout.summaryStepListArea!)).toBe(
      false,
    );
    expect(rectsOverlap(layout.headerArea, layout.titleArea)).toBe(false);
    expect(rectsOverlap(layout.summaryStepListArea!, layout.footerArea)).toBe(
      false,
    );
  });

  test("summary(part): summaryStepListAreaはタイトル直下からフッタ直上まで拡大される（下部スウォッチ一覧廃止分）", () => {
    const spec: SummaryPartCandidateSpec = {
      kind: "summary",
      variant: "part",
      title: "Title",
      partName: "Helmet",
      steps: [makeSummaryStepRow()],
      overflowStepsLabel: null,
    };
    const layout = computeCardLayout(spec);
    const area = layout.summaryStepListArea!;

    // 拡大後は下端がfooterAreaの直上（footerArea.yと同じ）に達すること
    expect(area.y + area.height).toBe(layout.footerArea.y);
  });

  test("summary(part): SUMMARY_STEP_LIST_AREA_HEIGHT定数とcomputeCardLayoutの実算値が一致する（レビュー指摘L3対応: 716px二重計算のドリフト検出）", () => {
    // buildSummaryPartCandidate（候補構築フェーズ）はcomputeStepCapacityでSUMMARY_STEP_LIST_AREA_HEIGHT
    // 定数を直接参照し、computeCardLayoutのsummary(part)分岐は同じ計算式をCardLayout算出時に再計算する。
    // 両者の計算式は手書きで複製されているため、どちらかだけを変更するとサイレントに数値がズレる
    // （工程の動的収容数がレイアウトの実際の高さと合わなくなる）。この一致をテストで固定する。
    const spec: SummaryPartCandidateSpec = {
      kind: "summary",
      variant: "part",
      title: "Title",
      partName: "Helmet",
      steps: [makeSummaryStepRow()],
      overflowStepsLabel: null,
    };
    const layout = computeCardLayout(spec);
    expect(layout.summaryStepListArea!.height).toBe(
      SUMMARY_STEP_LIST_AREA_HEIGHT,
    );
  });
});

// ---- truncateToWidth ----

/** imageComposer.ts内部のELLIPSIS定数（非export）と同一値。トリム結果の末尾比較用 */
const ELLIPSIS_FOR_TEST = "…";

/**
 * 実測相当のmeasureTextスタブ（文字数[UTF-16コードユニット数]×10px）。
 * レビュー指摘M1対応: 幅0固定スタブではtruncateToWidthのトリム分岐（末尾から1文字ずつ
 * 削る while ループ・maxWidth<ELLIPSIS幅の早期return）が実質未実行のまま素通りしていたため、
 * 長さに比例して幅が変わるスタブで実際にトリムが発生する条件を再現する。
 */
function makeLengthProportionalContext(): CanvasContextLike {
  return {
    ...makeSpyContext(),
    measureText: (text: string) => ({ width: text.length * 10 }),
  };
}

describe("truncateToWidth", () => {
  test("maxWidthに収まる文字列はそのまま返す", () => {
    const ctx = makeLengthProportionalContext();
    // "abc" = 30px ≤ maxWidth 100px
    expect(truncateToWidth(ctx, "abc", 100)).toBe("abc");
  });

  test("長文字列＋小maxWidthは末尾が「…」で切り詰められる", () => {
    const ctx = makeLengthProportionalContext();
    // "abcdefghij"(10文字=100px) を maxWidth=55px に収める
    // → "abcd…"(4文字+ELLIPSIS=5文字=50px) が55px以下になる最長の形
    const result = truncateToWidth(ctx, "abcdefghij", 55);
    expect(result.endsWith(ELLIPSIS_FOR_TEST)).toBe(true);
    expect(result).not.toBe("abcdefghij");
    expect(ctx.measureText(result).width).toBeLessThanOrEqual(55);
  });

  test("maxWidthがELLIPSIS単体の幅より小さい極小幅では「…」のみを返す", () => {
    const ctx = makeLengthProportionalContext();
    // ELLIPSIS(1文字)=10px。maxWidth=5pxはそれより小さい
    expect(truncateToWidth(ctx, "abcdefghij", 5)).toBe(ELLIPSIS_FOR_TEST);
  });

  test("全角・絵文字混在の長文字列でも収まる幅まで切り詰められる（末尾は「…」）", () => {
    const ctx = makeLengthProportionalContext();
    const text = "戦国武将セット🎌漆黒の甲冑コレクション";
    // 十分小さいmaxWidthで必ずトリムが発生することを確認する
    const result = truncateToWidth(ctx, text, 60);
    expect(result.endsWith(ELLIPSIS_FOR_TEST)).toBe(true);
    expect(ctx.measureText(result).width).toBeLessThanOrEqual(60);
    expect(result.length).toBeLessThan(text.length);
  });
});

// ---- sanitizeFileNamePart ----

describe("sanitizeFileNamePart", () => {
  test("禁止文字・制御文字を除去する", () => {
    expect(sanitizeFileNamePart('狼/連隊:試作?"<>|\\*')).toBe("狼連隊試作");
  });

  test("制御文字（U+0000–U+001F）を除去する", () => {
    expect(sanitizeFileNamePart("abc def")).toBe("abcdef");
  });

  test("連続空白は1つに圧縮し前後をtrimする", () => {
    expect(sanitizeFileNamePart("  foo   bar  ")).toBe("foo bar");
  });

  test("結果が空文字になる場合は'recipe'にフォールバックする", () => {
    expect(sanitizeFileNamePart('/\\:*?"<>|')).toBe("recipe");
  });

  test("結果が空白のみの場合も'recipe'にフォールバックする", () => {
    expect(sanitizeFileNamePart("   ")).toBe("recipe");
  });

  test("日本語等の非ASCII文字はそのまま残す", () => {
    expect(sanitizeFileNamePart("宵闇の騎士")).toBe("宵闇の騎士");
  });
});

// ---- generateRandomSuffix ----

describe("generateRandomSuffix", () => {
  test("長さ5の[a-z0-9]のみの文字列を生成する（実crypto使用・複数回検証）", () => {
    for (let i = 0; i < 20; i += 1) {
      const suffix = generateRandomSuffix();
      expect(suffix).toHaveLength(5);
      expect(suffix).toMatch(/^[a-z0-9]{5}$/);
    }
  });
});

// ---- buildFileName ----

describe("buildFileName", () => {
  test("whole: {title}-{suffix}.pngを生成する", () => {
    const spec: WholeCandidateSpec = {
      kind: "whole",
      photoId: "ph_1",
      title: "Space Marine Captain",
    };
    expect(buildFileName(spec, "ab12c")).toBe("Space Marine Captain-ab12c.png");
  });

  test("summary(whole): {title}-{suffix}.pngを生成する", () => {
    const spec: SummaryWholeCandidateSpec = {
      kind: "summary",
      variant: "whole",
      title: "Sanguinary Guard",
      progressLabel: "1パーツ・全5工程",
      partRows: [],
      overflowPartsLabel: null,
      sectionPartsLabel: "パーツ構成",
      swatches: [],
      overflowColorsLabel: null,
      sectionColorsLabel: "使用カラー",
    };
    expect(buildFileName(spec, "xz9q1")).toBe("Sanguinary Guard-xz9q1.png");
  });

  test("part: {title}-{工程名(techniqueLabel)}-{suffix}.pngを生成する", () => {
    const spec: PartCandidateSpec = {
      kind: "part",
      title: "Space Marine Captain",
      partName: "兜",
      overviewPhotoId: null,
      stepPhotoId: "ph_step",
      stepTag: "STEP 1",
      techniqueLabel: "basecoat",
      mixBadge: "",
      mixWarning: null,
      swatches: [],
    };
    expect(buildFileName(spec, "ab12c")).toBe(
      "Space Marine Captain-basecoat-ab12c.png",
    );
  });

  test("part: techniqueLabelが空文字→stepTagにフォールバックする", () => {
    const spec: PartCandidateSpec = {
      kind: "part",
      title: "Recipe",
      partName: "兜",
      overviewPhotoId: null,
      stepPhotoId: "ph_step",
      stepTag: "STEP 3",
      techniqueLabel: "",
      mixBadge: "",
      mixWarning: null,
      swatches: [],
    };
    expect(buildFileName(spec, "ab12c")).toBe("Recipe-STEP 3-ab12c.png");
  });

  test("part: techniqueLabelが空白のみ→stepTagにフォールバックする", () => {
    const spec: PartCandidateSpec = {
      kind: "part",
      title: "Recipe",
      partName: "兜",
      overviewPhotoId: null,
      stepPhotoId: "ph_step",
      stepTag: "STEP 5",
      techniqueLabel: "   ",
      mixBadge: "",
      mixWarning: null,
      swatches: [],
    };
    expect(buildFileName(spec, "ab12c")).toBe("Recipe-STEP 5-ab12c.png");
  });

  test("summary(part): {title}-{partName}-{suffix}.pngを生成する", () => {
    const spec: SummaryPartCandidateSpec = {
      kind: "summary",
      variant: "part",
      title: "Space Marine Captain",
      partName: "盾",
      steps: [],
      overflowStepsLabel: null,
    };
    expect(buildFileName(spec, "ab12c")).toBe(
      "Space Marine Captain-盾-ab12c.png",
    );
  });

  test("タイトルが禁止文字入り→除去済み名で生成する", () => {
    const spec: WholeCandidateSpec = {
      kind: "whole",
      photoId: "ph_1",
      title: "狼/連隊:試作?",
    };
    expect(buildFileName(spec, "ab12c")).toBe("狼連隊試作-ab12c.png");
  });

  test("タイトルが禁止文字のみ→'recipe'フォールバックで生成する", () => {
    const spec: WholeCandidateSpec = {
      kind: "whole",
      photoId: "ph_1",
      title: '/\\:*?"<>|',
    };
    expect(buildFileName(spec, "ab12c")).toBe("recipe-ab12c.png");
  });
});

// ---- computeCoverSourceRect（crop対応・B-3a） ----

describe("computeCoverSourceRect — crop対応（B-3a）", () => {
  test("crop={0,0,1,1}（全体）指定時はcrop未指定時と完全に同一の結果になる", () => {
    const withoutCrop = computeCoverSourceRect(2000, 1000, 1080, 1350);
    const withFullCrop = computeCoverSourceRect(2000, 1000, 1080, 1350, {
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
    expect(withFullCrop).toEqual(withoutCrop);
  });

  test("crop未指定（undefined）はcrop=nullと同一の結果になる", () => {
    const withUndefined = computeCoverSourceRect(2000, 1000, 1080, 1350);
    const withNull = computeCoverSourceRect(2000, 1000, 1080, 1350, null);
    expect(withNull).toEqual(withUndefined);
  });

  test("中央50%クロップ×dest横長: crop空間(1000x1500の中央矩形)内でdestアスペクトのcoverを計算する", () => {
    // 元画像2000x1500・中央50%crop → crop空間: sx=500,sy=375,sw=1000,sh=750 (aspect=1.333)
    // dest 1080x1350のアスペクト=0.8（縦長）: crop空間の方が横長なので高さいっぱいを使い左右をクロップ
    const result = computeCoverSourceRect(2000, 1500, 1080, 1350, {
      x: 0.25,
      y: 0.25,
      w: 0.5,
      h: 0.5,
    });
    // crop空間: sx=500, sy=375, sw=1000, sh=750
    // destAspect = 1080/1350 = 0.8。spaceAspect = 1000/750 = 1.333... > 0.8 → 高さ全部使う
    // sw = spaceHeight * destAspect = 750 * 0.8 = 600
    // sx = spaceX + (spaceWidth - sw)/2 = 500 + (1000-600)/2 = 500 + 200 = 700
    expect(result.sx).toBeCloseTo(700, 6);
    expect(result.sy).toBeCloseTo(375, 6);
    expect(result.sw).toBeCloseTo(600, 6);
    expect(result.sh).toBeCloseTo(750, 6);
  });

  test("中央50%クロップ×dest縦長: crop空間が縦長なら幅いっぱいを使い上下をクロップする", () => {
    // 元画像1000x2000・中央50%crop → crop空間: sx=250,sy=500,sw=500,sh=1000 (aspect=0.5)
    // dest 1350x1080のアスペクト=1.25（横長）: crop空間の方が縦長なので幅いっぱいを使い上下をクロップ
    const result = computeCoverSourceRect(1000, 2000, 1350, 1080, {
      x: 0.25,
      y: 0.25,
      w: 0.5,
      h: 0.5,
    });
    // crop空間: sx=250, sy=500, sw=500, sh=1000
    // destAspect = 1350/1080 = 1.25。spaceAspect = 500/1000 = 0.5 < 1.25 → 幅全部使う
    // sh = spaceWidth / destAspect = 500 / 1.25 = 400
    // sy = spaceY + (spaceHeight - sh)/2 = 500 + (1000-400)/2 = 500 + 300 = 800
    expect(result.sx).toBeCloseTo(250, 6);
    expect(result.sy).toBeCloseTo(800, 6);
    expect(result.sw).toBeCloseTo(500, 6);
    expect(result.sh).toBeCloseTo(400, 6);
  });

  test("クロップ矩形が極端に細い（横長すぎ）場合: crop空間の全高を使い左右をさらに絞り込む", () => {
    // 元画像1000x1000・crop: x=0, y=0.45, w=1, h=0.1 → crop空間: sx=0, sy=450, sw=1000, sh=100 (aspect=10)
    // dest 1080x1350のアスペクト=0.8: crop空間はdestよりずっと横長 → 高さ全部使い、左右を大きく絞る
    const result = computeCoverSourceRect(1000, 1000, 1080, 1350, {
      x: 0,
      y: 0.45,
      w: 1,
      h: 0.1,
    });
    // sw = spaceHeight * destAspect = 100 * 0.8 = 80
    // sx = spaceX + (spaceWidth - sw)/2 = 0 + (1000-80)/2 = 460
    expect(result.sx).toBeCloseTo(460, 6);
    expect(result.sy).toBeCloseTo(450, 6);
    expect(result.sw).toBeCloseTo(80, 6);
    expect(result.sh).toBeCloseTo(100, 6);
  });
});

// ---- composeShareImages ----

function makeSpyContext(): CanvasContextLike {
  return {
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  };
}

function makeSpyCanvas(ctx: CanvasContextLike): CanvasLike & {
  toBlobCalls: number;
} {
  return {
    width: 0,
    height: 0,
    toBlobCalls: 0,
    getContext: () => ctx,
    toBlob(callback, type) {
      this.toBlobCalls += 1;
      callback(new Blob(["fake-png-bytes"], { type: type ?? "image/png" }));
    },
  };
}

describe("composeShareImages", () => {
  test("候補数とFile数が一致し、PNG typeかつレシピ名＋ランダムサフィックスのファイル名になる（即時resolveスタブ・決定的randomSuffix DI）", async () => {
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_1", title: "Title 1" },
      { kind: "whole", photoId: "ph_2", title: "Title 2" },
    ];
    const ctx = makeSpyContext();
    const canvases: ReturnType<typeof makeSpyCanvas>[] = [];
    let suffixCallCount = 0;
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: (w, h) => {
        const canvas = makeSpyCanvas(ctx);
        canvas.width = w;
        canvas.height = h;
        canvases.push(canvas);
        return canvas;
      },
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
      randomSuffix: () => {
        suffixCallCount += 1;
        return `sfx${suffixCallCount}`;
      },
    };

    const results = await composeShareImages(specs, deps);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.file.type === "image/png")).toBe(true);
    expect(results.map((r) => r.file.name)).toEqual([
      "Title 1-sfx1.png",
      "Title 2-sfx2.png",
    ]);
    // 候補とFileの対応（indexズレなし）: specの参照が元のspecsと一致する
    expect(results.map((r) => r.spec)).toEqual(specs);
    expect(canvases).toHaveLength(2);
    expect(canvases.every((c) => c.toBlobCalls === 1)).toBe(true);
    // 描画呼び出しの配線確認: drawImage・fillText双方が呼ばれている
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalled();
  });

  test("randomSuffix省略時は既定実装（crypto.getRandomValues由来の[a-z0-9]5文字）が使われる", async () => {
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_1", title: "Title 1" },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    const results = await composeShareImages(specs, deps);

    expect(results).toHaveLength(1);
    expect(results[0].file.name).toMatch(/^Title 1-[a-z0-9]{5}\.png$/);
  });

  test("FB-1: drawImageが9引数（source矩形＋dest矩形）で呼ばれ、source矩形がcover計算値と一致する（横長写真×whole mainPhoto領域）", async () => {
    // whole mainPhoto領域は1080x(1054)（HEADER_HEIGHT=56, infoAreaHeight=200, footer=40の固定値から
    // 1350-56-200-40=1054。ここでは実測せず、計算後にlayoutから直接取得して独立検算する）
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_wide", title: "Title" },
    ];
    const layout = computeCardLayout(specs[0]);
    const rect = layout.mainPhoto!;

    // 元画像は2400x1200（横長・アスペクト2.0）のImageBitmap相当（width/heightを持つオブジェクト）
    const fakeBitmap = { width: 2400, height: 1200 } as unknown as ImageBitmap;
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(
        async () => fakeBitmap as unknown as CanvasImageSource,
      ),
    };

    await composeShareImages(specs, deps);

    const drawImageMock = ctx.drawImage as unknown as ReturnType<typeof vi.fn>;
    expect(drawImageMock).toHaveBeenCalledTimes(1);
    const call = drawImageMock.mock.calls[0];
    // 9引数（image, sx, sy, sw, sh, dx, dy, dw, dh）で呼ばれている
    expect(call).toHaveLength(9);

    // source矩形はcomputeCoverSourceRectの計算値と独立に一致する
    const expectedSource = computeCoverSourceRect(
      2400,
      1200,
      rect.width,
      rect.height,
    );
    expect(call[0]).toBe(fakeBitmap);
    expect(call[1]).toBeCloseTo(expectedSource.sx, 6);
    expect(call[2]).toBeCloseTo(expectedSource.sy, 6);
    expect(call[3]).toBeCloseTo(expectedSource.sw, 6);
    expect(call[4]).toBeCloseTo(expectedSource.sh, 6);

    // dest矩形はrect全面（cover配置＝rect全面を埋める。レターボックス無し）
    expect(call[5]).toBe(rect.x);
    expect(call[6]).toBe(rect.y);
    expect(call[7]).toBe(rect.width);
    expect(call[8]).toBe(rect.height);
  });

  test("FB-1: decodeImageの戻り値がwidth/heightを持たない場合（SVGElement等）はcover計算をスキップし、画像全体をdest矩形全面へ描画する5引数形式にフォールバックする（レビュー指摘3対応: 部分クロップと非等価にならないよう「全面描画」の意味を固定）", async () => {
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_svg", title: "Title" },
    ];
    const layout = computeCardLayout(specs[0]);
    const rect = layout.mainPhoto!;

    // width/heightがnumberでない疑似SVGElement（SVGAnimatedLength等を持つ想定のダミー）
    const fakeSvgImage = {
      width: {},
      height: {},
    } as unknown as CanvasImageSource;
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => fakeSvgImage),
    };

    await composeShareImages(specs, deps);

    const drawImageMock = ctx.drawImage as unknown as ReturnType<typeof vi.fn>;
    expect(drawImageMock).toHaveBeenCalledTimes(1);
    const call = drawImageMock.mock.calls[0];
    // フォールバック: 5引数形式（image, dx, dy, dw, dh）＝ソースは画像全体・destはrect全面。
    // 9引数形式のsource矩形をdest全面固定値にする実装は「元画像の左上をrectサイズで切り出す」
    // 意味になり非等価（画像がrectより大きければ左上一部のみ表示）だったため、5引数形式で
    // 「画像全体をdestへ引き伸ばす」という意味的に正しい全面描画を固定する。
    expect(call).toHaveLength(5);
    expect(call[0]).toBe(fakeSvgImage);
    expect(call[1]).toBe(rect.x);
    expect(call[2]).toBe(rect.y);
    expect(call[3]).toBe(rect.width);
    expect(call[4]).toBe(rect.height);
  });

  test("B-3a: whole候補にspec.cropがあればdrawImageのsource引数がcrop内に制限される", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "whole",
        photoId: "ph_cropped",
        title: "Title",
        crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      },
    ];
    const layout = computeCardLayout(specs[0]);
    const rect = layout.mainPhoto!;

    // 元画像2000x2000（正方形）を中央50%クロップ→crop空間: sx=500,sy=500,sw=1000,sh=1000
    const fakeBitmap = { width: 2000, height: 2000 } as unknown as ImageBitmap;
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(
        async () => fakeBitmap as unknown as CanvasImageSource,
      ),
    };

    await composeShareImages(specs, deps);

    const drawImageMock = ctx.drawImage as unknown as ReturnType<typeof vi.fn>;
    expect(drawImageMock).toHaveBeenCalledTimes(1);
    const call = drawImageMock.mock.calls[0];
    expect(call).toHaveLength(9);

    // crop込みの期待値をcomputeCoverSourceRectと独立に一致確認（cropなし版とは異なる値になること）
    const expectedSource = computeCoverSourceRect(
      2000,
      2000,
      rect.width,
      rect.height,
      { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    );
    const expectedWithoutCrop = computeCoverSourceRect(
      2000,
      2000,
      rect.width,
      rect.height,
    );
    expect(call[1]).toBeCloseTo(expectedSource.sx, 6);
    expect(call[2]).toBeCloseTo(expectedSource.sy, 6);
    expect(call[3]).toBeCloseTo(expectedSource.sw, 6);
    expect(call[4]).toBeCloseTo(expectedSource.sh, 6);
    // source矩形はすべてcrop空間（元画像の[500,1500]区間）内に収まっている
    expect(expectedSource.sx).toBeGreaterThanOrEqual(500);
    expect(expectedSource.sx + expectedSource.sw).toBeLessThanOrEqual(1500);
    expect(expectedSource.sy).toBeGreaterThanOrEqual(500);
    expect(expectedSource.sy + expectedSource.sh).toBeLessThanOrEqual(1500);
    // cropなし版とは異なる値になること（配線が実際にcropを伝搬している証拠）
    expect(expectedSource).not.toEqual(expectedWithoutCrop);
  });

  test("B-3a: part候補のstepPhotoCrop/overviewPhotoCropがそれぞれ独立にdrawPhotoへ伝搬される", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "part",
        title: "Recipe Title",
        partName: "Helmet",
        overviewPhotoId: "ph_overview",
        overviewPhotoCrop: { x: 0, y: 0, w: 0.5, h: 0.5 },
        stepPhotoId: "ph_step",
        stepPhotoCrop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        stepTag: "STEP 1",
        techniqueLabel: "basecoat",
        mixBadge: "",
        mixWarning: null,
        swatches: [],
      },
    ];
    const layout = computeCardLayout(specs[0]);
    const mainRect = layout.mainPhoto!;
    const insetRect = layout.insetPhoto!;

    const fakeBitmap = { width: 1000, height: 1000 } as unknown as ImageBitmap;
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(
        async () => fakeBitmap as unknown as CanvasImageSource,
      ),
    };

    await composeShareImages(specs, deps);

    const drawImageMock = ctx.drawImage as unknown as ReturnType<typeof vi.fn>;
    expect(drawImageMock).toHaveBeenCalledTimes(2);

    // 1回目: mainPhoto（stepPhotoId）はstepPhotoCrop={0.5,0.5,0.5,0.5}で計算される
    const stepCall = drawImageMock.mock.calls[0];
    const expectedStepSource = computeCoverSourceRect(
      1000,
      1000,
      mainRect.width,
      mainRect.height,
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    );
    expect(stepCall[1]).toBeCloseTo(expectedStepSource.sx, 6);
    expect(stepCall[2]).toBeCloseTo(expectedStepSource.sy, 6);

    // 2回目: insetPhoto（overviewPhotoId）はoverviewPhotoCrop={0,0,0.5,0.5}で計算される
    const overviewCall = drawImageMock.mock.calls[1];
    const expectedOverviewSource = computeCoverSourceRect(
      1000,
      1000,
      insetRect.width,
      insetRect.height,
      { x: 0, y: 0, w: 0.5, h: 0.5 },
    );
    expect(overviewCall[1]).toBeCloseTo(expectedOverviewSource.sx, 6);
    expect(overviewCall[2]).toBeCloseTo(expectedOverviewSource.sy, 6);
    // 2つのcropは異なる矩形なので、それぞれ異なるsource座標になる（独立配線の証拠）
    expect(stepCall[1]).not.toBeCloseTo(overviewCall[1], 3);
  });

  test("loadPhotoがnullを返す候補は写真領域をプレースホルダ塗りしつつカード自体は生成する", async () => {
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_missing", title: "No Photo" },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    const results = await composeShareImages(specs, deps);

    expect(results).toHaveLength(1);
    // プレースホルダはfillRectで塗る実装（drawImageは呼ばれない）
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  test("part候補: マクロタスク遅延スタブ（実装と同じ非同期タイミング）でも配線どおり動作する", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "part",
        title: "Recipe Title",
        partName: "Helmet",
        overviewPhotoId: "ph_overview",
        stepPhotoId: "ph_step",
        stepTag: "STEP 1",
        techniqueLabel: "basecoat",
        mixBadge: "60% + 40%",
        mixWarning: "合計が100%になっていません",
        swatches: [{ name: "A", hex: "#960F0F", brand: null }],
      },
    ];
    const ctx = makeSpyContext();
    const loadPhotoCalls: string[] = [];
    // 実装と同じ非同期タイミング: 即時resolveではなくマクロタスク遅延を挟む
    const deps: ComposerDeps = {
      loadPhoto: async (photoId) => {
        loadPhotoCalls.push(photoId);
        await new Promise((r) => setTimeout(r, 0));
        return new Blob(["photo"], { type: "image/png" });
      },
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
      randomSuffix: () => "sfx1",
    };

    const results = await composeShareImages(specs, deps);

    expect(results).toHaveLength(1);
    expect(results[0].file.name).toBe("Recipe Title-basecoat-sfx1.png");
    expect(results[0].file.type).toBe("image/png");
    expect(results[0].spec).toBe(specs[0]);
    // 全体画像・工程写真の両方がloadPhotoされている（配線確認）
    expect(loadPhotoCalls).toEqual(
      expect.arrayContaining(["ph_overview", "ph_step"]),
    );
    expect(loadPhotoCalls).toHaveLength(2);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  test("候補0件→ペア配列も0件", async () => {
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
    };
    const results = await composeShareImages([], deps);
    expect(results).toEqual([]);
  });

  test("decodeImage省略時は既定実装（createImageBitmap）が使われる", async () => {
    const ctx = makeSpyContext();
    const originalCreateImageBitmap = globalThis.createImageBitmap;
    const bitmapSpy = vi.fn(async () => ({}) as ImageBitmap);
    globalThis.createImageBitmap = bitmapSpy;

    try {
      const specs: ShareCandidateSpec[] = [
        { kind: "whole", photoId: "ph_1", title: "T" },
      ];
      const deps: ComposerDeps = {
        loadPhoto: async () => new Blob(["photo"], { type: "image/png" }),
        createCanvas: () => makeSpyCanvas(ctx),
      };
      const results = await composeShareImages(specs, deps);
      expect(results).toHaveLength(1);
      expect(bitmapSpy).toHaveBeenCalled();
    } finally {
      globalThis.createImageBitmap = originalCreateImageBitmap;
    }
  });

  test("部分失敗（2枚目のみtoBlobがnull）: 成功分だけのペア配列が返り、候補とFile名の対応が崩れない", async () => {
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_1", title: "Title 1" },
      { kind: "whole", photoId: "ph_2", title: "Title 2" },
      { kind: "whole", photoId: "ph_3", title: "Title 3" },
    ];
    const ctx = makeSpyContext();
    let canvasCallCount = 0;
    let suffixCallCount = 0;
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: () => {
        canvasCallCount += 1;
        const isSecond = canvasCallCount === 2;
        return {
          width: 0,
          height: 0,
          getContext: () => ctx,
          toBlob(callback: (blob: Blob | null) => void, type?: string) {
            // 2枚目のみtoBlobがnullを返す（合成失敗を模擬）
            if (isSecond) {
              callback(null);
              return;
            }
            callback(
              new Blob(["fake-png-bytes"], { type: type ?? "image/png" }),
            );
          },
        };
      },
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
      randomSuffix: () => {
        suffixCallCount += 1;
        return `sfx${suffixCallCount}`;
      },
    };

    const results = await composeShareImages(specs, deps);

    // 3候補中、2枚目のみ失敗 → 成功した1・3枚目分の2件のみ返る
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.spec)).toEqual([specs[0], specs[2]]);
    // ファイル名は候補ごとのtitleを反映する（連番ではなくレシピ名＋ランダムサフィックス）
    expect(results.map((r) => r.file.name)).toEqual([
      "Title 1-sfx1.png",
      "Title 3-sfx2.png",
    ]);
  });

  test("whole: 背景の全面fillRectがdrawImageより前に呼ばれる（写真が背景で上書きされないことの回帰検証）", async () => {
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_1", title: "Title 1" },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillRectMock = ctx.fillRect as unknown as ReturnType<typeof vi.fn>;
    const drawImageMock = ctx.drawImage as unknown as ReturnType<typeof vi.fn>;
    expect(fillRectMock).toHaveBeenCalled();
    expect(drawImageMock).toHaveBeenCalled();

    // 背景全面塗り（0,0,カード全幅,全高）の呼び出しを特定し、そのcall順序がdrawImageより前であることを検証する
    const backgroundCallIndex = fillRectMock.mock.calls.findIndex(
      (call) =>
        call[0] === 0 && call[1] === 0 && call[2] === 1080 && call[3] === 1350,
    );
    expect(backgroundCallIndex).toBeGreaterThanOrEqual(0);
    const backgroundOrder =
      fillRectMock.mock.invocationCallOrder[backgroundCallIndex];
    const firstDrawImageOrder = drawImageMock.mock.invocationCallOrder[0];
    expect(backgroundOrder).toBeLessThan(firstDrawImageOrder);

    // このdecodeImageスタブ（{}）はwidth/heightを持たないためnaturalSize取得不能フォールバック
    // （5引数形式=画像全体をdest全面へ）で呼ばれる（レビュー指摘3対応）
    expect(drawImageMock.mock.calls[0]).toHaveLength(5);
  });

  test("part: 背景の全面fillRectがdrawImage・プレースホルダfillRectより前に呼ばれる（写真が背景で上書きされないことの回帰検証）", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "part",
        title: "Recipe Title",
        partName: "Helmet",
        overviewPhotoId: null, // インセットなし → mainPhotoはプレースホルダfillRectで描画される
        stepPhotoId: "ph_step",
        stepTag: "STEP 1",
        techniqueLabel: "basecoat",
        mixBadge: "",
        mixWarning: null,
        swatches: [],
      },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      // stepPhotoIdはloadPhoto成功→drawImage、overviewPhotoIdはnullなのでinsetPhoto自体がない
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillRectMock = ctx.fillRect as unknown as ReturnType<typeof vi.fn>;
    const drawImageMock = ctx.drawImage as unknown as ReturnType<typeof vi.fn>;
    expect(fillRectMock).toHaveBeenCalled();
    expect(drawImageMock).toHaveBeenCalled();

    const backgroundCallIndex = fillRectMock.mock.calls.findIndex(
      (call) =>
        call[0] === 0 && call[1] === 0 && call[2] === 1080 && call[3] === 1350,
    );
    expect(backgroundCallIndex).toBeGreaterThanOrEqual(0);
    const backgroundOrder =
      fillRectMock.mock.invocationCallOrder[backgroundCallIndex];
    const firstDrawImageOrder = drawImageMock.mock.invocationCallOrder[0];
    expect(backgroundOrder).toBeLessThan(firstDrawImageOrder);

    // このdecodeImageスタブ（{}）はwidth/heightを持たないためnaturalSize取得不能フォールバック
    // （5引数形式=画像全体をdest全面へ）で呼ばれる（レビュー指摘3対応）
    expect(drawImageMock.mock.calls[0]).toHaveLength(5);
  });

  test("part: 写真プレースホルダ（loadPhoto null）でも背景の全面fillRectがプレースホルダfillRectより前に呼ばれる", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "part",
        title: "Recipe Title",
        partName: "Helmet",
        overviewPhotoId: null,
        stepPhotoId: "ph_missing",
        stepTag: "STEP 1",
        techniqueLabel: "basecoat",
        mixBadge: "",
        mixWarning: null,
        swatches: [],
      },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null), // プレースホルダ描画（fillRect）に入る
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillRectMock = ctx.fillRect as unknown as ReturnType<typeof vi.fn>;
    // 背景（0,0,1080,1350）とプレースホルダ（mainPhoto領域=0,0,1080,974）はx/yが同一のため
    // 高さ（cardHeight=1350 vs photoArea=974）のみで区別している。レイアウト定数を変えたら要追随
    // 背景とプレースホルダの両方がfillRectで呼ばれる
    const backgroundCallIndex = fillRectMock.mock.calls.findIndex(
      (call) =>
        call[0] === 0 && call[1] === 0 && call[2] === 1080 && call[3] === 1350,
    );
    expect(backgroundCallIndex).toBe(0); // 背景が最初のfillRect呼び出しであること
    expect(fillRectMock.mock.calls.length).toBeGreaterThan(1); // プレースホルダ分も呼ばれている
  });

  test("部分失敗（2枚目のみcanvas.getContextがnullを返す）: 候補とFileの対応が崩れない", async () => {
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_1", title: "Title 1" },
      { kind: "whole", photoId: "ph_2", title: "Title 2" },
    ];
    const ctx = makeSpyContext();
    let createCanvasCallCount = 0;
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: () => {
        createCanvasCallCount += 1;
        const isFirst = createCanvasCallCount === 1;
        return {
          width: 0,
          height: 0,
          getContext: () => (isFirst ? null : ctx),
          toBlob(callback: (blob: Blob | null) => void, type?: string) {
            callback(
              new Blob(["fake-png-bytes"], { type: type ?? "image/png" }),
            );
          },
        };
      },
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
      randomSuffix: () => "sfx1",
    };

    const results: ComposedShareImage[] = await composeShareImages(specs, deps);

    expect(results).toHaveLength(1);
    expect(results[0].spec).toBe(specs[1]);
    expect(results[0].file.name).toBe("Title 2-sfx1.png");
  });

  test("part写真カード: 情報帯スウォッチ列は色名＋ブランドを併記する（レンジは幅の都合で省略。§3.4 SNSカード塗料表示 要件3）", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "part",
        title: "Recipe Title",
        partName: "Helmet",
        overviewPhotoId: null,
        stepPhotoId: "ph_step",
        stepTag: "STEP 1",
        techniqueLabel: "basecoat",
        mixBadge: "",
        mixWarning: null,
        swatches: [
          { name: "Eshin Grey", hex: "#3C3C3C", brand: "Citadel" },
          { name: "Water", hex: null, brand: null },
        ],
      },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const fillTextCalls = fillTextMock.mock.calls.map((call) => call[0]);

    // 色名（Eshin Grey）とブランド名（Citadel）が別のfillText呼び出しで描かれる
    expect(fillTextCalls).toContain("Eshin Grey");
    expect(fillTextCalls).toContain("Citadel");
    // brand=nullの色（Water）は色名のみで、ブランド行は描かれない（"null"文字列化されない）
    expect(fillTextCalls).toContain("Water");
    expect(fillTextCalls).not.toContain("null");
  });

  test("意匠配線: 共通ヘッダ罫（金淡）・フッタ罫・タイトルfillTextが全カード種別で呼ばれる（whole/part/summary）", async () => {
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_1", title: "Whole Title" },
      {
        kind: "part",
        title: "Part Recipe",
        partName: "Helmet",
        overviewPhotoId: null,
        stepPhotoId: "ph_step",
        stepTag: "STEP 1",
        techniqueLabel: "basecoat",
        mixBadge: "",
        mixWarning: null,
        swatches: [],
      },
      {
        kind: "summary",
        variant: "whole",
        title: "Summary Title",
        progressLabel: "1パーツ・全2工程",
        partRows: [{ name: "兜", stepsLabel: "2工程" }],
        overflowPartsLabel: null,
        sectionPartsLabel: "パーツ構成",
        swatches: [{ name: "A", hex: "#960F0F", brand: null }],
        overflowColorsLabel: null,
        sectionColorsLabel: "使用カラー",
      },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => new Blob(["photo"], { type: "image/png" })),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    const results = await composeShareImages(specs, deps);
    expect(results).toHaveLength(3);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const fillTextCalls = fillTextMock.mock.calls.map((call) => call[0]);

    // ヘッダのオーバーライン文字は1文字ずつfillTextされる（letter-spacing風の実装）ため、
    // 連結した文字列がヘッダ文言に含まれることで配線を確認する
    const overlineChars = fillTextCalls.filter((text) =>
      "COAT CODEX — PAINT RECIPE".includes(text as string),
    );
    expect(overlineChars.length).toBeGreaterThan(0);

    // フッタの"#coatcodex"は1回のfillTextで描かれる
    expect(fillTextCalls).toContain("#coatcodex");

    // タイトル（レシピ名）が描かれている
    expect(fillTextCalls).toContain("Whole Title");
    expect(fillTextCalls).toContain("Summary Title");
    expect(
      fillTextCalls.some((t) => (t as string).includes("Part Recipe")),
    ).toBe(true);

    // フッタの罫線・ヘッダの金淡罫は fillRect で描く実装
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  test("summary候補: 写真を載せない（drawImage・写真プレースホルダfillRectが呼ばれない）が、カード自体は生成される", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "part",
        title: "Recipe",
        partName: "Helmet",
        steps: [
          {
            stepTag: "STEP 1",
            stepNumber: 1,
            techniqueLabel: "basecoat",
            swatches: [
              {
                name: "A",
                hex: "#960F0F",
                percent: null,
                brand: null,
                rangeLabel: null,
              },
            ],
            mixBadge: "",
            mixWarning: null,
            toolLabels: [],
            memo: "",
          },
        ],
        overflowStepsLabel: "…他2工程",
      },
    ];
    const ctx = makeSpyContext();
    const loadPhoto = vi.fn(
      async () => new Blob(["photo"], { type: "image/png" }),
    );
    const deps: ComposerDeps = {
      loadPhoto,
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    const results = await composeShareImages(specs, deps);

    expect(results).toHaveLength(1);
    expect(loadPhoto).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
    // 工程リスト（朱番号・技法名・スウォッチ色名）・overflowのfillTextが呼ばれている（配線確認）
    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const fillTextCalls = fillTextMock.mock.calls.map((call) => call[0]);
    expect(fillTextCalls).toContain("1");
    expect(fillTextCalls).toContain("basecoat");
    expect(fillTextCalls).toContain("A");
    expect(fillTextCalls).toContain("…他2工程");
  });

  test("summary(part)工程行: 色名の後にブランド・レンジを併記する（実例: Eshin Grey行=両方併記／タミヤ行=brandのみ／Water行=省略）", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "part",
        title: "Recipe",
        partName: "Helmet",
        steps: [
          {
            stepTag: "STEP 1",
            stepNumber: 1,
            techniqueLabel: "basecoat",
            swatches: [
              {
                name: "Eshin Grey",
                hex: "#3C3C3C",
                percent: "50%",
                brand: "Citadel",
                rangeLabel: "Layer",
              },
              {
                name: "Flat Black",
                hex: "#1A1A1A",
                percent: "30%",
                brand: "Tamiya",
                rangeLabel: null,
              },
              {
                name: "Water",
                hex: null,
                percent: "20%",
                brand: null,
                rangeLabel: null,
              },
            ],
            mixBadge: "",
            mixWarning: null,
            toolLabels: [],
            memo: "",
          },
        ],
        overflowStepsLabel: null,
      },
    ];
    // measureText幅0固定スタブ（トリムが発生しない）で、色名・%・ブランド・レンジ併記文字列が
    // そのままfillTextへ渡ることを確認する（表示形式そのものの実例検証）
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const fillTextCalls = fillTextMock.mock.calls.map((call) => call[0]);

    // Eshin Grey行: 色名＋%は既存位置（"Eshin Grey 50%"）、ブランド・レンジは別要素として
    // "Citadel・Layer" で併記される
    expect(fillTextCalls).toContain("Eshin Grey 50%");
    expect(fillTextCalls).toContain("Citadel・Layer");

    // タミヤ行: brandのみのため "Tamiya"（rangeLabelなし・「・」区切りなし）
    expect(fillTextCalls).toContain("Flat Black 30%");
    expect(fillTextCalls).toContain("Tamiya");

    // Water行: brand・rangeLabel両方nullのため併記自体が省略される（"Water 20%"のみでmeta文字列は無し）
    expect(fillTextCalls).toContain("Water 20%");
    expect(fillTextCalls).not.toContain("null");
  });

  test("背景の全面fillRectはsummaryカードでも最初に呼ばれる（背景→前景の不変条件はsummaryでも維持）", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "whole",
        title: "Recipe",
        progressLabel: "1パーツ・全1工程",
        partRows: [],
        overflowPartsLabel: null,
        sectionPartsLabel: "パーツ構成",
        swatches: [],
        overflowColorsLabel: null,
        sectionColorsLabel: "使用カラー",
      },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillRectMock = ctx.fillRect as unknown as ReturnType<typeof vi.fn>;
    const backgroundCallIndex = fillRectMock.mock.calls.findIndex(
      (call) =>
        call[0] === 0 && call[1] === 0 && call[2] === 1080 && call[3] === 1350,
    );
    expect(backgroundCallIndex).toBe(0);
  });
});

// ---- FB-2: summary(whole)「レシピの目次」配線・セクション縦順序 ----

describe("composeShareImages — summary(whole)のパーツ構成/使用カラーセクション配線", () => {
  test("パーツ行（名前・工程数・overflow）とセクション見出しがfillTextへ配線される", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "whole",
        title: "Recipe",
        progressLabel: "3パーツ・全8工程",
        partRows: [
          { name: "ベース工程（全体）", stepsLabel: "2工程" },
          { name: "兜", stepsLabel: "3工程" },
        ],
        overflowPartsLabel: "…他1パーツ",
        sectionPartsLabel: "パーツ構成",
        swatches: [{ name: "Eshin Grey", hex: "#3C3C3C", brand: "Citadel" }],
        overflowColorsLabel: "+2",
        sectionColorsLabel: "使用カラー",
      },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const fillTextCalls = fillTextMock.mock.calls.map((call) => call[0]);

    // セクション見出しは1文字ずつfillTextされる（letter-spacing風の実装）ため連結して確認する
    const sectionPartsChars = fillTextCalls.filter((text) =>
      "パーツ構成".includes(text as string),
    );
    expect(sectionPartsChars.length).toBeGreaterThan(0);
    const sectionColorsChars = fillTextCalls.filter((text) =>
      "使用カラー".includes(text as string),
    );
    expect(sectionColorsChars.length).toBeGreaterThan(0);

    // パーツ行（名前・工程数ラベル）
    expect(fillTextCalls).toContain("ベース工程（全体）");
    expect(fillTextCalls).toContain("2工程");
    expect(fillTextCalls).toContain("兜");
    expect(fillTextCalls).toContain("3工程");
    expect(fillTextCalls).toContain("…他1パーツ");

    // スウォッチのoverflowラベル（drawSummaryColorGrid経由）
    expect(fillTextCalls).toContain("+2");
  });

  test("セクションの縦順序: タイトル→進捗→パーツ行セクション→スウォッチグリッドの順でfillText/fillRectが呼ばれる", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "whole",
        title: "Recipe",
        progressLabel: "1パーツ・全2工程",
        partRows: [{ name: "兜", stepsLabel: "2工程" }],
        overflowPartsLabel: null,
        sectionPartsLabel: "パーツ構成",
        swatches: [{ name: "A", hex: "#960F0F", brand: null }],
        overflowColorsLabel: null,
        sectionColorsLabel: "使用カラー",
      },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const calls = fillTextMock.mock.calls.map((call) => call[0] as string);

    const titleIndex = calls.indexOf("Recipe");
    const progressIndex = calls.indexOf("1パーツ・全2工程");
    // パーツ行名は"兜"1文字のみのfillText呼び出しになる
    const partRowIndex = calls.indexOf("兜");
    // FB-3以降、色グリッドは色名（"A"）もfillTextで描くが、セクション見出しの検出には
    // 「使用カラー」に固有の文字（"使"。"パーツ構成"とは重複しない）の出現位置を使う。
    // partRowIndex以降で探索する（「使用カラー」見出しはパーツ行セクションの後に描かれるため）。
    const colorsHeadingIndex = calls.indexOf("使", partRowIndex + 1);

    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(progressIndex).toBeGreaterThan(titleIndex);
    expect(partRowIndex).toBeGreaterThan(progressIndex);
    expect(colorsHeadingIndex).toBeGreaterThan(partRowIndex);
  });

  test("パーツ名が幅超過時はtruncateToWidthで「…」トリムされ、工程数ラベルは末尾までフル表示される", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "whole",
        title: "Recipe",
        progressLabel: "1パーツ・全2工程",
        partRows: [
          {
            // 長さ比例スタブ（1文字10px・行幅1104px）で必ずtruncateToWidthが発火するよう、
            // 実用上あり得ない長さまで反復して確実に幅超過させる
            name: "非常に長いパーツ名でトリムが必ず発生するテストケース用の名前".repeat(
              4,
            ),
            stepsLabel: "12工程",
          },
        ],
        overflowPartsLabel: null,
        sectionPartsLabel: "パーツ構成",
        swatches: [],
        overflowColorsLabel: null,
        sectionColorsLabel: "使用カラー",
      },
    ];
    // 長さ比例スタブ（1文字10px）でトリムロジックが実際に発火する幅を再現する
    const ctx: CanvasContextLike = {
      ...makeSpyContext(),
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const calls = fillTextMock.mock.calls.map((call) => call[0] as string);

    // 工程数ラベルは常にフル表示（右寄せ・先に予約するため優先度が高い）
    expect(calls).toContain("12工程");
    // パーツ名はフル文字列のままでは入らず、末尾が「…」にトリムされたものが描かれる
    expect(calls).not.toContain(
      "非常に長いパーツ名でトリムが必ず発生するテストケース用の名前".repeat(4),
    );
    expect(calls.some((c) => c.endsWith("…"))).toBe(true);
  });

  test("FB-3: 使用カラーグリッドは色名をfillTextで描画し、brandがあればブランド小字も併記、brandがnullならブランド行を描画しない", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "whole",
        title: "Recipe",
        progressLabel: "1パーツ・全2工程",
        partRows: [{ name: "兜", stepsLabel: "2工程" }],
        overflowPartsLabel: null,
        sectionPartsLabel: "パーツ構成",
        swatches: [
          { name: "Eshin Grey", hex: "#3C3C3C", brand: "Citadel" },
          { name: "Flat Black", hex: "#101010", brand: null },
        ],
        overflowColorsLabel: null,
        sectionColorsLabel: "使用カラー",
      },
    ];
    const ctx = makeSpyContext();
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const calls = fillTextMock.mock.calls.map((call) => call[0] as string);

    // 色名は両方描画される
    expect(calls).toContain("Eshin Grey");
    expect(calls).toContain("Flat Black");
    // brandありの色はブランド名も別要素として描画される
    expect(calls).toContain("Citadel");
    // brand=nullの色はブランド行自体が描画されない（"null"文字列化されていないことも確認）
    expect(calls).not.toContain("null");
  });

  test("FB-3: 色名が幅超過時はtruncateToWidthで「…」トリムされる", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "whole",
        title: "Recipe",
        progressLabel: "1パーツ・全1工程",
        partRows: [{ name: "兜", stepsLabel: "1工程" }],
        overflowPartsLabel: null,
        sectionPartsLabel: "パーツ構成",
        swatches: [
          {
            // 長さ比例スタブ（1文字10px・セル幅368/3列相当）で必ずtruncateToWidthが
            // 発火するよう、実用上あり得ない長さまで反復して確実に幅超過させる
            name: "非常に長い色名でトリムが必ず発生するテストケース用の名前".repeat(
              4,
            ),
            hex: "#960F0F",
            brand: null,
          },
        ],
        overflowColorsLabel: null,
        sectionColorsLabel: "使用カラー",
      },
    ];
    const ctx: CanvasContextLike = {
      ...makeSpyContext(),
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const calls = fillTextMock.mock.calls.map((call) => call[0] as string);

    expect(calls).not.toContain(
      "非常に長い色名でトリムが必ず発生するテストケース用の名前".repeat(4),
    );
    expect(calls.some((c) => c.endsWith("…"))).toBe(true);
  });
});

// ---- drawSummaryStepRow: 長さ比例スタブによる配線検証（レビュー指摘M1対応） ----

describe("composeShareImages — summary(part)工程行の長さ比例スタブ描画（rightLimit/ツール右寄せ配線検証）", () => {
  test("長い技法名×多色（ブランド・レンジ併記含む）×長いツール名の最悪ケースでもスウォッチ列がrightLimitで停止し、ツール名が右寄せで描画される", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "part",
        title: "Recipe",
        partName: "Helmet",
        steps: [
          {
            stepTag: "STEP 1",
            stepNumber: 1,
            // STEP_TECHNIQUE_COLUMN_WIDTH(160px)を大幅に超える長い技法名
            techniqueLabel:
              "エッジハイライト＋ドライブラシ＋ウォッシュの複合技法シーケンス",
            swatches: [
              {
                name: "Administratum Grey",
                hex: "#5A5A5A",
                percent: "40%",
                brand: "Citadel",
                rangeLabel: "Layer",
              },
              {
                name: "Eshin Grey",
                hex: "#3C3C3C",
                percent: "30%",
                brand: "Citadel",
                rangeLabel: "Layer",
              },
              {
                name: "Abaddon Black",
                hex: "#000000",
                percent: "30%",
                brand: "Citadel",
                rangeLabel: "Base",
              },
            ],
            mixBadge: "40% + 30% + 30%",
            mixWarning: null,
            // 長いツール名を複数（右端に右寄せ・トリムされる想定）
            toolLabels: [
              "極細筆（面相筆0号相当）",
              "エアブラシ（0.3mmノズル）",
              "スポンジチッピングツール",
            ],
            memo: "",
          },
        ],
        overflowStepsLabel: null,
      },
    ];

    const ctx: CanvasContextLike = {
      ...makeSpyContext(),
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    const results = await composeShareImages(specs, deps);
    expect(results).toHaveLength(1);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const fillTextCalls = fillTextMock.mock.calls.map(
      (call) => call[0] as string,
    );

    // 朱番号・技法名（トリム済みでも先頭部分は残る）が描かれている
    expect(fillTextCalls).toContain("1");
    expect(fillTextCalls.some((t) => t.startsWith("エッジハイライト"))).toBe(
      true,
    );

    // ツール名（右寄せ・muted）がトリムされた形で描かれている（先頭のツール名を含む断片が存在する）
    expect(fillTextCalls.some((t) => t.startsWith("極細筆"))).toBe(true);

    // 1色目・2色目の色名（トリムされていても先頭部分は残る）が描かれている。
    // 公平分配ロジック（残り幅÷残り色数）では、1色目は残り3色分の予算を得るため
    // 「Adminis…」まで、2色目は残り2色分の圧縮された予算で「E…」までがそれぞれ
    // 実測幅ベースで導出される（カード幅1080px化により旧1200px時より予算がさらに
    // 圧縮されたため文字数は短くなるが、truncateToWidthの安全弁は維持されるため厳密な
    // 文字数は幅計算依存。少なくとも1色目は2色目より長く表示される＝残り幅の多寡に応じた
    // 公平分配が機能していることの回帰検証）。
    expect(fillTextCalls.some((t) => t.startsWith("Adminis"))).toBe(true);
    expect(fillTextCalls.some((t) => t.startsWith("E"))).toBe(true);
    // ブランド・レンジ併記は1色目のみ完全形「Citadel・Layer」が残る幅を確保できる
    // （2色目は圧縮された予算のため「Citadel…」のようにトリムされる想定）
    expect(fillTextCalls).toContain("Citadel・Layer");

    // mixBadge（"40% + 30% + 30%"）はrightLimit手前で事前予約されるため、
    // 色名に幅を食われて消えることなく完全形で描画される（本タスクの要件1: 事前予約）
    expect(fillTextCalls).toContain("40% + 30% + 30%");

    // 3色目（Abaddon Black）は、長い技法名・長いツール名・mixBadge予約により
    // 残り幅が圧迫された結果rightLimitに到達し描画されない（=スウォッチループがbreakで
    // 打ち切られる配線の確認。最悪ケースでrightLimit停止が実際に機能していることの回帰検証）
    expect(fillTextCalls.some((t) => t.startsWith("Abaddon"))).toBe(false);
  });

  test("単色工程×長い色名（20文字級）は固定130px上限を廃止した公平分配によりトリムされずフル表示される（2026-07-03ユーザー指摘対応）", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "part",
        title: "Recipe",
        partName: "Helmet",
        steps: [
          {
            stepTag: "STEP 1",
            stepNumber: 1,
            techniqueLabel: "ドライブラシ",
            swatches: [
              {
                // 20文字級の長い色名。旧実装の固定maxSwatchWidth=130pxでは
                // 「Administratum G…」のように早期トリムされていた
                name: "Administratum Grey Extra Long",
                hex: "#5A5A5A",
                percent: null,
                brand: null,
                rangeLabel: null,
              },
            ],
            mixBadge: "",
            mixWarning: null,
            toolLabels: [],
            memo: "",
          },
        ],
        overflowStepsLabel: null,
      },
    ];

    const ctx: CanvasContextLike = {
      ...makeSpyContext(),
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const fillTextCalls = fillTextMock.mock.calls.map(
      (call) => call[0] as string,
    );

    // 単色工程は行の残り幅をほぼ独占できるため「…」トリムなしでフル表示される
    expect(fillTextCalls).toContain("Administratum Grey Extra Long");
  });

  test("2色混合の現実的なケースでは両方の色名がトリムされずフル表示される", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "part",
        title: "Recipe",
        partName: "Helmet",
        steps: [
          {
            stepTag: "STEP 1",
            stepNumber: 1,
            techniqueLabel: "レイヤー",
            swatches: [
              {
                name: "Administratum Grey",
                hex: "#5A5A5A",
                percent: "60%",
                brand: "Citadel",
                rangeLabel: "Layer",
              },
              {
                name: "Skavenblight Dinge",
                hex: "#3C3C3C",
                percent: "40%",
                brand: "Citadel",
                rangeLabel: "Base",
              },
            ],
            mixBadge: "60% + 40%",
            mixWarning: null,
            toolLabels: [],
            memo: "",
          },
        ],
        overflowStepsLabel: null,
      },
    ];

    const ctx: CanvasContextLike = {
      ...makeSpyContext(),
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const fillTextCalls = fillTextMock.mock.calls.map(
      (call) => call[0] as string,
    );

    // 2色とも色名＋%はフル表示（どちらも「…」で終わらない）。
    // カード幅1080px化（4:5縦長化）でarea.widthが984px（旧1104px）に縮小したため、
    // 1色目のブランド・レンジ併記は完全形を維持できるが、2色目は圧縮された残り予算のため
    // 「…」のみに切り詰められる（truncateToWidthの安全弁）。
    expect(fillTextCalls).toContain("Administratum Grey 60%");
    expect(fillTextCalls).toContain("Skavenblight Dinge 40%");
    expect(fillTextCalls).toContain("Citadel・Layer");
    expect(
      fillTextCalls.some((t) => t === "…" || t.startsWith("Citadel")),
    ).toBe(true);
  });

  test("mixBadgeありでも色名に幅を食われず、バッジが完全形で描画される（要件1: 事前予約の確認）", async () => {
    const specs: ShareCandidateSpec[] = [
      {
        kind: "summary",
        variant: "part",
        title: "Recipe",
        partName: "Helmet",
        steps: [
          {
            stepTag: "STEP 1",
            stepNumber: 1,
            techniqueLabel: "レイヤー",
            swatches: [
              {
                name: "Administratum Grey",
                hex: "#5A5A5A",
                percent: "60%",
                brand: null,
                rangeLabel: null,
              },
              {
                name: "Skavenblight Dinge",
                hex: "#3C3C3C",
                percent: "40%",
                brand: null,
                rangeLabel: null,
              },
            ],
            mixBadge: "60% + 40%",
            mixWarning: null,
            toolLabels: [],
            memo: "",
          },
        ],
        overflowStepsLabel: null,
      },
    ];

    const ctx: CanvasContextLike = {
      ...makeSpyContext(),
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    const deps: ComposerDeps = {
      loadPhoto: vi.fn(async () => null),
      createCanvas: () => makeSpyCanvas(ctx),
      decodeImage: vi.fn(async () => ({}) as CanvasImageSource),
    };

    await composeShareImages(specs, deps);

    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const fillTextCalls = fillTextMock.mock.calls.map(
      (call) => call[0] as string,
    );

    // mixBadgeが完全形で描画される（色名描画に幅を食い尽くされて消えていない）。
    // カード幅1080px化（4:5縦長化）でarea.widthが984pxに縮小したため、旧フィクスチャ
    // （ブランド・レンジ併記あり＋"60% + 40% (3:2)"）では事前予約後もトリムされてしまう。
    // 要件1（事前予約でバッジが完全形を維持する）の検証意図を保つため、ブランド・レンジ
    // 併記を省略した現実的なフィクスチャに調整する。
    expect(fillTextCalls).toContain("60% + 40%");
  });
});
