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
    steps: [],
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<RecipeDocLike> = {}): RecipeDocLike {
  return {
    title: "Space Marine Captain",
    overviewPhotoIds: [],
    parts: [],
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
};

// ---- listShareCandidates ----

describe("listShareCandidates", () => {
  test("whole: 全体写真0件→空配列", () => {
    const ctx: ShareContext = { mode: "whole", recipe: makeRecipe() };
    expect(listShareCandidates(ctx, resolvers)).toEqual([]);
  });

  test("whole: 全体写真複数件→写真順にwhole候補", () => {
    const recipe = makeRecipe({ overviewPhotoIds: ["ph_1", "ph_2", "ph_3"] });
    const ctx: ShareContext = { mode: "whole", recipe };
    const result = listShareCandidates(ctx, resolvers) as WholeCandidateSpec[];
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.photoId)).toEqual(["ph_1", "ph_2", "ph_3"]);
    expect(result.every((c) => c.kind === "whole")).toBe(true);
    expect(result.every((c) => c.title === "Space Marine Captain")).toBe(true);
  });

  test("part: 写真つき工程0件（全工程が写真なし）→空配列", () => {
    const part = makePart({
      steps: [makeStep({ photoId: null }), makeStep({ photoId: null })],
    });
    const recipe = makeRecipe({ parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    expect(listShareCandidates(ctx, resolvers)).toEqual([]);
  });

  test("part: 写真なし工程を含む混在パーツ→写真つき工程のみ工程順に列挙", () => {
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
    const result = listShareCandidates(ctx, resolvers) as PartCandidateSpec[];

    expect(result).toHaveLength(2);
    expect(result[0].stepPhotoId).toBe("ph_step2");
    expect(result[0].stepTag).toBe("STEP 2");
    expect(result[1].stepPhotoId).toBe("ph_step4");
    expect(result[1].stepTag).toBe("STEP 4");
    expect(result.every((c) => c.overviewPhotoId === "ph_overview")).toBe(true);
  });

  test("part: 全体写真なし→overviewPhotoIdはnull", () => {
    const part = makePart({ steps: [makeStep({ photoId: "ph_1" })] });
    const recipe = makeRecipe({ overviewPhotoIds: [], parts: [part] });
    const ctx: ShareContext = { mode: "part", recipe, partId: "part_1" };
    const result = listShareCandidates(ctx, resolvers) as PartCandidateSpec[];
    expect(result[0].overviewPhotoId).toBeNull();
  });

  test("part: 存在しないpartId→空配列", () => {
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
    const result = listShareCandidates(ctx, resolvers) as PartCandidateSpec[];
    expect(result[0].mixWarning).toBe("合計が100%になっていません");
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
    const result = listShareCandidates(ctx, resolvers) as PartCandidateSpec[];
    expect(result[0].mixWarning).toBeNull();
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
    const result = listShareCandidates(ctx, resolvers) as PartCandidateSpec[];
    expect(result[0].swatches).toHaveLength(1);
    expect(result[0].swatches[0].name).toBe("Color col_a");
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

  test("whole: mainPhotoとtextAreaがカード内に収まり重ならない", () => {
    const spec: WholeCandidateSpec = {
      kind: "whole",
      photoId: "ph_1",
      title: "Title",
    };
    const layout = computeCardLayout(spec);
    assertWithinCard(layout.mainPhoto, layout);
    assertWithinCard(layout.textArea, layout);
    expect(rectsOverlap(layout.mainPhoto, layout.textArea)).toBe(false);
    expect(layout.insetPhoto).toBeNull();
    expect(layout.swatchArea).toBeNull();
  });

  test("part: 全要素（mainPhoto/insetPhoto/textArea/swatchArea）がカード内・相互不重複", () => {
    const spec: PartCandidateSpec = {
      kind: "part",
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

    assertWithinCard(layout.mainPhoto, layout);
    expect(layout.insetPhoto).not.toBeNull();
    assertWithinCard(layout.insetPhoto!, layout);
    assertWithinCard(layout.textArea, layout);
    expect(layout.swatchArea).not.toBeNull();
    assertWithinCard(layout.swatchArea!, layout);

    // insetPhotoはmainPhoto領域の内側に配置される（重なりは許容: インセットは主写真の上に乗る想定）
    // textAreaとswatchAreaは情報帯内であり、互いに重ならないこと・mainPhotoと重ならないことを検算
    expect(rectsOverlap(layout.textArea, layout.swatchArea!)).toBe(false);
    expect(rectsOverlap(layout.mainPhoto, layout.textArea)).toBe(false);
    expect(rectsOverlap(layout.mainPhoto, layout.swatchArea!)).toBe(false);
  });

  test("part: overviewPhotoId=null→insetPhoto=null", () => {
    const spec: PartCandidateSpec = {
      kind: "part",
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
  });

  test("part: swatches=0件→swatchArea=null、textAreaがその分拡張される", () => {
    const withSwatches: PartCandidateSpec = {
      kind: "part",
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
    expect(layoutWithout.textArea.height).toBeGreaterThan(
      layoutWith.textArea.height,
    );
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
});
