// exchange/importPipeline.test.ts — インポートパイプライン純ロジック部のテスト（技術計画v2.2 §2.7・T30／v1 §1.4-2(d) ST-06）
//
// node環境で完結する（ブラウザ用DBポリフィル・jsdom非依存）。3段検証（第1段ヘッダ検証・
// 第3段フル検証）・reassignRecipeIds（正規化規則a・b）・normalizeImport（正規化規則c・d・e）を
// 検証する。DB書き込み・トランザクション・importRecipe統合のテストはcodex側
// （apps/codex/src/lib/importRecipe.test.ts）に残る。

import { describe, expect, test } from "vitest";
import {
  runImportPipeline,
  normalizeImport,
  reassignRecipeIds,
  type NormalizeImportDeps,
} from "./importPipeline";
import { CURRENT_SCHEMA_VERSION } from "../schema/migrations";
import type { RecipeDoc, RecipeExportFile } from "../schema/recipe";

/** テスト用の最小RecipeDocビルダー。schemaVersionはCURRENT固定 */
function makeRecipe(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  const now = "2026-07-01T00:00:00.000Z";
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "rcp_old",
    title: "テストレシピ",
    createdAt: now,
    updatedAt: now,
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

function makeExportFile(
  recipe: RecipeDoc,
  photos: { id: string; dataUrl: string }[] = [],
): RecipeExportFile {
  return {
    app: "coat-codex",
    kind: "recipe-export",
    schemaVersion: recipe.schemaVersion,
    exportedAt: "2026-07-01T00:00:00.000Z",
    recipe,
    photos,
  };
}

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const noopDeps: NormalizeImportDeps = {
  loadBrandColorsResult: async () => ({ ok: false, reason: "unknown-brand" }),
};

describe("runImportPipeline: 第1段ヘッダ検証", () => {
  test("JSONとして不正な文字列はinvalid-jsonで拒否する", async () => {
    const result = await runImportPipeline("{ not valid json", noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-json");
    }
  });

  test("appフィールドが coat-codex でないファイルはinvalid-headerで拒否する", async () => {
    const json = JSON.stringify({
      app: "other-app",
      kind: "recipe-export",
      schemaVersion: 1,
    });
    const result = await runImportPipeline(json, noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-header");
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  test("kindフィールドが recipe-export でないファイルはinvalid-headerで拒否する", async () => {
    const json = JSON.stringify({
      app: "coat-codex",
      kind: "other-kind",
      schemaVersion: 1,
    });
    const result = await runImportPipeline(json, noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-header");
    }
  });

  test("別kindのファイルはmigrateExportFile相当の処理へ進まない（ヘッダ段で中断する）", async () => {
    // kind不一致のファイルにrecipe前提のmigrateExportFileが実行されないことの回帰確認:
    // recipeフィールドが完全に欠落していてもinvalid-headerで止まりTypeErrorにならない
    const json = JSON.stringify({
      app: "coat-codex",
      kind: "some-other-kind",
      schemaVersion: 1,
    });
    const result = await runImportPipeline(json, noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-header");
    }
  });

  test("上位schemaVersionのファイルはunsupported-versionで拒否する", async () => {
    const recipe = makeRecipe({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    const file = makeExportFile(recipe);
    const json = JSON.stringify({
      ...file,
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    });

    const result = await runImportPipeline(json, noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported-version");
    }
  });
});

describe("runImportPipeline: 第3段フル検証", () => {
  test("不変条件違反（paints重複等）のファイルはinvalid-schemaでzod issue一覧を返す", async () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: "#ff0000",
          chipPhotoId: null,
        },
      ],
      baseSteps: [
        {
          id: "stp_1",
          technique: { presetKey: null, label: null },
          photoId: null,
          paints: [{ colorId: "col_1" }, { colorId: "col_1" }], // INV-7違反: colorId重複
          mix: [50, 50],
          toolIds: [],
          memo: "",
        },
      ],
    });
    const json = JSON.stringify(makeExportFile(recipe));

    const result = await runImportPipeline(json, noopDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid-schema");
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.message.includes("INV-7"))).toBe(true);
    }
  });
});

