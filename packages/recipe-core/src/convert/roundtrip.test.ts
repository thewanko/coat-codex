// convert/roundtrip.test.ts — RecipeDoc→PublishedRecipe→ExportFile→runImportPipeline往復テスト
// （技術計画v1 §2.2/§2.4・ST-08完了条件）

import { describe, expect, test } from "vitest";
import { toPublishedRecipe } from "./toPublishedRecipe";
import {
  publishedToExportFile,
  type PublishedToExportFileMeta,
} from "./publishedToExportFile";
import {
  runImportPipeline,
  type NormalizeImportDeps,
} from "../exchange/importPipeline";
import { CURRENT_SCHEMA_VERSION } from "../schema/migrations";
import { recipeExportFileSchema, type RecipeDoc } from "../schema/recipe";

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const noopDeps: NormalizeImportDeps = {
  loadBrandColorsResult: async () => ({ ok: false, reason: "unknown-brand" }),
};

/**
 * memo・写真参照・crop・noteを持つフルなRecipeDoc（削減規則§2.2対象フィールドを
 * すべて非空値で埋めたフィクスチャ）。
 */
function makeFullRecipeDoc(): RecipeDoc {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "rcp_full",
    title: "Space Marine Captain",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    overviewPhotoIds: ["ph_overview"],
    palette: [
      {
        id: "col_1",
        source: "preset",
        brand: "Citadel",
        name: "Mephiston Red",
        presetId: "citadel:mephiston-red",
        hex: "#960F0F",
        chipPhotoId: "ph_chip",
      },
      {
        id: "col_2",
        source: "custom",
        brand: null,
        name: "自家調色ブラック",
        presetId: null,
        hex: null,
        chipPhotoId: null,
      },
    ],
    tools: [{ id: "tool_1", name: "エアブラシ", note: "0.3mm・低圧" }],
    baseSteps: [
      {
        id: "stp_base_1",
        technique: { presetKey: "prime", label: null },
        photoId: "ph_base_step",
        paints: [],
        mix: null,
        toolIds: ["tool_1"],
        memo: "下地は薄く2度吹き",
      },
    ],
    parts: [
      {
        id: "part_1",
        name: "兜",
        steps: [
          {
            id: "stp_1",
            technique: { presetKey: "basecoat", label: null },
            photoId: "ph_part_step",
            paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
            mix: [60, 40],
            toolIds: ["tool_1"],
            memo: "境界をぼかす",
          },
        ],
      },
    ],
    photoCrops: {
      ph_overview: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    },
    source: null,
  };
}

describe("toPublishedRecipe — 削減規則§2.2の個別検証", () => {
  test("Step.memoが除外される", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    expect("memo" in pub.baseSteps[0]).toBe(false);
    expect("memo" in pub.parts[0].steps[0]).toBe(false);
  });

  test("Step.photoIdが除外される", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    expect("photoId" in pub.baseSteps[0]).toBe(false);
    expect("photoId" in pub.parts[0].steps[0]).toBe(false);
  });

  test("Tool.noteが除外される", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    expect("note" in pub.tools[0]).toBe(false);
  });

  test("PaletteColor.chipPhotoIdが除外される", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    expect("chipPhotoId" in pub.palette[0]).toBe(false);
    expect("chipPhotoId" in pub.palette[1]).toBe(false);
  });

  test("createdAt/updatedAtが除外される（PublishedRecipeにフィールド自体がない）", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    expect("createdAt" in pub).toBe(false);
    expect("updatedAt" in pub).toBe(false);
  });

  test("overviewPhotoIdsが除外される", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    expect("overviewPhotoIds" in pub).toBe(false);
  });

  test("photoCropsが除外される", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    expect("photoCrops" in pub).toBe(false);
  });

  test("維持されるフィールド: title・palette色情報・tools名・parts構造・steps技法/配合/工具", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    expect(pub.scriptoriumSchemaVersion).toBe(1);
    expect(pub.title).toBe("Space Marine Captain");
    expect(pub.palette[0]).toEqual({
      id: "col_1",
      source: "preset",
      brand: "Citadel",
      name: "Mephiston Red",
      presetId: "citadel:mephiston-red",
      hex: "#960F0F",
    });
    expect(pub.tools[0]).toEqual({ id: "tool_1", name: "エアブラシ" });
    expect(pub.parts[0].steps[0]).toEqual({
      id: "stp_1",
      technique: { presetKey: "basecoat", label: null },
      paints: [{ colorId: "col_1" }, { colorId: "col_2" }],
      mix: [60, 40],
      toolIds: ["tool_1"],
    });
  });
});

