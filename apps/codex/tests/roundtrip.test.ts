// tests/roundtrip.test.ts — エクスポート→インポート往復ユニットテスト（技術計画v2.2 §2.2/§2.7 T31）
//
// fake-indexeddb上でexportRecipeToBlob（T29）→importRecipe（T30）の実物を通し、以下を検証する:
//   1. 写真ありの往復同値性: DB投入したレシピ＋写真をexport→import後、
//      「ID正規化（全ID再採番）の影響を除いたdeep equal」で元と同値・写真Blobがバイト列等価
//   2. 写真なしエクスポートの往復: photo参照（overviewPhotoIds/steps[].photoId/palette[].chipPhotoId）が
//      dangling正規化で除去される
//   3. 2回インポートで2レシピ: 同一エクスポートファイルを2回importしてもID衝突せず2レシピ存在する
//
// フィクスチャはtests/fixtures/recipe.ts（T32作成済み）のcreateFixtureRecipeを再利用する
// （新規フィクスチャの重複作成はタスク指示で禁止されている）。
//
// 【jsdom/fake-indexeddb環境の既知制約とその回避（db/photoStore.test.tsで既に文書化済み）】
// 「fake-indexeddb(jsdom環境)はBlobをstructured cloneで正しく復元できない」（同ファイルの
// savePhotoテストのコメント）。実際に検証すると、DBへ書き込んだBlobを読み出し直す
// （db.photos.get等）と中身が空のプレーンObjectになる（Node.js組み込みstructuredClone自体が
// jsdomのBlobを正しく複製できないため。fake-indexeddbはこれを内部で使用する）。
// 一方、DB「書き込み」方向（bulkAdd/put）とfetch(dataUrl)経由で新規生成されるBlobは
// structured cloneを経由しないためこの制約を受けない。
// このため:
//   - collectPhotosForExport（exportRecipeToBlobのdeps）はDB読み出し結果のidのみ使い、
//     blob本体はDB投入前に保持していたオリジナルBlobオブジェクトへ差し替える
//     （makeExportDepsWithOriginalBlobs）。loadRecipeとblobToDataUrl（FileReader）は
//     本番実装のまま使う。
//   - インポート側でDBへ書き込まれる新しいBlob（dataUrlToBlobの戻り値。fetch(dataUrl)経由で
//     structured clone未経由の実物）はdb.photos.bulkAddへのvi.spyOnで捕捉し、その捕捉値を
//     比較対象にする（photoStore.test.tsのsavePhotoテストと同じ「呼び出しに渡された引数を
//     直接検証する」手法）。読み出し直したBlobでの内容比較はしない。

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db, type PhotoRecord } from "../src/db/db";
import type { RecipeDoc, Step } from "@coat-codex/recipe-core";
import {
  exportRecipeToBlob,
  type JsonExportDeps,
} from "../src/lib/exporters/json";
import { importRecipe, type ImportRecipeDeps } from "../src/lib/importRecipe";
import { loadRecipe } from "../src/db/recipeStore";
import { createFixtureRecipe } from "./fixtures/recipe";