describe("reassignRecipeIds: 正規化規則a（全ID新規採番）", () => {
  test("recipe.id・palette[].id・tools[].id・parts[].id・全Step.idが旧IDと異なる新IDへ置き換わる", () => {
    const recipe = makeRecipe({
      id: "rcp_old",
      palette: [
        {
          id: "col_old",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: "#ff0000",
          chipPhotoId: null,
        },
      ],
      tools: [{ id: "tool_old", name: "筆", note: null }],
      baseSteps: [
        {
          id: "stp_old",
          technique: { presetKey: null, label: null },
          photoId: null,
          paints: [],
          mix: null,
          toolIds: [],
          memo: "",
        },
      ],
      parts: [{ id: "part_old", name: "パーツ", steps: [] }],
    });

    const { recipe: result } = reassignRecipeIds(recipe);

    expect(result.id).not.toBe("rcp_old");
    expect(result.id.startsWith("rcp_")).toBe(true);
    expect(result.palette[0].id).not.toBe("col_old");
    expect(result.palette[0].id.startsWith("col_")).toBe(true);
    expect(result.tools[0].id).not.toBe("tool_old");
    expect(result.tools[0].id.startsWith("tool_")).toBe(true);
    expect(result.baseSteps[0].id).not.toBe("stp_old");
    expect(result.baseSteps[0].id.startsWith("stp_")).toBe(true);
    expect(result.parts[0].id).not.toBe("part_old");
    expect(result.parts[0].id.startsWith("part_")).toBe(true);
  });

  test("同一ファイルを2回reassignすると異なるIDが払い出される（衝突有無に関わらず常に新規採番）", () => {
    const recipe = makeRecipe({ id: "rcp_same" });
    const first = reassignRecipeIds(recipe);
    const second = reassignRecipeIds(recipe);
    expect(first.recipe.id).not.toBe(second.recipe.id);
  });
});

describe("reassignRecipeIds: 正規化規則b（参照リマップ）", () => {
  test("colorId/toolIds/overviewPhotoIds/steps[].photoId/chipPhotoIdが新IDへ一括置換される", () => {
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_overview"],
      palette: [
        {
          id: "col_1",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: "#ff0000",
          chipPhotoId: "ph_chip",
        },
      ],
      tools: [{ id: "tool_1", name: "筆", note: null }],
      baseSteps: [
        {
          id: "stp_1",
          technique: { presetKey: null, label: null },
          photoId: "ph_step",
          paints: [{ colorId: "col_1" }],
          mix: null,
          toolIds: ["tool_1"],
          memo: "",
        },
      ],
    });

    const { recipe: result, photoIdMap } = reassignRecipeIds(recipe);

    const newColorId = result.palette[0].id;
    const newToolId = result.tools[0].id;
    const newOverviewPhotoId = photoIdMap.get("ph_overview");
    const newChipPhotoId = photoIdMap.get("ph_chip");
    const newStepPhotoId = photoIdMap.get("ph_step");

    expect(result.baseSteps[0].paints[0].colorId).toBe(newColorId);
    expect(result.baseSteps[0].toolIds[0]).toBe(newToolId);
    expect(result.overviewPhotoIds[0]).toBe(newOverviewPhotoId);
    expect(result.palette[0].chipPhotoId).toBe(newChipPhotoId);
    expect(result.baseSteps[0].photoId).toBe(newStepPhotoId);

    // 旧IDとは異なる
    expect(newColorId).not.toBe("col_1");
    expect(newToolId).not.toBe("tool_1");
    expect(newOverviewPhotoId).not.toBe("ph_overview");
    expect(newChipPhotoId).not.toBe("ph_chip");
    expect(newStepPhotoId).not.toBe("ph_step");
  });

  test("parts[].steps内の参照もリマップされる", () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "custom",
          brand: null,
          name: "赤",
          presetId: null,
          hex: "#ff0000",
          chipPhotoId: null,
        },
      ],
      parts: [
        {
          id: "part_1",
          name: "パーツ",
          steps: [
            {
              id: "stp_part1",
              technique: { presetKey: null, label: null },
              photoId: null,
              paints: [{ colorId: "col_1" }],
              mix: null,
              toolIds: [],
              memo: "",
            },
          ],
        },
      ],
    });

    const { recipe: result } = reassignRecipeIds(recipe);
    const newColorId = result.palette[0].id;
    expect(result.parts[0].steps[0].paints[0].colorId).toBe(newColorId);
  });

  test("photoCropsのキーがphotoIdMapで新IDへリマップされる", () => {
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_overview"],
      photoCrops: {
        ph_overview: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      },
    });

    const { recipe: result, photoIdMap } = reassignRecipeIds(recipe);
    const newOverviewPhotoId = photoIdMap.get("ph_overview");

    expect(newOverviewPhotoId).toBeDefined();
    expect(result.photoCrops).toEqual({
      [newOverviewPhotoId as string]: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    });
  });

  test("photoIdMapに存在しないphotoCropsキー（文書内で未参照のdangling crop）は脱落する", () => {
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_overview"],
      photoCrops: {
        ph_overview: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
        ph_unreferenced: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 },
      },
    });

    const { recipe: result, photoIdMap } = reassignRecipeIds(recipe);

    expect(photoIdMap.has("ph_unreferenced")).toBe(false);
    expect(Object.keys(result.photoCrops)).toHaveLength(1);
  });
});

