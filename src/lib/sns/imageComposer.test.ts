import { describe, expect, test, vi } from "vitest";
import {
  buildFileName,
  composeShareImages,
  computeCardLayout,
  listShareCandidates,
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

  test("whole: まとめカードのパレットが12色超→上限12色＋overflowColorsLabel", () => {
    const palette = Array.from({ length: 15 }, (_, i) => ({ id: `col_${i}` }));
    const recipe = makeRecipe({ palette });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryWholeCandidateSpec;

    expect(summary.swatches).toHaveLength(12);
    expect(summary.overflowColorsLabel).toBe("+3");
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

  test("part: まとめカードの工程リストはstepListAreaに収まるだけ動的収容（メモなし工程は16件収まり、17件目からoverflow）", () => {
    const steps = Array.from({ length: 17 }, () => makeStep());
    const part = makePart({ id: "part_1", steps });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryPartCandidateSpec;

    expect(summary.steps).toHaveLength(15);
    expect(summary.steps[14].stepTag).toBe("STEP 15");
    expect(summary.overflowStepsLabel).toBe("…他2工程");
  });

  test("part: 全工程にメモがあると1行あたりの高さが増えるため収容数が減る（メモありは9件収まる）", () => {
    const steps = Array.from({ length: 12 }, () =>
      makeStep({ memo: "メモあり" }),
    );
    const part = makePart({ id: "part_1", steps });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryPartCandidateSpec;

    expect(summary.steps).toHaveLength(9);
    expect(summary.overflowStepsLabel).toBe("…他3工程");
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
  test("カードは1200x900（4:3固定）", () => {
    const spec: WholeCandidateSpec = {
      kind: "whole",
      photoId: "ph_1",
      title: "Title",
    };
    const layout = computeCardLayout(spec);
    expect(layout.cardWidth).toBe(1200);
    expect(layout.cardHeight).toBe(900);
    expect(layout.cardWidth / layout.cardHeight).toBeCloseTo(4 / 3, 5);
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

  test("summary(whole): titleArea/summarySwatchAreaがカード内・相互不重複。mainPhoto/textArea/swatchAreaはnull（写真を載せない）", () => {
    const spec: SummaryWholeCandidateSpec = {
      kind: "summary",
      variant: "whole",
      title: "Title",
      progressLabel: "3パーツ・全10工程",
      swatches: [
        { name: "A", hex: "#960F0F", brand: null },
        { name: "B", hex: "#123456", brand: null },
      ],
      overflowColorsLabel: null,
    };
    const layout = computeCardLayout(spec);

    expect(layout.mainPhoto).toBeNull();
    expect(layout.insetPhoto).toBeNull();
    expect(layout.textArea).toBeNull();
    expect(layout.swatchArea).toBeNull();
    expect(layout.summaryStepListArea).toBeNull();

    assertWithinCard(layout.headerArea, layout);
    assertWithinCard(layout.footerArea, layout);
    assertWithinCard(layout.titleArea, layout);
    expect(layout.summarySwatchArea).not.toBeNull();
    assertWithinCard(layout.summarySwatchArea!, layout);
    expect(rectsOverlap(layout.titleArea, layout.summarySwatchArea!)).toBe(
      false,
    );
    expect(rectsOverlap(layout.headerArea, layout.titleArea)).toBe(false);
    expect(rectsOverlap(layout.footerArea, layout.summarySwatchArea!)).toBe(
      false,
    );
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

// ---- buildFileName ----

describe("buildFileName", () => {
  test("1-based連番でファイル名を生成する", () => {
    expect(buildFileName(1)).toBe("coat-codex-share-1.png");
    expect(buildFileName(2)).toBe("coat-codex-share-2.png");
    expect(buildFileName(4)).toBe("coat-codex-share-4.png");
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
  test("候補数とFile数が一致し、PNG typeかつ連番ファイル名になる（即時resolveスタブ）", async () => {
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_1", title: "Title 1" },
      { kind: "whole", photoId: "ph_2", title: "Title 2" },
    ];
    const ctx = makeSpyContext();
    const canvases: ReturnType<typeof makeSpyCanvas>[] = [];
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
    };

    const results = await composeShareImages(specs, deps);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.file.type === "image/png")).toBe(true);
    expect(results.map((r) => r.file.name)).toEqual([
      "coat-codex-share-1.png",
      "coat-codex-share-2.png",
    ]);
    // 候補とFileの対応（indexズレなし）: specの参照が元のspecsと一致する
    expect(results.map((r) => r.spec)).toEqual(specs);
    expect(canvases).toHaveLength(2);
    expect(canvases.every((c) => c.toBlobCalls === 1)).toBe(true);
    // 描画呼び出しの配線確認: drawImage・fillText双方が呼ばれている
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalled();
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
    };

    const results = await composeShareImages(specs, deps);

    expect(results).toHaveLength(1);
    expect(results[0].file.name).toBe("coat-codex-share-1.png");
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

  test("部分失敗（2枚目のみtoBlobがnull）: 成功分だけのペア配列が返り、ファイル名連番に欠番がない", async () => {
    const specs: ShareCandidateSpec[] = [
      { kind: "whole", photoId: "ph_1", title: "Title 1" },
      { kind: "whole", photoId: "ph_2", title: "Title 2" },
      { kind: "whole", photoId: "ph_3", title: "Title 3" },
    ];
    const ctx = makeSpyContext();
    let canvasCallCount = 0;
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
    };

    const results = await composeShareImages(specs, deps);

    // 3候補中、2枚目のみ失敗 → 成功した1・3枚目分の2件のみ返る
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.spec)).toEqual([specs[0], specs[2]]);
    // ファイル名は「生成成功順に1から」＝欠番なし（-2.pngが3枚目に振られる）
    expect(results.map((r) => r.file.name)).toEqual([
      "coat-codex-share-1.png",
      "coat-codex-share-2.png",
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
        call[0] === 0 && call[1] === 0 && call[2] === 1200 && call[3] === 900,
    );
    expect(backgroundCallIndex).toBeGreaterThanOrEqual(0);
    const backgroundOrder =
      fillRectMock.mock.invocationCallOrder[backgroundCallIndex];
    const firstDrawImageOrder = drawImageMock.mock.invocationCallOrder[0];
    expect(backgroundOrder).toBeLessThan(firstDrawImageOrder);
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
        call[0] === 0 && call[1] === 0 && call[2] === 1200 && call[3] === 900,
    );
    expect(backgroundCallIndex).toBeGreaterThanOrEqual(0);
    const backgroundOrder =
      fillRectMock.mock.invocationCallOrder[backgroundCallIndex];
    const firstDrawImageOrder = drawImageMock.mock.invocationCallOrder[0];
    expect(backgroundOrder).toBeLessThan(firstDrawImageOrder);
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
    // 背景（0,0,1200,900）とプレースホルダ（mainPhoto領域=0,0,1200,640）はx/yが同一のため
    // 高さ（cardHeight=900 vs photoArea=640）のみで区別している。レイアウト定数を変えたら要追随
    // 背景とプレースホルダの両方がfillRectで呼ばれる
    const backgroundCallIndex = fillRectMock.mock.calls.findIndex(
      (call) =>
        call[0] === 0 && call[1] === 0 && call[2] === 1200 && call[3] === 900,
    );
    expect(backgroundCallIndex).toBe(0); // 背景が最初のfillRect呼び出しであること
    expect(fillRectMock.mock.calls.length).toBeGreaterThan(1); // プレースホルダ分も呼ばれている
  });

  test("部分失敗（2枚目のみcanvas.getContextがnullを返す）: 候補とFileの対応が崩れず欠番なし連番になる", async () => {
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
    };

    const results: ComposedShareImage[] = await composeShareImages(specs, deps);

    expect(results).toHaveLength(1);
    expect(results[0].spec).toBe(specs[1]);
    expect(results[0].file.name).toBe("coat-codex-share-1.png");
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
        swatches: [{ name: "A", hex: "#960F0F", brand: null }],
        overflowColorsLabel: null,
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

    // フッタの"#coat-codex"は1回のfillTextで描かれる
    expect(fillTextCalls).toContain("#coat-codex");

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
        swatches: [],
        overflowColorsLabel: null,
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
        call[0] === 0 && call[1] === 0 && call[2] === 1200 && call[3] === 900,
    );
    expect(backgroundCallIndex).toBe(0);
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
    // 「Administra…」まで、2色目は残り2色分の圧縮された予算で「Eshi…」までがそれぞれ
    // 実測幅ベースで導出される（truncateToWidthの安全弁は維持されるため厳密な文字数は
    // 幅計算依存だが、少なくとも1色目は2色目より長く表示される＝残り幅の多寡に応じた
    // 公平分配が機能していることの回帰検証）。
    expect(fillTextCalls.some((t) => t.startsWith("Administra"))).toBe(true);
    expect(fillTextCalls.some((t) => t.startsWith("Eshi"))).toBe(true);
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

    // 2色ともフル表示（どちらも「…」で終わらない）
    expect(fillTextCalls).toContain("Administratum Grey 60%");
    expect(fillTextCalls).toContain("Skavenblight Dinge 40%");
    expect(fillTextCalls).toContain("Citadel・Layer");
    expect(fillTextCalls).toContain("Citadel・Base");
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
            mixBadge: "60% + 40% (3:2)",
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

    // mixBadgeが完全形で描画される（色名描画に幅を食い尽くされて消えていない）
    expect(fillTextCalls).toContain("60% + 40% (3:2)");
  });
});
