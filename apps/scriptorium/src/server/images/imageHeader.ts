// src/server/images/imageHeader.ts — 画像ヘッダ検査（技術計画v1 §4.4）
//
// Workers 内では画像デコードが不能のため、ヘッダのマジックバイトと寸法のみを
// バイト列から読み取る純関数として実装する。妥当な画像でなければ throw せず null を返す。
//
// iOS/デスクトップSafariは canvas.toBlob("image/webp") のWebPエンコードに非対応で
// PNGへフォールバックするため、クライアントはJPEGでcover/thumbを送ることがある。
// サーバーはJPEG/WebPの両方を受理する（parseImageHeaderで振り分け）。

export interface WebPHeaderInfo {
  format: "lossy" | "lossless" | "extended";
  width: number; // ピクセル
  height: number; // ピクセル
}

export interface JpegHeaderInfo {
  format: "jpeg";
  width: number; // ピクセル
  height: number; // ピクセル
}

export type DetectedImageFormat = "webp" | "jpeg";

export interface ImageHeaderInfo {
  format: DetectedImageFormat;
  width: number; // ピクセル
  height: number; // ピクセル
}

const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP"
const VP8_START_CODE = [0x9d, 0x01, 0x2a];

const MAX_SIMPLE_DIMENSION = 16383; // VP8 / VP8L の14bit上限
const MAX_EXTENDED_DIMENSION = 16777216; // VP8X の24bit(値-1)上限

/** `bytes[offset..offset+length)` が範囲内かどうか。 */
function hasRange(bytes: Uint8Array, offset: number, length: number): boolean {
  return offset >= 0 && offset + length <= bytes.length;
}

/** `bytes[offset..offset+bytesList.length)` が指定バイト列と一致するか（境界チェック込み）。 */
function matchesBytes(
  bytes: Uint8Array,
  offset: number,
  expected: number[],
): boolean {
  if (!hasRange(bytes, offset, expected.length)) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (bytes[offset + i] !== expected[i]) return false;
  }
  return true;
}