beforeEach(async () => {
  await db.recipes.clear();
  await db.photos.clear();
  await db.meta.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** フィクスチャレシピが参照する全photoId（overviewPhotoIds/steps[].photoId/palette[].chipPhotoId）を集める */
function collectReferencedPhotoIds(recipe: RecipeDoc): string[] {
  const ids = new Set<string>();
  for (const id of recipe.overviewPhotoIds) ids.add(id);
  for (const color of recipe.palette) {
    if (color.chipPhotoId !== null) ids.add(color.chipPhotoId);
  }
  const collectStep = (step: Step) => {
    if (step.photoId !== null) ids.add(step.photoId);
  };
  recipe.baseSteps.forEach(collectStep);
  recipe.parts.forEach((part) => part.steps.forEach(collectStep));
  return [...ids];
}

/** 指定photoIdごとに一意な内容を持つダミーPNG風Blobを生成する（バイト列比較のため内容を可変にする） */
function makeDummyBlob(photoId: string): Blob {
  const bytes = Uint8Array.from(
    `PNGDATA:${photoId}`.split("").map((c) => c.charCodeAt(0)),
  );
  return new Blob([bytes], { type: "image/png" });
}

/**
 * フィクスチャレシピが参照する写真の実体をphotosテーブルへ投入し、DB投入前に保持した
 * オリジナルBlobオブジェクト（read-back不要・structured clone未経由）のMapを返す。
 * db.photos.bulkAddはDB「書き込み」なのでstructured clone破損の影響を受けない
 * （破損するのは読み出し直したBlobの方。ファイル冒頭コメント参照）。
 */
async function seedPhotosForRecipe(
  recipe: RecipeDoc,
): Promise<Map<string, Blob>> {
  const photoIds = collectReferencedPhotoIds(recipe);
  const originalBlobs = new Map<string, Blob>();
  const records: PhotoRecord[] = photoIds.map((id) => {
    const blob = makeDummyBlob(id);
    originalBlobs.set(id, blob);
    return {
      id,
      recipeId: recipe.id,
      blob,
      createdAt: "2026-07-02T10:00:00.000Z",
    };
  });
  await db.photos.bulkAdd(records);
  return originalBlobs;
}

/**
 * exportRecipeToBlobのcollectPhotosForExportのみ、DB投入前に保持したオリジナルBlob
 * （structured clone未経由の実物）を返す薄いラッパーへ差し替えたdepsを組み立てる。
 * loadRecipeとblobToDataUrl（FileReader実装）は本番実装（DB直結・実FileReader）のまま。
 */
function makeExportDepsWithOriginalBlobs(
  recipeId: string,
  originalBlobs: Map<string, Blob>,
): JsonExportDeps {
  return {
    loadRecipe,
    blobToDataUrl: async (blob: Blob) => {
      const reader = new FileReader();
      return new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("blobToDataUrl: unexpected result type"));
          }
        };
        reader.onerror = () =>
          reject(reader.error ?? new Error("blobToDataUrl: read error"));
        reader.readAsDataURL(blob);
      });
    },
    collectPhotosForExport: async () => {
      const records = await db.photos
        .where("recipeId")
        .equals(recipeId)
        .toArray();
      // DB読み出しはid/recipeId/createdAtの照合のみに使い、blob本体はDB投入前の
      // オリジナルオブジェクトへ差し替える（structured clone破損の回避。冒頭コメント参照）
      return records.map((record) => ({
        ...record,
        blob: originalBlobs.get(record.id) ?? record.blob,
      }));
    },
  };
}

/**
 * importRecipeのdeps。loadBrandColorsResult（マスタ外presetId降格判定・§2.7規則d）は本番実装が
 * fetch("/paints/index.json")に依存しjsdomでは解決できない相対URLのため、フィクスチャの
 * プリセット色（citadel:mephiston-red 等）が実在するものとして扱う最小スタブへ差し替える
 * （importRecipe.test.tsと同じ注入パターン）。dataUrlToBlobはfetch(dataUrl)を使う本番実装が
 * jsdomでも正しく動作する（=structured clone未経由の実物Blobを生成する）ため既定のまま使う。
 */
const importDeps: ImportRecipeDeps = {
  loadBrandColorsResult: async (brandId) => {
    if (brandId === "citadel") {
      return {
        ok: true,
        colors: [{ id: "citadel:mephiston-red" }, { id: "citadel:white-scar" }],
      };
    }
    return { ok: false, reason: "unknown-brand" };
  },
  dataUrlToBlob: async (dataUrl: string) => {
    const res = await fetch(dataUrl);
    return res.blob();
  },
};

/**
 * RecipeDoc内の全ID（rcp_/col_/tool_/part_/stp_/ph_プレフィックス）を「出現順に基づく
 * 構造的プレースホルダ」へ一括置換する。インポートはID正規化（全ID再採番。§2.7規則a）を
 * 行うため実際のUUID値は往復で必ず変わる。実UUID値ではなく「文書内の構造的な参照関係
 * （どのIDがどこから何回参照されているか）」が往復前後で保たれることを検証するための
 * 比較専用ヘルパー（構造を無視した緩い比較ではない — 全フィールド・配列順序はtoEqualで
 * そのまま突き合わせ、IDの文字列値のみを構造位置ベースの安定キーへ写像する）。
 */
