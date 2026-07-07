// src/server/images/webpHeader.ts — WebP ヘッダ検査（技術計画v1 §4.4）
//
// Workers 内では画像デコードが不能のため、ヘッダのマジックバイトと寸法のみを
// バイト列から読み取る純関数として実装する。妥当な WebP でなければ throw せず null を返す。

export interface WebPHeaderInfo {
  format: "lossy" | "lossless" | "extended";
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
