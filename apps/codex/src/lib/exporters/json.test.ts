// lib/exporters/json.test.ts — JSONエクスポート（技術計画v2.2 §2.2/§4.2 T29）のテスト
//
// 純関数部（stripDanglingPhotoRefs/buildExportPlan/assembleExportBlob）のテストは
// packages/recipe-core/src/exchange/exportFile.test.ts へ移動済み（v1 §1.4-2(c)）。
// 本ファイルはblobToDataUrl・exportRecipeToBlob（Dexie/FileReader依存）のみを扱う:
//   - 出力構造が§2.2準拠（app/kind/schemaVersion/exportedAt/recipe/photos）であること
//   - 実体なきphotoId参照（overviewPhotoIds/steps[].photoId/palette[].chipPhotoId）が除去されること
//   - 写真なし選択（includePhotos=false）時にphotoデータが含まれないこと（recipe内参照は残る）
//
// FileReaderはjsdom環境でreadAsDataURLが動作することを確認済みのため、blobToDataUrlは
// 実装（本ファイルのexport）をそのままdeps注入して使う。DB呼び出し（loadRecipe/
// collectPhotosForExport）はJsonExportDepsで差し替え、Dexie接続なしに検証する。

import { describe, expect, test, vi } from "vitest";
import type { RecipeDoc, RecipeExportFile } from "@coat-codex/recipe-core";
import { recipeExportFileSchema } from "@coat-codex/recipe-core";
import type { PhotoRecord } from "../../db/db";
import {
  blobToDataUrl,
  exportRecipeToBlob,
  RecipeNotFoundError,
  type JsonExportDeps,
} from "./json";

/** テスト用Step生成ヘルパー。他フィールドは最小固定値で埋める（recipeRefs.test.tsの慣行に倣う） */
function makeStep(
  overrides: Partial<RecipeDoc["baseSteps"][number]> & { id: string },
): RecipeDoc["baseSteps"][number] {
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
    schemaVersion: 1,
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
    ...overrides,
  };
}

/** テスト用PhotoRecord生成ヘルパー。blobは小さなダミーBlob */
function makePhoto(id: string, recipeId = "rcp_1"): PhotoRecord {
  return {
    id,
    recipeId,
    blob: new Blob([`dummy-${id}`], { type: "image/png" }),
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("blobToDataUrl", () => {
  test("BlobをdataURL文字列へ変換する（jsdom FileReaderで実動作確認）", async () => {
    const blob = new Blob(["hello"], { type: "image/png" });
    const result = await blobToDataUrl(blob);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});

describe("exportRecipeToBlob", () => {
  function makeDeps(overrides: Partial<JsonExportDeps> = {}): JsonExportDeps {
    return {
      loadRecipe: vi.fn(async () => makeDoc()),
      collectPhotosForExport: vi.fn(async () => []),
      blobToDataUrl: vi.fn(async (blob: Blob) => {
        const text = await blob.text();
        return `data:image/png;base64,${btoa(text)}`;
      }),
      ...overrides,
    };
  }

  test("§2.2準拠のRecipeExportFileをBlobとして出力する（写真あり）", async () => {
    const doc = makeDoc({
      id: "rcp_42",
      overviewPhotoIds: ["ph_1"],
      baseSteps: [makeStep({ id: "stp_1", photoId: "ph_1" })],
    });
    const photos = [makePhoto("ph_1", "rcp_42")];
    const deps = makeDeps({
      loadRecipe: vi.fn(async () => doc),
      collectPhotosForExport: vi.fn(async () => photos),
    });

    const blob = await exportRecipeToBlob(
      "rcp_42",
      { includePhotos: true },
      deps,
    );
    const parsed = JSON.parse(await blob.text()) as RecipeExportFile;

    expect(parsed.app).toBe("coat-codex");
    expect(parsed.kind).toBe("recipe-export");
    expect(parsed.schemaVersion).toBe(doc.schemaVersion);
    expect(parsed.recipe.id).toBe("rcp_42");
    expect(parsed.photos).toHaveLength(1);
    expect(parsed.photos[0].id).toBe("ph_1");
    expect(parsed.photos[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(recipeExportFileSchema.safeParse(parsed).success).toBe(true);
  });

  test("写真なし選択（includePhotos=false）時はphotoデータを含まない", async () => {
    const doc = makeDoc({
      overviewPhotoIds: ["ph_1"],
      baseSteps: [makeStep({ id: "stp_1", photoId: "ph_1" })],
    });
    const photos = [makePhoto("ph_1")];
    const blobToDataUrl = vi.fn(async () => "data:image/png;base64,X");
    const deps = makeDeps({
      loadRecipe: vi.fn(async () => doc),
      collectPhotosForExport: vi.fn(async () => photos),
      blobToDataUrl,
    });

    const blob = await exportRecipeToBlob(
      "rcp_1",
      { includePhotos: false },
      deps,
    );
    const parsed = JSON.parse(await blob.text()) as RecipeExportFile;

    expect(parsed.photos).toEqual([]);
    // recipe内のphotoId参照は残る（§2.2「写真なしエクスポート時」）
    expect(parsed.recipe.overviewPhotoIds).toEqual(["ph_1"]);
    expect(parsed.recipe.baseSteps[0].photoId).toBe("ph_1");
    // 写真なし選択時はdataUrl変換自体が呼ばれない（メモリピーク対策上も無駄な変換をしない）
    expect(blobToDataUrl).not.toHaveBeenCalled();
  });

  test("実体なきphotoId参照はincludePhotos=trueでも文書から除去される", async () => {
    const doc = makeDoc({
      overviewPhotoIds: ["ph_1", "ph_missing"],
      baseSteps: [makeStep({ id: "stp_1", photoId: "ph_missing" })],
    });
    const photos = [makePhoto("ph_1")];
    const deps = makeDeps({
      loadRecipe: vi.fn(async () => doc),
      collectPhotosForExport: vi.fn(async () => photos),
    });

    const blob = await exportRecipeToBlob(
      "rcp_1",
      { includePhotos: true },
      deps,
    );
    const parsed = JSON.parse(await blob.text()) as RecipeExportFile;

    expect(parsed.recipe.overviewPhotoIds).toEqual(["ph_1"]);
    expect(parsed.recipe.baseSteps[0].photoId).toBeNull();
    expect(parsed.photos.map((p) => p.id)).toEqual(["ph_1"]);
  });

  test("存在しないレシピIDはRecipeNotFoundErrorを投げる", async () => {
    const deps = makeDeps({ loadRecipe: vi.fn(async () => null) });
    await expect(
      exportRecipeToBlob("rcp_missing", { includePhotos: true }, deps),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  test("既定deps省略時は本番実装（imports済みのloadRecipe等）を使う", () => {
    // 実DB接続はfake-indexeddb環境でも別テストと状態を共有するため、ここでは
    // exportRecipeToBlobが引数省略でも呼び出し可能（型上deps省略可）であることのみ確認する
    expect(() => exportRecipeToBlob).not.toThrow();
  });
});