function normalizeIdsForComparison(recipe: RecipeDoc): RecipeDoc {
  const counters = new Map<string, number>();
  const idMap = new Map<string, string>();

  const normalizeId = (id: string): string => {
    const known = idMap.get(id);
    if (known !== undefined) return known;
    const prefix = id.slice(0, id.indexOf("_"));
    const next = counters.get(prefix) ?? 0;
    counters.set(prefix, next + 1);
    const placeholder = `${prefix}#${next}`;
    idMap.set(id, placeholder);
    return placeholder;
  };

  const normalizeNullableId = (id: string | null): string | null =>
    id === null ? null : normalizeId(id);

  const normalizeStep = (step: Step): Step => ({
    ...step,
    id: normalizeId(step.id),
    photoId: normalizeNullableId(step.photoId),
    paints: step.paints.map((paint) => ({
      colorId: normalizeId(paint.colorId),
    })),
    toolIds: step.toolIds.map((toolId) => normalizeId(toolId)),
  });

  return {
    ...recipe,
    id: normalizeId(recipe.id),
    overviewPhotoIds: recipe.overviewPhotoIds.map((id) => normalizeId(id)),
    palette: recipe.palette.map((color) => ({
      ...color,
      id: normalizeId(color.id),
      chipPhotoId: normalizeNullableId(color.chipPhotoId),
    })),
    tools: recipe.tools.map((tool) => ({
      ...tool,
      id: normalizeId(tool.id),
    })),
    baseSteps: recipe.baseSteps.map(normalizeStep),
    parts: recipe.parts.map((part) => ({
      ...part,
      id: normalizeId(part.id),
      steps: part.steps.map(normalizeStep),
    })),
  };
}

/**
 * ID正規化とupdatedAt（§2.7規則e: normalizeImportがインポート時点のnowへ必ず上書きするため
 * 往復前後で一致しえない仕様上の可変フィールド）を除いた比較キーを返す。
 * schemaVersion/createdAt/title/palette内容/tools内容/technique/paints/mix/memo等、
 * ID・updatedAt以外の全フィールドはそのまま突き合わせる。
 */
function comparisonKey(recipe: RecipeDoc): Omit<RecipeDoc, "updatedAt"> {
  const normalized = normalizeIdsForComparison(recipe);
  const rest: Omit<RecipeDoc, "updatedAt"> & { updatedAt?: string } = {
    ...normalized,
  };
  delete rest.updatedAt;
  return rest;
}

/** db.photos.bulkAddに実際に渡されたPhotoRecord[]から、photoId→blobのMapを組み立てる */
function collectBulkAddedBlobs(
  bulkAddSpy: ReturnType<typeof vi.spyOn>,
): Map<string, Blob> {
  const result = new Map<string, Blob>();
  for (const call of bulkAddSpy.mock.calls) {
    const records = call[0] as PhotoRecord[];
    for (const record of records) {
      result.set(record.id, record.blob);
    }
  }
  return result;
}

