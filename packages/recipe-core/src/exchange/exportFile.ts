// exchange/exportFile.ts — JSONエクスポートの純関数部（技術計画v2.2 §2.2/§4.2 T29／v1 §1.4-2(c)）
//
// RecipeExportFile（§2.2）を組み立てる純関数群。Dexie/FileReaderに依存する
// exportRecipeToBlob・blobToDataUrl・RecipeNotFoundError・JsonExportDeps は
// codex側（apps/codex/src/lib/exporters/json.ts）に残る。
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

import type { RecipeDoc, RecipeExportFile } from "../schema/recipe";

/**
 * 実体のあるphotoId集合をもとに、RecipeDocからdangling photoId参照を除去した文書を返す
 * （§2.2「実体のないphotoId参照は出力文書から除去する」/ §2.6「photoId欠損時フォールバック」）。
 * 参照箇所は overviewPhotoIds（配列＝要素除去） / steps[].photoId（null化） /
 * palette[].chipPhotoId（null化）の3種（v2.2: 旧parts[].photoIdsは廃止）。
 * photoCropsは「文書内で参照されている（=strip後もなお存在する）photoId」のキーのみ残す
 * （実体のないphotoId・文書内で未参照になったphotoIdのクロップは無害だが不要なので除去する）。
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

  const strippedOverviewPhotoIds = doc.overviewPhotoIds.filter((id) =>
    existingPhotoIds.has(id),
  );
  const strippedPalette = doc.palette.map((color) =>
    color.chipPhotoId !== null && !existingPhotoIds.has(color.chipPhotoId)
      ? { ...color, chipPhotoId: null }
      : color,
  );
  const strippedBaseSteps = doc.baseSteps.map(stripStep);
  const strippedParts = doc.parts.map((part) => ({
    ...part,
    steps: part.steps.map(stripStep),
  }));

  const referencedPhotoIds = new Set<string>(strippedOverviewPhotoIds);
  for (const step of [
    ...strippedBaseSteps,
    ...strippedParts.flatMap((part) => part.steps),
  ]) {
    if (step.photoId !== null) {
      referencedPhotoIds.add(step.photoId);
    }
  }

  const nextPhotoCrops: RecipeDoc["photoCrops"] = {};
  for (const [photoId, rect] of Object.entries(doc.photoCrops)) {
    if (referencedPhotoIds.has(photoId)) {
      nextPhotoCrops[photoId] = rect;
    }
  }

  return {
    ...doc,
    overviewPhotoIds: strippedOverviewPhotoIds,
    palette: strippedPalette,
    baseSteps: strippedBaseSteps,
    parts: strippedParts,
    photoCrops: nextPhotoCrops,
  };
}

/**
 * RecipeExportFileの「recipe」部分（dangling photoId参照除去済み）と、実際に同梱すべき
 * 写真一覧（includePhotos=falseなら常に空配列）を算出する純関数。
 * exportedAtは呼び出し側から注入する（テスト容易性・時刻固定のため）。
 * photosはid参照のみを使うためジェネリック化する（codex側のPhotoRecord等、
 * `{ id: string }` を満たす任意の型を受け取れる）。
 */
export function buildExportPlan<P extends { id: string }>(
  recipe: RecipeDoc,
  photos: readonly P[],
  includePhotos: boolean,
  exportedAt: string,
): {
  header: Pick<
    RecipeExportFile,
    "app" | "kind" | "schemaVersion" | "exportedAt"
  >;
  recipe: RecipeDoc;
  photosToEmbed: P[];
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
    photosToEmbed: includePhotos ? [...photos] : [],
  };
}

/**
 * RecipeExportFileをパーツ配列連結でBlob化する（v1レビュー指摘9のメモリピーク対策。本ファイル
 * 冒頭コメント参照）。photoDataUrls は photosToEmbed と同じ順序のdataURL文字列配列。
 */
export function assembleExportBlob<P extends { id: string }>(
  header: Pick<
    RecipeExportFile,
    "app" | "kind" | "schemaVersion" | "exportedAt"
  >,
  recipe: RecipeDoc,
  photosToEmbed: readonly P[],
  photoDataUrls: readonly string[],
): Blob {
  const jsonHead =
    `{"app":${JSON.stringify(header.app)},` +
    `"kind":${JSON.stringify(header.kind)},` +
    `"schemaVersion":${JSON.stringify(header.schemaVersion)},` +
    `"exportedAt":${JSON.stringify(header.exportedAt)},` +
    `"recipe":${JSON.stringify(recipe)},` +
    `"photos":[`;

  const parts: (string | Blob)[] = [jsonHead];

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
