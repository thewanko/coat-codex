// lib/imageProcessing.ts — 写真アップロード時のmime正規化・長辺2048pxリサイズ
// （技術計画v2.2 §2.6「写真アップロード時のmime正規化・リサイズ（指摘17・指摘6）」/ §4.2 T13。
// 本節は§2.6の実装であり、規則の正はドキュメント側にある）
//
// 4段規則（§2.6）:
//   1. png/jpeg/webp かつ長辺2048px以下 → 無変換保存
//   2. 上記3形式で長辺2048px超 → デコード→canvas縮小（長辺2048px）→同形式で再エンコード
//      （jpeg/webpは品質0.9、pngは無劣化）
//   3. それ以外（HEIC/GIF/TIFF/BMP/type空等）→ デコード→（2048px超なら縮小）→JPEG 0.9再エンコード
//      （GIFアニメは先頭フレームの静止画になる）
//   4. デコード不能 → 保存中止＋エラー（i18nキー errors.unsupportedImageFormat）
//
// デコード/エンコードはブラウザAPI（createImageBitmap / canvas）に依存するためjsdomで完全に
// 再現できない。normalizePhotoはデコード・エンコードの実処理を関数引数として受け取れるように
// し（省略時は既定のブラウザ実装を使う）、テストからはこれらをモックして4分岐のロジックのみを
// 検証する（実ブラウザでのcanvas動作確認はセッション側の🖐確認事項）。

/** 縮小要否の判定に使う長辺の上限（px） */
export const MAX_EDGE_PX = 2048;

/** 無変換で保存可能なMIMEタイプ（§2.6-1/2） */
export const PASSTHROUGH_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type PassthroughMime = (typeof PASSTHROUGH_MIMES)[number];

function isPassthroughMime(mime: string): mime is PassthroughMime {
  return (PASSTHROUGH_MIMES as readonly string[]).includes(mime);
}

/** デコード不能な画像に対して投げるエラー（§2.6-4）。
 *  i18nキーはmessageKeyプロパティで保持し、UI側でt(messageKey)して表示する。 */
export class UnsupportedImageFormatError extends Error {
  readonly messageKey = "errors.unsupportedImageFormat";

  constructor() {
    super("対応していない画像形式です");
    this.name = "UnsupportedImageFormatError";
  }
}

/** デコード済み画像のピクセルソース（drawImageに渡せる型の共通部分） */
export type DecodedImageSource = (ImageBitmap | HTMLImageElement) & {
  width: number;
  height: number;
};

/**
 * 長辺がmaxEdgeを超える場合の縮小後サイズを計算する純関数。
 * アスペクト比を維持し、丸めはMath.round、両辺とも最小1pxを保証する。
 * 長辺がmaxEdge以下の場合はneedsResize: falseで元サイズを返す。
 */
export function calcTargetSize(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE_PX,
): { width: number; height: number; needsResize: boolean } {
  const longEdge = Math.max(width, height);

  if (longEdge <= maxEdge) {
    return { width, height, needsResize: false };
  }

  const scale = maxEdge / longEdge;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    needsResize: true,
  };
}

/**
 * BlobをcreateImageBitmapでデコードする（EXIF回転を画素へ吸収）。
 * 失敗時は<img>+objectURLへフォールバックする。両方失敗した場合はUnsupportedImageFormatError。
 */
export async function decodeToBitmap(blob: Blob): Promise<DecodedImageSource> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    // createImageBitmapが対応しない形式（一部ブラウザのHEIC等）向けのフォールバック
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = objectUrl;
    });
    return img;
  } catch {
    throw new UnsupportedImageFormatError();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * デコード済み画像を指定サイズ・mimeでcanvas再エンコードする。
 * jpeg/webpは品質0.9、pngは無劣化（qualityパラメータを渡さない）。
 */
export async function encodeFromSource(
  source: DecodedImageSource,
  targetWidth: number,
  targetHeight: number,
  mime: "image/png" | "image/jpeg" | "image/webp",
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new UnsupportedImageFormatError();
  }

  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

  const quality = mime === "image/png" ? undefined : 0.9;

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new UnsupportedImageFormatError());
        }
      },
      mime,
      quality,
    );
  });
}

export interface NormalizePhotoDeps {
  decode: (blob: Blob) => Promise<DecodedImageSource>;
  encode: (
    source: DecodedImageSource,
    targetWidth: number,
    targetHeight: number,
    mime: "image/png" | "image/jpeg" | "image/webp",
  ) => Promise<Blob>;
}

const defaultDeps: NormalizePhotoDeps = {
  decode: decodeToBitmap,
  encode: encodeFromSource,
};

/**
 * 写真アップロード時のmime正規化・リサイズ本体（§2.6の4段規則）。
 * depsは実ブラウザAPI呼び出しをテストからモックするための注入ポイント（省略時は既定実装）。
 */
export async function normalizePhoto(
  blob: Blob,
  deps: NormalizePhotoDeps = defaultDeps,
): Promise<Blob> {
  const mime = blob.type;

  // 1. png/jpeg/webp かつ長辺2048px以下 → 無変換保存
  //    （サイズ確認のためだけにデコードするのは無駄が多いが、長辺判定にはデコードが必要）
  if (isPassthroughMime(mime)) {
    const source = await deps.decode(blob);
    const target = calcTargetSize(source.width, source.height);

    if (!target.needsResize) {
      return blob;
    }

    // 2. 3形式で長辺2048px超 → 縮小→同形式で再エンコード
    return deps.encode(source, target.width, target.height, mime);
  }

  // 3. それ以外（HEIC/GIF/TIFF/BMP/type空等）→ デコード→（超なら縮小）→JPEG 0.9再エンコード
  const source = await deps.decode(blob);
  const target = calcTargetSize(source.width, source.height);

  return deps.encode(source, target.width, target.height, "image/jpeg");
}