describe("normalizeImport: 正規化規則c（dangling photo除去）", () => {
  test("photos[]に実体がないphoto参照は文書から除去される", async () => {
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_missing"],
      baseSteps: [
        {
          id: "stp_1",
          technique: { presetKey: null, label: null },
          photoId: "ph_missing_step",
          paints: [],
          mix: null,
          toolIds: [],
          memo: "",
        },
      ],
    });
    const file = makeExportFile(recipe, []); // photos: [] = 実体なし

    const { recipe: result, photos } = await normalizeImport(file, noopDeps);

    expect(result.overviewPhotoIds).toEqual([]);
    expect(result.baseSteps[0].photoId).toBeNull();
    expect(photos).toEqual([]);
  });

  test("photos[]に実体があるphoto参照は保持され、新IDへリマップされたエントリが返る", async () => {
    const recipe = makeRecipe({
      overviewPhotoIds: ["ph_present"],
    });
    const file = makeExportFile(recipe, [
      { id: "ph_present", dataUrl: PNG_DATA_URL },
    ]);

    const { recipe: result, photos } = await normalizeImport(file, noopDeps);

    expect(result.overviewPhotoIds).toHaveLength(1);
    expect(photos).toHaveLength(1);
    expect(photos[0].id).toBe(result.overviewPhotoIds[0]);
    expect(photos[0].dataUrl).toBe(PNG_DATA_URL);
  });
});

describe("normalizeImport: 正規化規則d（presetKey/presetId降格）", () => {
  test("マスタ外のtechnique.presetKeyは{presetKey:null, label:<旧キー>}へ降格する", async () => {
    const recipe = makeRecipe({
      baseSteps: [
        {
          id: "stp_1",
          technique: { presetKey: "unknown-legacy-technique", label: null },
          photoId: null,
          paints: [],
          mix: null,
          toolIds: [],
          memo: "",
        },
      ],
    });
    const file = makeExportFile(recipe);

    const { recipe: result } = await normalizeImport(file, noopDeps);

    expect(result.baseSteps[0].technique.presetKey).toBeNull();
    expect(result.baseSteps[0].technique.label).toBe(
      "unknown-legacy-technique",
    );
  });

  test("マスタ内のtechnique.presetKeyは降格されない", async () => {
    const recipe = makeRecipe({
      baseSteps: [
        {
          id: "stp_1",
          technique: { presetKey: "basecoat", label: null },
          photoId: null,
          paints: [],
          mix: null,
          toolIds: [],
          memo: "",
        },
      ],
    });
    const file = makeExportFile(recipe);

    const { recipe: result } = await normalizeImport(file, noopDeps);

    expect(result.baseSteps[0].technique.presetKey).toBe("basecoat");
    expect(result.baseSteps[0].technique.label).toBeNull();
  });

  test("マスタ外のpalette[].presetIdはsource=customかつpresetId=nullへ降格する", async () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "Citadel",
          name: "廃盤カラー",
          presetId: "citadel:discontinued-color",
          hex: "#123456",
          chipPhotoId: null,
        },
      ],
    });
    const file = makeExportFile(recipe);

    const deps: NormalizeImportDeps = {
      loadBrandColorsResult: async (brandId) =>
        brandId === "citadel"
          ? { ok: true, colors: [{ id: "citadel:mephiston-red" }] }
          : { ok: false, reason: "unknown-brand" },
    };

    const { recipe: result } = await normalizeImport(file, deps);

    expect(result.palette[0].source).toBe("custom");
    expect(result.palette[0].presetId).toBeNull();
  });

  test("マスタ内のpalette[].presetIdは降格されない", async () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "Citadel",
          name: "Mephiston Red",
          presetId: "citadel:mephiston-red",
          hex: "#960F0F",
          chipPhotoId: null,
        },
      ],
    });
    const file = makeExportFile(recipe);

    const deps: NormalizeImportDeps = {
      loadBrandColorsResult: async (brandId) =>
        brandId === "citadel"
          ? { ok: true, colors: [{ id: "citadel:mephiston-red" }] }
          : { ok: false, reason: "unknown-brand" },
    };

    const { recipe: result } = await normalizeImport(file, deps);

    expect(result.palette[0].source).toBe("preset");
    expect(result.palette[0].presetId).toBe("citadel:mephiston-red");
  });

  test("裁定規則a: ブランドがindexに存在しない場合は降格する（例: 旧AK）", async () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "AK",
          name: "旧 AK カラー",
          presetId: "ak:old-color",
          hex: "#654321",
          chipPhotoId: null,
        },
      ],
    });
    const file = makeExportFile(recipe);

    const deps: NormalizeImportDeps = {
      loadBrandColorsResult: async () => ({
        ok: false,
        reason: "unknown-brand",
      }),
    };

    const { recipe: result } = await normalizeImport(file, deps);

    expect(result.palette[0].source).toBe("custom");
    expect(result.palette[0].presetId).toBeNull();
  });

  test("裁定規則b: ブランドはindexに存在するが色一覧fetchがネットワーク起因で失敗した場合は降格せずpresetを維持する", async () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "Citadel",
          name: "Mephiston Red",
          presetId: "citadel:mephiston-red",
          hex: "#960F0F",
          chipPhotoId: null,
        },
      ],
    });
    const file = makeExportFile(recipe);

    const deps: NormalizeImportDeps = {
      loadBrandColorsResult: async () => ({
        ok: false,
        reason: "fetch-failed",
      }),
    };

    const { recipe: result } = await normalizeImport(file, deps);

    expect(result.palette[0].source).toBe("preset");
    expect(result.palette[0].presetId).toBe("citadel:mephiston-red");
  });

  test("裁定規則c: index自体が取得不能な場合は降格処理全体をスキップする（インポートは続行）", async () => {
    const recipe = makeRecipe({
      palette: [
        {
          id: "col_1",
          source: "preset",
          brand: "Citadel",
          name: "廃盤カラー",
          presetId: "citadel:discontinued-color",
          hex: "#123456",
          chipPhotoId: null,
        },
        {
          id: "col_2",
          source: "custom",
          brand: null,
          name: "自由入力カラー",
          presetId: null,
          hex: "#abcdef",
          chipPhotoId: null,
        },
      ],
    });
    const file = makeExportFile(recipe);

    const deps: NormalizeImportDeps = {
      loadBrandColorsResult: async () => ({
        ok: false,
        reason: "index-unavailable",
      }),
    };

    const { recipe: result } = await normalizeImport(file, deps);

    // index不能時は降格処理全体をスキップ: preset色はsource/presetIdとも変化しない
    expect(result.palette[0].source).toBe("preset");
    expect(result.palette[0].presetId).toBe("citadel:discontinued-color");
    // custom色も無関係に素通りする（インポート自体は続行）
    expect(result.palette[1].source).toBe("custom");
  });
});