/** 指定オフセットから ASCII 4文字を読む（境界チェック込み、範囲外は null）。 */
function readFourCC(bytes: Uint8Array, offset: number): string | null {
  if (!hasRange(bytes, offset, 4)) return null;
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

/** リトルエンディアン 16bit 符号なし整数を読む（境界チェック込み、範囲外は null）。 */
function readUint16LE(bytes: Uint8Array, offset: number): number | null {
  if (!hasRange(bytes, offset, 2)) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/** リトルエンディアン 24bit 符号なし整数を読む（境界チェック込み、範囲外は null）。 */
function readUint24LE(bytes: Uint8Array, offset: number): number | null {
  if (!hasRange(bytes, offset, 3)) return null;
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function isValidSimpleDimension(value: number): boolean {
  return value >= 1 && value <= MAX_SIMPLE_DIMENSION;
}

function isValidExtendedDimension(value: number): boolean {
  return value >= 1 && value <= MAX_EXTENDED_DIMENSION;
}

function parseVP8Lossy(bytes: Uint8Array): WebPHeaderInfo | null {
  if (!matchesBytes(bytes, 23, VP8_START_CODE)) return null;
  const rawWidth = readUint16LE(bytes, 26);
  const rawHeight = readUint16LE(bytes, 28);
  if (rawWidth === null || rawHeight === null) return null;
  const width = rawWidth & 0x3fff;
  const height = rawHeight & 0x3fff;
  if (!isValidSimpleDimension(width) || !isValidSimpleDimension(height))
    return null;
  return { format: "lossy", width, height };
}

function parseVP8Lossless(bytes: Uint8Array): WebPHeaderInfo | null {
  if (!hasRange(bytes, 20, 1) || bytes[20] !== 0x2f) return null;
  if (!hasRange(bytes, 21, 4)) return null;
  const b0 = bytes[21];
  const b1 = bytes[22];
  const b2 = bytes[23];
  const b3 = bytes[24];
  const width = (((b1 & 0x3f) << 8) | b0) + 1;
  const height = (((b3 & 0x0f) << 10) | (b2 << 2) | (b1 >> 6)) + 1;
  if (!isValidSimpleDimension(width) || !isValidSimpleDimension(height))
    return null;
  return { format: "lossless", width, height };
}

function parseVP8Extended(bytes: Uint8Array): WebPHeaderInfo | null {
  const rawWidth = readUint24LE(bytes, 24);
  const rawHeight = readUint24LE(bytes, 27);
  if (rawWidth === null || rawHeight === null) return null;
  const width = rawWidth + 1;
  const height = rawHeight + 1;
  if (!isValidExtendedDimension(width) || !isValidExtendedDimension(height))
    return null;
  return { format: "extended", width, height };
}

/** WebP のマジックバイトと寸法を読む。妥当な WebP でなければ null（throw しない）。 */
export function parseWebPHeader(bytes: Uint8Array): WebPHeaderInfo | null {
  if (bytes.length < 12) return null;
  if (!matchesBytes(bytes, 0, RIFF)) return null;
  if (!matchesBytes(bytes, 8, WEBP)) return null;

  const fourCC = readFourCC(bytes, 12);
  if (fourCC === null) return null;

  switch (fourCC) {
    case "VP8 ":
      return parseVP8Lossy(bytes);
    case "VP8L":
      return parseVP8Lossless(bytes);
    case "VP8X":
      return parseVP8Extended(bytes);
    default:
      return null;
  }
}

// --- JPEG (ISO/IEC 10918-1) ---

const JPEG_SOI = [0xff, 0xd8];
const MARKER_PREFIX = 0xff;

const MAX_JPEG_DIMENSION = 65535; // SOFnの16bit幅/高さフィールドの上限

/** マーカーがセグメント長を持たない（スタンドアロン）かどうか。 */
function isStandaloneMarker(marker: number): boolean {
  // TEM(0x01) / RST0-7(0xD0-0xD7) / SOI(0xD8) / EOI(0xD9)
  return (
    marker === 0x01 ||
    (marker >= 0xd0 && marker <= 0xd7) ||
    marker === 0xd8 ||
    marker === 0xd9
  );
}

/** SOFn（フレーム開始）マーカーかどうか。DHT(0xC4)/JPG(0xC8)/DAC(0xCC)は除く。 */
function isSofMarker(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function isValidJpegDimension(value: number): boolean {
  return value >= 1 && value <= MAX_JPEG_DIMENSION;
}

/**
 * JPEG のマジックバイトと寸法を読む。SOFn セグメントの precision/height/width を
 * 走査して取得する。妥当な JPEG でなければ null（throw しない）。
 */
export function parseJpegHeader(bytes: Uint8Array): JpegHeaderInfo | null {
  if (!matchesBytes(bytes, 0, JPEG_SOI)) return null;

  let offset = 2;
  // 走査上限のガード（不正な入力での無限ループ防止。妥当なJPEGはこれで十分な余裕がある）
  const maxIterations = bytes.length + 1;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (!hasRange(bytes, offset, 1)) return null;
    if (bytes[offset] !== MARKER_PREFIX) return null;

    // 0xFF埋めバイト（フィル）をスキップして実際のマーカーバイトを探す
    let markerOffset = offset + 1;
    while (hasRange(bytes, markerOffset, 1) && bytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }
    if (!hasRange(bytes, markerOffset, 1)) return null;
    const marker = bytes[markerOffset];

    if (marker === 0xd9) return null; // EOIに到達＝SOFnが見つからなかった

    if (isStandaloneMarker(marker)) {
      offset = markerOffset + 1;
      continue;
    }

    const length = readUint16BE(bytes, markerOffset + 1);
    if (length === null || length < 2) return null;
    const segmentStart = markerOffset + 3; // マーカー(2) + length(2) の直後

    if (isSofMarker(marker)) {
      if (!hasRange(bytes, segmentStart, 5)) return null;
      const height = readUint16BE(bytes, segmentStart + 1);
      const width = readUint16BE(bytes, segmentStart + 3);
      if (height === null || width === null) return null;
      if (!isValidJpegDimension(width) || !isValidJpegDimension(height))
        return null;
      return { format: "jpeg", width, height };
    }

    const segmentPayloadLength = length - 2;
    if (!hasRange(bytes, segmentStart, segmentPayloadLength)) return null;
    offset = segmentStart + segmentPayloadLength;
  }
  return null;
}

/** ビッグエンディアン 16bit 符号なし整数を読む（境界チェック込み、範囲外は null）。 */
function readUint16BE(bytes: Uint8Array, offset: number): number | null {
  if (!hasRange(bytes, offset, 2)) return null;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

/**
 * WebP/JPEG いずれかのマジックバイトで振り分けて寸法を読む。
 * 妥当な画像でなければ null（throw しない）。
 */
export function parseImageHeader(bytes: Uint8Array): ImageHeaderInfo | null {
  if (matchesBytes(bytes, 0, RIFF) && matchesBytes(bytes, 8, WEBP)) {
    const webp = parseWebPHeader(bytes);
    if (!webp) return null;
    return { format: "webp", width: webp.width, height: webp.height };
  }
  if (matchesBytes(bytes, 0, JPEG_SOI)) {
    return parseJpegHeader(bytes);
  }
  return null;
}

export interface ImageFormatMeta {
  contentType: string;
  ext: string;
}

/** 検出済みフォーマットから R2 保存時の content-type と拡張子を導出する。 */
export function imageFormatMeta(format: DetectedImageFormat): ImageFormatMeta {
  if (format === "jpeg") {
    return { contentType: "image/jpeg", ext: ".jpg" };
  }
  return { contentType: "image/webp", ext: ".webp" };
}
