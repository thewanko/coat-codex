// @vitest-environment node
// src/server/images/imageHeader.test.ts — 画像ヘッダ検査 unit test（技術計画v1 §4.4）

import { describe, expect, test } from "vitest";
import {
  parseWebPHeader,
  parseJpegHeader,
  parseImageHeader,
  imageFormatMeta,
} from "./imageHeader";

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

/** SOFn セグメントの中身（precision(1)/height(2 BE)/width(2 BE)/numComponents(1)+成分3バイト×n）。 */
function buildSofPayload(width: number, height: number): number[] {
  const numComponents = 3;
  const components = [1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]; // 3成分×3バイト（id, サンプリング, 量子化テーブル）
  return [
    0x08, // precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    numComponents,
    ...components,
  ];
}

/** マーカー(2) + length(2 BE) + payload のセグメントバイト列を組む。 */
function buildSegment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2; // length自身の2バイトを含む
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

/** SOI + APP0(JFIF) + SOF0(width×height) + EOI の最小JPEGフィクスチャ。 */
function buildJpeg(
  width: number,
  height: number,
  opts?: { sofMarker?: number; withApp0?: boolean },
): Uint8Array {
  const sofMarker = opts?.sofMarker ?? 0xc0;
  const app0Payload = [
    ...asciiBytes("JFIF"),
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
  ];
  const bytes = [
    0xff,
    0xd8, // SOI
    ...(opts?.withApp0 === false ? [] : buildSegment(0xe0, app0Payload)),
    ...buildSegment(sofMarker, buildSofPayload(width, height)),
    0xff,
    0xd9, // EOI
  ];
  return new Uint8Array(bytes);
}

