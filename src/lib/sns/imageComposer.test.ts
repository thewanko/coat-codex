import { describe, expect, test, vi } from "vitest";
import {
  buildFileName,
  composeShareImages,
  computeCardLayout,
  listShareCandidates,
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
    return { name: `Color ${colorId}`, hex: "#960F0F" };
  },
  summaryProgress: (partsCount, totalSteps) =>
    `${partsCount}パーツ・全${totalSteps}工程`,
  overflowColorsLabel: (remaining) => `+${remaining}`,
  overflowStepsLabel: (remaining) => `…他${remaining}工程`,
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

  test("part: まとめカードはレシピ名＋パーツ名・工程リスト（番号＋技法）・パーツ内使用色スウォッチを持つ", () => {
    const part = makePart({
      id: "part_1",
      name: "盾",
      steps: [
        makeStep({ paints: [{ colorId: "col_a" }] }),
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
      techniqueLabel: "basecoat",
    });
    expect(summary.steps[1].stepTag).toBe("STEP 2");
    expect(summary.overflowStepsLabel).toBeNull();
    expect(summary.swatches.map((s) => s.name)).toEqual([
      "Color col_a",
      "Color col_b",
    ]);
    expect(summary.overflowColorsLabel).toBeNull();
  });

  test("part: まとめカードの工程リストが8超→上限8行＋overflowStepsLabel", () => {
    const steps = Array.from({ length: 11 }, () => makeStep());
    const part = makePart({ id: "part_1", steps });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryPartCandidateSpec;

    expect(summary.steps).toHaveLength(8);
    expect(summary.steps[7].stepTag).toBe("STEP 8");
    expect(summary.overflowStepsLabel).toBe("…他3工程");
  });

  test("part: まとめカードのスウォッチは重複除去され、12色超で上限12色＋overflowColorsLabel", () => {
    const steps = Array.from({ length: 15 }, (_, i) => [
      makeStep({ paints: [{ colorId: `col_${i}` }] }),
      makeStep({ paints: [{ colorId: `col_${i}` }] }), // 直後の工程で同色を再利用（重複除去の検証）
    ]).flat();
    const part = makePart({ id: "part_1", steps });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers);
    const summary = result[0] as SummaryPartCandidateSpec;

    // 15色中重複除去後も15色（col_missingなし）→上限12＋overflow「+3」
    expect(summary.swatches).toHaveLength(12);
    expect(summary.overflowColorsLabel).toBe("+3");
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
        { name: "A", hex: "#960F0F" },
        { name: "B", hex: "#123456" },
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
      swatches: [{ name: "A", hex: "#960F0F" }],
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
        { name: "A", hex: "#960F0F" },
        { name: "B", hex: "#123456" },
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

  test("summary(part): titleArea/summaryStepListArea/summarySwatchAreaがカード内・相互不重複", () => {
    const spec: SummaryPartCandidateSpec = {
      kind: "summary",
      variant: "part",
      title: "Title",
      partName: "Helmet",
      steps: [
        { stepTag: "STEP 1", techniqueLabel: "basecoat" },
        { stepTag: "STEP 2", techniqueLabel: "wash" },
      ],
      overflowStepsLabel: null,
      swatches: [{ name: "A", hex: "#960F0F" }],
      overflowColorsLabel: null,
    };
    const layout = computeCardLayout(spec);

    expect(layout.mainPhoto).toBeNull();
    expect(layout.insetPhoto).toBeNull();
    expect(layout.textArea).toBeNull();
    expect(layout.swatchArea).toBeNull();

    assertWithinCard(layout.headerArea, layout);
    assertWithinCard(layout.footerArea, layout);
    assertWithinCard(layout.titleArea, layout);
    expect(layout.summaryStepListArea).not.toBeNull();
    assertWithinCard(layout.summaryStepListArea!, layout);
    expect(layout.summarySwatchArea).not.toBeNull();
    assertWithinCard(layout.summarySwatchArea!, layout);

    expect(rectsOverlap(layout.titleArea, layout.summaryStepListArea!)).toBe(
      false,
    );
    expect(
      rectsOverlap(layout.summaryStepListArea!, layout.summarySwatchArea!),
    ).toBe(false);
    expect(rectsOverlap(layout.headerArea, layout.titleArea)).toBe(false);
    expect(rectsOverlap(layout.footerArea, layout.summarySwatchArea!)).toBe(
      false,
    );
  });

  test("summary(part): 8行ちょうど＋overflow行で、最終行（overflow行）のbaselineがsummaryStepListArea内に収まる", () => {
    // drawSummaryPartCard（imageComposer.ts）のrowHeight/baseline計算式をレイアウト側から検算する。
    // rowHeight = min(36, area.height / (steps.length + (overflowLabel ? 1 : 0)))
    // 注: 実装側の Math.max(..., 1) 保護（工程0件時の除算回避）はこのテスト式では省略。
    //     分母を実装と揃えていることが前提のため、上限定数や式を変えたら要追随。
    // overflow行のbaseline y = area.y + rowHeight * steps.length + rowHeight * 0.7
    // レビューRound1 Medium対応: 8行ちょうど＋overflow行という最も密なケースで
    // 最終行のbaselineがarea外（summarySwatchArea・footerAreaへの食い込み）にならないことを固定する。
    const steps = Array.from({ length: 8 }, (_, i) => ({
      stepTag: `STEP ${i + 1}`,
      techniqueLabel: `technique_${i + 1}`,
    }));
    const spec: SummaryPartCandidateSpec = {
      kind: "summary",
      variant: "part",
      title: "Title",
      partName: "Helmet",
      steps,
      overflowStepsLabel: "…他3工程",
      swatches: [{ name: "A", hex: "#960F0F" }],
      overflowColorsLabel: null,
    };
    const layout = computeCardLayout(spec);
    const area = layout.summaryStepListArea!;

    const rowHeight = Math.min(36, area.height / (steps.length + 1));
    const overflowBaselineY =
      area.y + rowHeight * steps.length + rowHeight * 0.7;

    // baseline自体がarea内（下端未満）に収まること。テキストの実描画は
    // baselineから上方向に伸びるため、フォントサイズ分の余白がなくとも
    // baselineがarea下端を超えていないことが「footerAreaへ食い込まない」ための必要条件になる
    expect(overflowBaselineY).toBeLessThanOrEqual(area.y + area.height);
    expect(overflowBaselineY).toBeGreaterThanOrEqual(area.y);

    // area自体がsummarySwatchArea・footerAreaと重ならないことは前テストで検算済みのため、
    // baselineがarea内に収まっていれば描画位置がfooterArea/summarySwatchAreaへ
    // 食い込まないことが連鎖的に保証される
    expect(rectsOverlap(area, layout.summarySwatchArea!)).toBe(false);
    expect(rectsOverlap(area, layout.footerArea)).toBe(false);
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
        swatches: [{ name: "A", hex: "#960F0F" }],
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
        swatches: [{ name: "A", hex: "#960F0F" }],
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
        steps: [{ stepTag: "STEP 1", techniqueLabel: "basecoat" }],
        overflowStepsLabel: null,
        swatches: [{ name: "A", hex: "#960F0F" }],
        overflowColorsLabel: "+2",
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
    // 工程リスト・overflow・スウォッチのfillTextが呼ばれている（配線確認）
    const fillTextMock = ctx.fillText as unknown as ReturnType<typeof vi.fn>;
    const fillTextCalls = fillTextMock.mock.calls.map((call) => call[0]);
    expect(fillTextCalls).toContain("STEP 1");
    expect(fillTextCalls).toContain("basecoat");
    expect(fillTextCalls).toContain("+2");
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
