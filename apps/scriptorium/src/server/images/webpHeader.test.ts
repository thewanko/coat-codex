// @vitest-environment node
// src/server/images/webpHeader.test.ts — WebP ヘッダ検査 unit test（技術計画v1 §4.4）

import { describe, expect, test } from "vitest";
import { parseWebPHeader } from "./webpHeader";

/** 本物の 1x1 VP8L ロスレス WebP（base64）。 */
const MINI_VP8L_1X1 = "UklGRhgAAABXRUJQVlA4TAwAAAAvAAAAEChyySrT/wA=";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
  return u8;
}

function asciiBytes(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

function u16le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function u24le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

/** RIFF/WEBP コンテナ＋任意チャンクを組み立てるヘルパー。 */
function buildContainer(fourCC: string, payload: number[]): Uint8Array {
  const chunkSize = 4 + payload.length; // fourCC(4) + payload
  const bytes = [
    ...asciiBytes("RIFF"),
    ...u16le(chunkSize), // size 4バイトLE（適当・下位2バイトのみ利用）
    0,
    0,
    ...asciiBytes("WEBP"),
    ...asciiBytes(fourCC),
    ...u16le(payload.length),
    0,
    0,
    ...payload,
  ];
  return new Uint8Array(bytes);
}

/** VP8 (lossy) の合成フィクスチャ。width/height は14bitスタートコード後の16bitLEに格納。 */
function buildVP8Lossy(width: number, height: number): Uint8Array {
  const payload = [
    0x00,
    0x00,
    0x00, // フレームタグ相当（読み取り対象外の3バイト）
    0x9d,
    0x01,
    0x2a, // スタートコード
    ...u16le(width),
    ...u16le(height),
  ];
  return buildContainer("VP8 ", payload);
}

/** VP8L (lossless) の合成フィクスチャ。 */
function buildVP8Lossless(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  const b0 = w & 0xff;
  const b1 = ((w >> 8) & 0x3f) | ((h & 0x03) << 6);
  const b2 = (h >> 2) & 0xff;
  const b3 = (h >> 10) & 0x0f;
  const payload = [0x2f, b0, b1, b2, b3];
  return buildContainer("VP8L", payload);
}

/** VP8X (extended) の合成フィクスチャ。canvas寸法は (value-1) の3バイトLE。 */
function buildVP8Extended(width: number, height: number): Uint8Array {
  const payload = [
    0x00,
    0x00,
    0x00,
    0x00, // フラグ + reserved
    ...u24le(width - 1),
    ...u24le(height - 1),
  ];
  return buildContainer("VP8X", payload);
}

describe("parseWebPHeader", () => {
  test("実 WebP（VP8L 1x1）を正しく読む", () => {
    const bytes = base64ToBytes(MINI_VP8L_1X1);
    expect(parseWebPHeader(bytes)).toEqual({
      format: "lossless",
      width: 1,
      height: 1,
    });
  });

  test("VP8（lossy）合成フィクスチャ 640x480 を正しく読む", () => {
    const bytes = buildVP8Lossy(640, 480);
    expect(parseWebPHeader(bytes)).toEqual({
      format: "lossy",
      width: 640,
      height: 480,
    });
  });

  test("VP8X（extended）合成フィクスチャ 2000x1500 を正しく読む", () => {
    const bytes = buildVP8Extended(2000, 1500);
    expect(parseWebPHeader(bytes)).toEqual({
      format: "extended",
      width: 2000,
      height: 1500,
    });
  });

  test("VP8L 合成フィクスチャ（自前ビットパック）も正しく読む", () => {
    const bytes = buildVP8Lossless(320, 240);
    expect(parseWebPHeader(bytes)).toEqual({
      format: "lossless",
      width: 320,
      height: 240,
    });
  });

  test("空配列は null", () => {
    expect(parseWebPHeader(new Uint8Array([]))).toBeNull();
  });

  test("RIFF だが WEBP シグネチャ不一致は null", () => {
    const bytes = new Uint8Array([
      ...asciiBytes("RIFF"),
      0x00,
      0x00,
      0x00,
      0x00,
      ...asciiBytes("XXXX"),
    ]);
    expect(parseWebPHeader(bytes)).toBeNull();
  });

  test("未知の fourCC は null", () => {
    const bytes = buildContainer("XXXX", [0x00, 0x00, 0x00, 0x00]);
    expect(parseWebPHeader(bytes)).toBeNull();
  });

  test("12バイト未満に切り詰められた入力は null", () => {
    const bytes = buildVP8Lossy(640, 480).slice(0, 11);
    expect(parseWebPHeader(bytes)).toBeNull();
  });

  test("VP8 でスタートコード不一致は null", () => {
    const bytes = buildVP8Lossy(640, 480);
    bytes[23] = 0x00; // スタートコード先頭を破壊
    expect(parseWebPHeader(bytes)).toBeNull();
  });

  test("非 WebP の任意バイト列は null", () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(parseWebPHeader(bytes)).toBeNull();
  });
});