describe("roundtrip: export→import（写真あり）", () => {
  test("ID正規化の影響を除いてdeep equalかつ写真Blobがバイト列等価になる", async () => {
    const original = createFixtureRecipe();
    await db.recipes.put(original);
    const originalBlobs = await seedPhotosForRecipe(original);

    const exportDeps = makeExportDepsWithOriginalBlobs(
      original.id,
      originalBlobs,
    );
    const blob = await exportRecipeToBlob(
      original.id,
      { includePhotos: true },
      exportDeps,
    );
    const jsonText = await blob.text();

    const bulkAddSpy = vi.spyOn(db.photos, "bulkAdd");
    const result = await importRecipe(jsonText, importDeps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const imported = result.recipe;

    // ID再採番後もIDプレフィックスは維持される（rcp_/col_/tool_/part_/stp_/ph_）
    expect(imported.id).not.toBe(original.id);
    expect(imported.id.startsWith("rcp_")).toBe(true);

    // ID・updatedAtを除いた構造的内容が往復前後で一致する（§2.7規則a・eの影響のみ除外）
    expect(comparisonKey(imported)).toEqual(comparisonKey(original));

    // updatedAtはインポート時点のnowへ更新されている（§2.7規則e）が、createdAtは保持される
    expect(imported.updatedAt).not.toBe(original.updatedAt);
    expect(imported.createdAt).toBe(original.createdAt);

    // 写真Blobがバイト列等価であること。importRecipeがDBへ書き込む直前に
    // db.photos.bulkAddへ渡した実物Blob（fetch(dataUrl)経由でstructured clone未経由）を
    // 捕捉し、DB投入前に保持していたオリジナルBlobと比較する（冒頭コメントの環境制約回避）。
    const importedBlobsById = collectBulkAddedBlobs(bulkAddSpy);
    expect(importedBlobsById.size).toBe(originalBlobs.size);

    // photoIdMap相当の対応付け: reassignRecipeIds/normalizeImportは文書内の出現順で
    // photoIdMapを構築するため、overviewPhotoIds配列順序・baseSteps[0].photoId・
    // palette[2].chipPhotoIdの3箇所を個別に突き合わせれば全参照を横断できる
    // （createFixtureRecipeが持つ全photoId参照はこの3種のみ。fixtures/recipe.ts参照）。
    expect(imported.overviewPhotoIds).toHaveLength(
      original.overviewPhotoIds.length,
    );
    for (let i = 0; i < original.overviewPhotoIds.length; i++) {
      const originalBlob = originalBlobs.get(original.overviewPhotoIds[i]);
      const importedBlob = importedBlobsById.get(imported.overviewPhotoIds[i]);
      expect(originalBlob).toBeDefined();
      expect(importedBlob).toBeDefined();
      if (originalBlob && importedBlob) {
        expect(await importedBlob.arrayBuffer()).toEqual(
          await originalBlob.arrayBuffer(),
        );
        // typeもBlob.typeとして保持される（§2.6: mimeフィールドを持たずBlob.typeが正）
        expect(importedBlob.type).toBe(originalBlob.type);
      }
    }

    // baseSteps[0]（stepMixReducible）のphotoId="ph_step_basecoat"も同様にバイト列等価であること
    const originalStepPhotoId = original.baseSteps[0].photoId;
    const importedStepPhotoId = imported.baseSteps[0].photoId;
    expect(originalStepPhotoId).not.toBeNull();
    expect(importedStepPhotoId).not.toBeNull();
    if (originalStepPhotoId !== null && importedStepPhotoId !== null) {
      const originalBlob = originalBlobs.get(originalStepPhotoId);
      const importedBlob = importedBlobsById.get(importedStepPhotoId);
      expect(originalBlob).toBeDefined();
      expect(importedBlob).toBeDefined();
      if (originalBlob && importedBlob) {
        expect(await importedBlob.arrayBuffer()).toEqual(
          await originalBlob.arrayBuffer(),
        );
      }
    }

    // palette[2]（col_black）のchipPhotoId="ph_chip_black"も同様
    const originalChipPhotoId = original.palette[2].chipPhotoId;
    const importedChipPhotoId = imported.palette[2].chipPhotoId;
    expect(originalChipPhotoId).not.toBeNull();
    expect(importedChipPhotoId).not.toBeNull();
    if (originalChipPhotoId !== null && importedChipPhotoId !== null) {
      const originalBlob = originalBlobs.get(originalChipPhotoId);
      const importedBlob = importedBlobsById.get(importedChipPhotoId);
      expect(originalBlob).toBeDefined();
      expect(importedBlob).toBeDefined();
      if (originalBlob && importedBlob) {
        expect(await importedBlob.arrayBuffer()).toEqual(
          await originalBlob.arrayBuffer(),
        );
      }
    }

    // インポートされたレシピがDBに実際に永続化されていること
    const stored = await db.recipes.get(imported.id);
    expect(stored).toBeDefined();
  });
});

describe("roundtrip: export→import（写真なし）", () => {
  test("photo参照（overviewPhotoIds/steps[].photoId/palette[].chipPhotoId）がdangling正規化で除去される", async () => {
    const original = createFixtureRecipe();
    await db.recipes.put(original);
    const originalBlobs = await seedPhotosForRecipe(original);

    const exportDeps = makeExportDepsWithOriginalBlobs(
      original.id,
      originalBlobs,
    );

    // includePhotos=falseなのでエクスポートJSONのphotos配列は空になるが、
    // recipe内のphotoId参照自体はエクスポート時点では残る（§2.2「写真なしエクスポート時」）
    const blob = await exportRecipeToBlob(
      original.id,
      { includePhotos: false },
      exportDeps,
    );
    const jsonText = await blob.text();
    const exportedFile = JSON.parse(jsonText) as { photos: unknown[] };
    expect(exportedFile.photos).toEqual([]);

    const result = await importRecipe(jsonText, importDeps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const imported = result.recipe;

    // インポート正規化のdangling photo除去（§2.7規則c）: 実体（photos: []）がないため
    // 全photo参照が除去される
    expect(imported.overviewPhotoIds).toEqual([]);
    expect(imported.baseSteps.every((step) => step.photoId === null)).toBe(
      true,
    );
    for (const part of imported.parts) {
      expect(part.steps.every((step) => step.photoId === null)).toBe(true);
    }
    expect(imported.palette.every((color) => color.chipPhotoId === null)).toBe(
      true,
    );

    // 元のレシピは写真参照を持っていた（除去されたのがエクスポート/インポートの正規化の
    // 効果であることの前提確認）
    expect(original.overviewPhotoIds.length).toBeGreaterThan(0);
    expect(original.baseSteps.some((step) => step.photoId !== null)).toBe(true);
    expect(original.palette.some((color) => color.chipPhotoId !== null)).toBe(
      true,
    );

    // photo参照以外の内容（ID正規化の影響を除く）は往復で保たれる
    const importedKey = comparisonKey(imported);
    const originalKeyWithoutPhotos = comparisonKey({
      ...original,
      overviewPhotoIds: [],
      palette: original.palette.map((c) => ({ ...c, chipPhotoId: null })),
      baseSteps: original.baseSteps.map((s) => ({ ...s, photoId: null })),
      parts: original.parts.map((p) => ({
        ...p,
        steps: p.steps.map((s) => ({ ...s, photoId: null })),
      })),
    });
    expect(importedKey).toEqual(originalKeyWithoutPhotos);

    // photosテーブルには何も書き込まれていない
    expect(await db.photos.where("recipeId").equals(imported.id).count()).toBe(
      0,
    );
  });
});

describe("roundtrip: 同一エクスポートファイルの2回インポート", () => {
  test("独立したIDを持つ2レシピがDBに存在する（ID衝突なし）", async () => {
    const original = createFixtureRecipe();
    await db.recipes.put(original);
    const originalBlobs = await seedPhotosForRecipe(original);

    const exportDeps = makeExportDepsWithOriginalBlobs(
      original.id,
      originalBlobs,
    );
    const blob = await exportRecipeToBlob(
      original.id,
      { includePhotos: true },
      exportDeps,
    );
    const jsonText = await blob.text();

    // 元レシピ1件 + これから2回importする分で最終的に3件になる
    const first = await importRecipe(jsonText, importDeps);
    const second = await importRecipe(jsonText, importDeps);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    // レシピIDが衝突しない
    expect(first.recipe.id).not.toBe(second.recipe.id);
    expect(first.recipe.id).not.toBe(original.id);
    expect(second.recipe.id).not.toBe(original.id);

    // 内部の全ID（palette/tools/parts/steps/photo参照）も2回のimportで衝突しない
    expect(first.recipe.palette[0].id).not.toBe(second.recipe.palette[0].id);
    expect(first.recipe.baseSteps[0].id).not.toBe(
      second.recipe.baseSteps[0].id,
    );
    expect(first.recipe.overviewPhotoIds[0]).not.toBe(
      second.recipe.overviewPhotoIds[0],
    );

    // どちらも構造的内容は元と同値（ID正規化の影響を除く）
    expect(comparisonKey(first.recipe)).toEqual(comparisonKey(original));
    expect(comparisonKey(second.recipe)).toEqual(comparisonKey(original));

    // DBには元レシピ + 2回分のimportで計3レシピが存在する
    expect(await db.recipes.count()).toBe(3);
    const storedFirst = await db.recipes.get(first.recipe.id);
    const storedSecond = await db.recipes.get(second.recipe.id);
    expect(storedFirst).toBeDefined();
    expect(storedSecond).toBeDefined();

    // 写真も2回分独立して書き込まれ、recipeIdで正しく紐づく
    const firstPhotos = await db.photos
      .where("recipeId")
      .equals(first.recipe.id)
      .toArray();
    const secondPhotos = await db.photos
      .where("recipeId")
      .equals(second.recipe.id)
      .toArray();
    expect(firstPhotos.length).toBeGreaterThan(0);
    expect(secondPhotos.length).toBe(firstPhotos.length);
    const firstPhotoIds = new Set(firstPhotos.map((p) => p.id));
    const secondPhotoIds = new Set(secondPhotos.map((p) => p.id));
    for (const id of secondPhotoIds) {
      expect(firstPhotoIds.has(id)).toBe(false);
    }
  });
});