describe("normalizeImport: 正規化規則e（schemaVersion/createdAt/updatedAt）", () => {
  test("schemaVersion=CURRENT・createdAtは保持・updatedAtは現在時刻へ更新される", async () => {
    const recipe = makeRecipe({
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    const file = makeExportFile(recipe);

    const before = Date.now();
    const { recipe: result } = await normalizeImport(file, noopDeps);
    const after = Date.now();

    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.createdAt).toBe("2020-01-01T00:00:00.000Z");
    expect(result.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    const updatedAtMs = new Date(result.updatedAt).getTime();
    expect(updatedAtMs).toBeGreaterThanOrEqual(before);
    expect(updatedAtMs).toBeLessThanOrEqual(after);
  });
});

describe("runImportPipeline: RecipeDoc v3 source（技術計画v1 §2.5・ST-07完了条件）", () => {
  test("v1エクスポートファイル（source概念なし）のインポートが成功しv3（source: null）になる", async () => {
    const v1File = {
      app: "coat-codex",
      kind: "recipe-export",
      schemaVersion: 1,
      exportedAt: "2026-07-01T00:00:00.000Z",
      recipe: {
        schemaVersion: 1,
        id: "rcp_v1",
        title: "v1レシピ",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        overviewPhotoIds: [],
        palette: [],
        tools: [],
        baseSteps: [],
        parts: [],
      },
      photos: [],
    };

    const result = await runImportPipeline(JSON.stringify(v1File), noopDeps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipe.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.recipe.source).toBeNull();
    }
  });

  test("v2エクスポートファイル（photoCropsあり・source概念なし）のインポートが成功しv3（source: null）になる", async () => {
    const v2File = {
      app: "coat-codex",
      kind: "recipe-export",
      schemaVersion: 2,
      exportedAt: "2026-07-01T00:00:00.000Z",
      recipe: {
        schemaVersion: 2,
        id: "rcp_v2",
        title: "v2レシピ",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        overviewPhotoIds: [],
        palette: [],
        tools: [],
        baseSteps: [],
        parts: [],
        photoCrops: {},
      },
      photos: [],
    };

    const result = await runImportPipeline(JSON.stringify(v2File), noopDeps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipe.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.recipe.source).toBeNull();
    }
  });

  test("v3ファイルの非nullなsourceは正規化規則a〜eを通過しても消えずに保存される", async () => {
    const recipe = makeRecipe({
      source: {
        scriptoriumId: "scr_123",
        author: "名無しの塗装師",
        importedAt: "2026-07-05T00:00:00.000Z",
      },
    });
    const file = makeExportFile(recipe);

    const result = await runImportPipeline(JSON.stringify(file), noopDeps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipe.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.recipe.source).toEqual({
        scriptoriumId: "scr_123",
        author: "名無しの塗装師",
        importedAt: "2026-07-05T00:00:00.000Z",
      });
    }
  });
});
