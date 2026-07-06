// lib/exporters/json.ts — JSONエクスポート（技術計画v2.2 §2.2/§4.2 T29）
//
// RecipeExportFile（§2.2）を生成しファイルBlobを返す。純関数部
// （stripDanglingPhotoRefs/buildExportPlan/assembleExportBlob）は
// packages/recipe-core/src/exchange/exportFile.ts へ移動済み（v1 §1.4-2(c)）。
// 本ファイルにはDexie読み出し・実FileReaderに依存する部分のみ残る。
//
// base64化のメモリピーク対策（v1レビュー指摘9・技術計画v2.2 T29行）:
//   写真ごとにFileReader.readAsDataURLでdataUrl化した文字列を「JSON全体を1個の巨大文字列として
//   JSON.stringifyした後にBlob化」するのではなく、exchange/exportFile.tsのassembleExportBlobが
//     ["...ヘッダ+recipe+\"photos\":[ ...", photo1DataUrlJsonFragment, ",", photo2..., "]}"]
//   のようなパーツ配列として組み立て、`new Blob([...parts])`で連結する。
//   これによりJS文字列連結・JSON.stringifyの過程で「全写真のbase64を含む1個の巨大文字列」を
//   一度もメモリ上に生成せず、Blob自体（ブラウザ実装側でストリーミング的に扱われる）にパーツを
//   渡すだけで済む（v1レビュー指摘9のメモリピーク対策方針）。

import {
  assembleExportBlob,
  buildExportPlan,
  type RecipeDoc,
} from "@coat-codex/recipe-core";
import type { PhotoRecord } from "../../db/db";
import { collectPhotosForExport } from "../../db/photoStore";
import { loadRecipe } from "../../db/recipeStore";

/**
 * exportRecipeToBlobが依存する外部処理をテストから注入できるようにするための束。
 * 省略時は本番用実装（Dexie読み出し・実FileReader）を使う
 * （imageProcessing.ts の NormalizePhotoDeps と同じ依存注入パターン）。
 */
export interface JsonExportDeps {
  loadRecipe: (id: string) => Promise<RecipeDoc | null>;
  collectPhotosForExport: (recipeId: string) => Promise<PhotoRecord[]>;
  blobToDataUrl: (blob: Blob) => Promise<string>;
}

/** BlobをFileReader.readAsDataURLでdataURL文字列へ変換する（本番既定実装） */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(
          new Error("blobToDataUrl: FileReader.result が文字列ではありません"),
        );
      }
    };
    reader.onerror = () => {
      reject(
        reader.error ??
          new Error("blobToDataUrl: FileReaderでの読み込みに失敗しました"),
      );
    };
    reader.readAsDataURL(blob);
  });
}

const defaultDeps: JsonExportDeps = {
  loadRecipe,
  collectPhotosForExport,
  blobToDataUrl,
};

/** 指定レシピが存在しない場合にexportRecipeToBlobが投げる */
export class RecipeNotFoundError extends Error {
  constructor(id: string) {
    super(`recipe "${id}" が見つかりません`);
    this.name = "RecipeNotFoundError";
  }
}

/**
 * レシピをRecipeExportFile形式のJSON Blobとしてエクスポートする（§2.2/T29）。
 * includePhotos=trueのときは当該レシピの写真を全てdataURL化して同梱し（写真ごとに
 * FileReader.readAsDataURLを呼びメモリピークを抑える）、falseのときはphotos: []で
 * 出力する（recipe内のphotoId参照は残したまま。§2.2）。
 * 指定レシピが存在しない場合はRecipeNotFoundErrorを投げる。
 */
export async function exportRecipeToBlob(
  recipeId: string,
  options: { includePhotos: boolean },
  deps: JsonExportDeps = defaultDeps,
): Promise<Blob> {
  const recipe = await deps.loadRecipe(recipeId);
  if (recipe === null) {
    throw new RecipeNotFoundError(recipeId);
  }

  const photos = await deps.collectPhotosForExport(recipeId);
  const exportedAt = new Date().toISOString();

  const plan = buildExportPlan(
    recipe,
    photos,
    options.includePhotos,
    exportedAt,
  );

  // 写真ごとに順次dataUrl化する（Promise.allで全件並列変換すると全dataUrl文字列が
  // 同時にメモリ上へ乗るためメモリピーク対策の趣旨に反する。逐次awaitで1枚ずつ確保する）
  const photoDataUrls: string[] = [];
  for (const photo of plan.photosToEmbed) {
    photoDataUrls.push(await deps.blobToDataUrl(photo.blob));
  }

  return assembleExportBlob(
    plan.header,
    plan.recipe,
    plan.photosToEmbed,
    photoDataUrls,
  );
}