const META: PublishedToExportFileMeta = {
  scriptoriumId: "scr_123",
  author: "名無しの塗装師",
  importedAt: "2026-07-05T00:00:00.000Z",
};

describe("publishedToExportFile — memo/note/chipPhotoId補完・cover写真・schemaValidity", () => {
  test("cover写真なし: overviewPhotoIds=[]・photos=[]", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    const file = publishedToExportFile(pub, META);
    expect(file.recipe.overviewPhotoIds).toEqual([]);
    expect(file.photos).toEqual([]);
    expect(recipeExportFileSchema.safeParse(file).success).toBe(true);
  });

  test("cover写真あり: photos=[{id:'ph_cover', dataUrl}]・overviewPhotoIds=['ph_cover']", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    const file = publishedToExportFile(pub, META, PNG_DATA_URL);
    expect(file.recipe.overviewPhotoIds).toEqual(["ph_cover"]);
    expect(file.photos).toEqual([{ id: "ph_cover", dataUrl: PNG_DATA_URL }]);
    expect(recipeExportFileSchema.safeParse(file).success).toBe(true);
  });

  test("memo=''・note=null・chipPhotoId=nullが補完される", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    const file = publishedToExportFile(pub, META);
    expect(file.recipe.baseSteps[0].memo).toBe("");
    expect(file.recipe.parts[0].steps[0].memo).toBe("");
    expect(file.recipe.tools[0].note).toBeNull();
    expect(file.recipe.palette[0].chipPhotoId).toBeNull();
    expect(file.recipe.palette[1].chipPhotoId).toBeNull();
  });

  test("sourceにmetaが保存され、schemaVersion=CURRENT", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    const file = publishedToExportFile(pub, META);
    expect(file.recipe.source).toEqual(META);
    expect(file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(file.recipe.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test("photoCropsは空マップで補完される", () => {
    const pub = toPublishedRecipe(makeFullRecipeDoc());
    const file = publishedToExportFile(pub, META);
    expect(file.recipe.photoCrops).toEqual({});
  });
});

describe("往復: RecipeDoc → toPublishedRecipe → publishedToExportFile → runImportPipeline", () => {
  test("cover写真なし: source保存・ID再採番・memo/note/chipPhotoId補完値がインポート結果に反映される", async () => {
    const original = makeFullRecipeDoc();
    const pub = toPublishedRecipe(original);
    const file = publishedToExportFile(pub, META);

    const result = await runImportPipeline(JSON.stringify(file), noopDeps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // source保存
    expect(result.recipe.source).toEqual(META);

    // ID再採番: 元のcodex専用ID群とは異なる新IDが振られている
    expect(result.recipe.id).not.toBe(file.recipe.id);
    expect(result.recipe.palette[0].id).not.toBe("col_1");
    expect(result.recipe.tools[0].id).not.toBe("tool_1");
    expect(result.recipe.parts[0].id).not.toBe("part_1");

    // memo/note/chipPhotoId補完値の維持
    expect(result.recipe.baseSteps[0].memo).toBe("");
    expect(result.recipe.tools[0].note).toBeNull();
    expect(result.recipe.palette[0].chipPhotoId).toBeNull();

    // cover写真なしなのでphotosは空
    expect(result.photos).toEqual([]);
    expect(result.recipe.overviewPhotoIds).toEqual([]);
  });

  test("cover写真あり: インポート結果でcover写真1枚が実体として残る", async () => {
    const original = makeFullRecipeDoc();
    const pub = toPublishedRecipe(original);
    const file = publishedToExportFile(pub, META, PNG_DATA_URL);

    const result = await runImportPipeline(JSON.stringify(file), noopDeps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.photos).toHaveLength(1);
    expect(result.photos[0].dataUrl).toBe(PNG_DATA_URL);
    // overviewPhotoIdsは再採番済みの新IDを指し、photosの実体と一致する
    expect(result.recipe.overviewPhotoIds).toEqual([result.photos[0].id]);
  });

  test("参照整合（palette/tools参照）はインポート後も維持される", async () => {
    const original = makeFullRecipeDoc();
    const pub = toPublishedRecipe(original);
    const file = publishedToExportFile(pub, META);

    const result = await runImportPipeline(JSON.stringify(file), noopDeps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const newColorIds = new Set(result.recipe.palette.map((c) => c.id));
    const newToolIds = new Set(result.recipe.tools.map((t) => t.id));
    const step = result.recipe.parts[0].steps[0];
    for (const paint of step.paints) {
      expect(newColorIds.has(paint.colorId)).toBe(true);
    }
    for (const toolId of step.toolIds) {
      expect(newToolIds.has(toolId)).toBe(true);
    }
  });
});