describe("parseJpegHeader", () => {
  test("SOI+APP0(JFIF)+SOF0+EOI の最小JPEG（100x100）を正しく読む", () => {
    const bytes = buildJpeg(100, 100);
    expect(parseJpegHeader(bytes)).toEqual({
      format: "jpeg",
      width: 100,
      height: 100,
    });
  });

  test("APP0無し・SOF0のみでも正しく読む（640x480）", () => {
    const bytes = buildJpeg(640, 480, { withApp0: false });
    expect(parseJpegHeader(bytes)).toEqual({
      format: "jpeg",
      width: 640,
      height: 480,
    });
  });

  test("SOF2（プログレッシブ）も読める", () => {
    const bytes = buildJpeg(320, 240, { sofMarker: 0xc2 });
    expect(parseJpegHeader(bytes)).toEqual({
      format: "jpeg",
      width: 320,
      height: 240,
    });
  });

  test("RST0-7・TEMなどスタンドアロンマーカーを挟んでもSOFnを見つける", () => {
    const app0Payload = [
      ...asciiBytes("JFIF"),
      0x00,
      0x01,
      0x01,
      0x00,
      0x00,
      0x01,
      0x00,
      0x01,
      0x00,
      0x00,
    ];
    const bytes = new Uint8Array([
      0xff,
      0xd8, // SOI
      0xff,
      0x01, // TEM（スタンドアロン）
      0xff,
      0xd0, // RST0（スタンドアロン）
      ...buildSegment(0xe0, app0Payload),
      ...buildSegment(0xc0, buildSofPayload(50, 60)),
      0xff,
      0xd9,
    ]);
    expect(parseJpegHeader(bytes)).toEqual({
      format: "jpeg",
      width: 50,
      height: 60,
    });
  });

  test("マーカー間の0xFF埋め（フィルバイト）を許容する", () => {
    // 0xFF の後に 0xFF が連続する場合、最後の非0xFFバイトが実マーカー種別
    // （ここでは 0xFF 0xFF 0xFF 0xC0 = フィル2個を挟んだ SOF0）。
    const sofPayload = buildSofPayload(10, 20);
    const sofLength = sofPayload.length + 2;
    const bytes = new Uint8Array([
      0xff,
      0xd8, // SOI
      0xff,
      0xff,
      0xff,
      0xc0, // フィルバイト2個を挟んだSOF0マーカー
      (sofLength >> 8) & 0xff,
      sofLength & 0xff,
      ...sofPayload,
      0xff,
      0xd9,
    ]);
    expect(parseJpegHeader(bytes)).toEqual({
      format: "jpeg",
      width: 10,
      height: 20,
    });
  });

  test("DHT(0xC4)はSOFnとして扱わずスキップする", () => {
    const dhtPayload = [0x00, 0x01, 0x01, 0x01, ...new Array(16).fill(0)];
    const bytes = new Uint8Array([
      0xff,
      0xd8,
      ...buildSegment(0xc4, dhtPayload), // DHT（SOFn除外対象）
      ...buildSegment(0xc0, buildSofPayload(70, 80)),
      0xff,
      0xd9,
    ]);
    expect(parseJpegHeader(bytes)).toEqual({
      format: "jpeg",
      width: 70,
      height: 80,
    });
  });

  test("SOFnが存在せずEOIに到達する場合はnull", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    expect(parseJpegHeader(bytes)).toBeNull();
  });

  test("SOIシグネチャ不一致はnull", () => {
    const bytes = new Uint8Array([0xff, 0xe0, 0x00, 0x00]);
    expect(parseJpegHeader(bytes)).toBeNull();
  });

  test("空配列はnull", () => {
    expect(parseJpegHeader(new Uint8Array([]))).toBeNull();
  });

  test("SOIのみで切り詰められた入力はnull", () => {
    const bytes = new Uint8Array([0xff, 0xd8]);
    expect(parseJpegHeader(bytes)).toBeNull();
  });

  test("SOF0セグメントの途中で切り詰められた入力はnull", () => {
    const full = buildJpeg(100, 100, { withApp0: false });
    // SOF0マーカー(2)+length(2)までは残し、precision以降を切り詰める
    const bytes = full.slice(0, 6);
    expect(parseJpegHeader(bytes)).toBeNull();
  });

  test("セグメント長が2未満（不正）はnull", () => {
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0xff, 0xd9,
    ]);
    expect(parseJpegHeader(bytes)).toBeNull();
  });

  test("セグメント長が実際のバイト数を超え範囲外を指す場合はnull", () => {
    const bytes = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0xff, // 長さ255だが実際のデータは無い
      0xff,
      0xd9,
    ]);
    expect(parseJpegHeader(bytes)).toBeNull();
  });

  test("寸法が0（幅または高さ）はnull", () => {
    const bytes = buildJpeg(0, 100, { withApp0: false });
    expect(parseJpegHeader(bytes)).toBeNull();
  });

  test("非JPEGの任意バイト列はnull", () => {
    const bytes = base64ToBytes(MINI_VP8L_1X1);
    expect(parseJpegHeader(bytes)).toBeNull();
  });
});

describe("parseImageHeader", () => {
  test("WebPバイト列はformat:webpで返す", () => {
    const bytes = base64ToBytes(MINI_VP8L_1X1);
    expect(parseImageHeader(bytes)).toEqual({
      format: "webp",
      width: 1,
      height: 1,
    });
  });

  test("JPEGバイト列はformat:jpegで返す", () => {
    const bytes = buildJpeg(200, 150);
    expect(parseImageHeader(bytes)).toEqual({
      format: "jpeg",
      width: 200,
      height: 150,
    });
  });

  test("VP8（lossy）合成フィクスチャもformat:webpとして振り分けられる", () => {
    const bytes = buildVP8Lossy(640, 480);
    expect(parseImageHeader(bytes)).toEqual({
      format: "webp",
      width: 640,
      height: 480,
    });
  });

  test("いずれのシグネチャにも一致しないゴミバイト列はnull", () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(parseImageHeader(bytes)).toBeNull();
  });

  test("空配列はnull", () => {
    expect(parseImageHeader(new Uint8Array([]))).toBeNull();
  });
});

describe("imageFormatMeta", () => {
  test("webp → image/webp, .webp", () => {
    expect(imageFormatMeta("webp")).toEqual({
      contentType: "image/webp",
      ext: ".webp",
    });
  });

  test("jpeg → image/jpeg, .jpg", () => {
    expect(imageFormatMeta("jpeg")).toEqual({
      contentType: "image/jpeg",
      ext: ".jpg",
    });
  });
});
