// lib/exporters/json.ts — JSONエクスポート（技術計画v2.2 §2.2/§4.2 T29）
//
// RecipeExportFile（§2.2）を生成しファイルBlobを返す。
//
// 実体なきphotoId参照の除去（§2.2/§2.6）:
//   overviewPhotoIds / steps[].photoId（baseSteps・全parts） / palette[].chipPhotoId の3種が
//   参照箇所。photosテーブルに実体のないID参照はエクスポート時点で文書から除去する
//   （配列参照は要素除去、単一参照フィールドはnull化）。
//
// 写真あり/なし2択（§2.2）:
//   includePhotos=falseのときはphotos: []のまま出力し、recipe内のphotoId参照は残す
//   （インポート正規化で自動除去されるため無害。§2.2「写真なしエクスポート時」）。
//
// base64化のメモリピーク対策（v1レビュー指摘9・技術計画v2.2 T29行）:
//   写真ごとにFileReader.readAsDataURLでdataUrl化した文字列を「JSON全体を1個の巨大文字列として
//   JSON.stringifyした後にBlob化」するのではなく、
//     ["...ヘッダ+recipe+\"photos\":[ ...", photo1DataUrlJsonFragment, ",", photo2..., "]}"]
//   のようなパーツ配列として組み立て、`new Blob([...parts])`で連結する。
//   これによりJS文字列連結・JSON.stringifyの過程で「全写真のbase64を含む1個の巨大文字列」を
//   一度もメモリ上に生成せず、Blob自体（ブラウザ実装側でストリーミング的に扱われる）にパーツを
//   渡すだけで済む（v1レビュー指摘9のメモリピーク対策方針）。

import type { RecipeDoc, RecipeExportFile } from "../../models/recipe";
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
 * 実体のあるphotoId集合をもとに、RecipeDocからdangling photoId参照を除去した文書を返す
 * （§2.2「実体のないphotoId参照は出力文書から除去する」/ §2.6「photoId欠損時フォールバック」）。
 * 参照箇所は overviewPhotoIds（配列＝要素除去） / steps[].photoId（null化） /
 * palette[].chipPhotoId（null化）の3種（v2.2: 旧parts[].photoIdsは廃止）。
 * 純関数（DB・ブラウザAPIに非依存）でテスト容易性を確保する。
 */
export function stripDanglingPhotoRefs(
  doc: RecipeDoc,
  existingPhotoIds: ReadonlySet<string>,
): RecipeDoc {
  const stripStep = (step: RecipeDoc["baseSteps"][number]) =>
    step.photoId !== null && !existingPhotoIds.has(step.photoId)
      ? { ...step, photoId: null }
      : step;

  return {
    ...doc,
    overviewPhotoIds: doc.overviewPhotoIds.filter((id) =>
      existingPhotoIds.has(id),
    ),
    palette: doc.palette.map((color) =>
      color.chipPhotoId !== null && !existingPhotoIds.has(color.chipPhotoId)
        ? { ...color, chipPhotoId: null }
        : color,
    ),
    baseSteps: doc.baseSteps.map(stripStep),
    parts: doc.parts.map((part) => ({
      ...part,
      steps: part.steps.map(stripStep),
    })),
  };
}

/**
 * RecipeExportFileの「recipe」部分（dangling photoId参照除去済み）と、実際に同梱すべき
 * PhotoRecord一覧（includePhotos=falseなら常に空配列）を算出する純関数。
 * exportedAtは呼び出し側から注入する（テスト容易性・時刻固定のため）。
 */
export function buildExportPlan(
  recipe: RecipeDoc,
  photos: readonly PhotoRecord[],
  includePhotos: boolean,
  exportedAt: string,
): {
  header: Pick<
    RecipeExportFile,
    "app" | "kind" | "schemaVersion" | "exportedAt"
  >;
  recipe: RecipeDoc;
  photosToEmbed: readonly PhotoRecord[];
} {
  const existingPhotoIds = new Set(photos.map((p) => p.id));
  const strippedRecipe = stripDanglingPhotoRefs(recipe, existingPhotoIds);

  return {
    header: {
      app: "coat-codex",
      kind: "recipe-export",
      // schemaVersion === recipe.schemaVersion を保証する（§2.5-19）
      schemaVersion: strippedRecipe.schemaVersion,
      exportedAt,
    },
    recipe: strippedRecipe,
    photosToEmbed: includePhotos ? photos : [],
  };
}

/**
 * RecipeExportFileをパーツ配列連結でBlob化する（v1レビュー指摘9のメモリピーク対策。本ファイル
 * 冒頭コメント参照）。photoDataUrls は photosToEmbed と同じ順序のdataURL文字列配列。
 */
export function assembleExportBlob(
  header: Pick<
    RecipeExportFile,
    "app" | "kind" | "schemaVersion" | "exportedAt"
  >,
  recipe: RecipeDoc,
  photosToEmbed: readonly PhotoRecord[],
  photoDataUrls: readonly string[],
): Blob {
  const jsonHead =
    `{"app":${JSON.stringify(header.app)},` +
    `"kind":${JSON.stringify(header.kind)},` +
    `"schemaVersion":${JSON.stringify(header.schemaVersion)},` +
    `"exportedAt":${JSON.stringify(header.exportedAt)},` +
    `"recipe":${JSON.stringify(recipe)},` +
    `"photos":[`;

  const parts: BlobPart[] = [jsonHead];

  photosToEmbed.forEach((photo, index) => {
    if (index > 0) {
      parts.push(",");
    }
    // dataUrl文字列自体は1枚分のみメモリに保持し、それを直接Blobパーツとして渡す
    // （複数枚分を1つのJS文字列へ連結しない＝メモリピーク対策の核）
    parts.push(`{"id":${JSON.stringify(photo.id)},"dataUrl":`);
    parts.push(JSON.stringify(photoDataUrls[index]));
    parts.push("}");
  });

  parts.push("]}");

  return new Blob(parts, { type: "application/json" });
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
