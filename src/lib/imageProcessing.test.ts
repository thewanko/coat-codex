import { describe, expect, test, vi } from "vitest";
import {
  calcTargetSize,
  MAX_EDGE_PX,
  normalizePhoto,
  PASSTHROUGH_MIMES,
  UnsupportedImageFormatError,
  type DecodedImageSource,
  type NormalizePhotoDeps,
} from "./imageProcessing";

describe("calcTargetSize", () => {
  test("長辺2048ちょうど→縮小不要（境界値）", () => {
    expect(calcTargetSize(2048, 1000)).toEqual({
      width: 2048,
      height: 1000,
      needsResize: false,
    });
  });

  test("長辺2049→縮小要（境界値）", () => {
    const result = calcTargetSize(2049, 1000);
    expect(result.needsResize).toBe(true);
    expect(result.width).toBe(2048);
    expect(result.height).toBe(Math.round(1000 * (2048 / 2049)));
    expect(Number.isInteger(result.height)).toBe(true);
  });

  test("横長画像: 幅が長辺として2048pxに縮小される", () => {
    const result = calcTargetSize(4096, 2048);
    expect(result).toEqual({ width: 2048, height: 1024, needsResize: true });
  });

  test("縦長画像: 高さが長辺として2048pxに縮小される", () => {
    const result = calcTargetSize(2048, 4096);
    expect(result).toEqual({ width: 1024, height: 2048, needsResize: true });
  });

  test("正方形画像: 両辺とも2048pxに縮小される", () => {
    const result = calcTargetSize(3000, 3000);
    expect(result).toEqual({ width: 2048, height: 2048, needsResize: true });
  });

  test("極端なアスペクト比: 短辺が0pxに丸められず最小1pxを保証する", () => {
    const result = calcTargetSize(10000, 1, 2048);
    expect(result.needsResize).toBe(true);
    expect(result.width).toBe(2048);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  test("極端なアスペクト比（縦長版）: 幅が最小1pxを保証する", () => {
    const result = calcTargetSize(1, 10000, 2048);
    expect(result.needsResize).toBe(true);
    expect(result.height).toBe(2048);
    expect(result.width).toBeGreaterThanOrEqual(1);
  });

  test("maxEdge引数を明示指定できる", () => {
    const result = calcTargetSize(200, 100, 100);
    expect(result).toEqual({ width: 100, height: 50, needsResize: true });
  });

  test("既定のmaxEdgeはMAX_EDGE_PX(2048)と一致する", () => {
    expect(calcTargetSize(3000, 1500)).toEqual(
      calcTargetSize(3000, 1500, MAX_EDGE_PX),
    );
  });

  test("縮小不要な場合、丸めによる誤差を生まず元サイズをそのまま返す", () => {
    expect(calcTargetSize(1234, 567)).toEqual({
      width: 1234,
      height: 567,
      needsResize: false,
    });
  });
});

describe("PASSTHROUGH_MIMES / MAX_EDGE_PX", () => {
  test("無変換対象は png/jpeg/webp の3形式のみ（§2.6-1）", () => {
    expect(PASSTHROUGH_MIMES).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });

  test("MAX_EDGE_PXは2048px", () => {
    expect(MAX_EDGE_PX).toBe(2048);
  });
});

function makeSource(width: number, height: number): DecodedImageSource {
  return { width, height } as DecodedImageSource;
}

function makeDeps(decoded: DecodedImageSource): NormalizePhotoDeps & {
  decode: ReturnType<typeof vi.fn>;
  encode: ReturnType<typeof vi.fn>;
} {
  return {
    decode: vi.fn().mockResolvedValue(decoded),
    encode: vi.fn().mockResolvedValue(new Blob(["encoded"])),
  };
}

describe("normalizePhoto", () => {
  test("§2.6-1: png/jpeg/webpかつ長辺2048px以下→無変換で元Blobをそのまま返す", async () => {
    const source = makeSource(1000, 800);
    const deps = makeDeps(source);
    const blob = new Blob(["original"], { type: "image/png" });

    const result = await normalizePhoto(blob, deps);

    expect(result).toBe(blob);
    expect(deps.encode).not.toHaveBeenCalled();
  });

  test("§2.6-2: jpegで長辺2048px超→縮小して同形式(jpeg)で再エンコードする", async () => {
    const source = makeSource(4096, 2048);
    const deps = makeDeps(source);
    const blob = new Blob(["original"], { type: "image/jpeg" });

    const result = await normalizePhoto(blob, deps);

    expect(deps.encode).toHaveBeenCalledWith(source, 2048, 1024, "image/jpeg");
    expect(result).toBeInstanceOf(Blob);
    expect(result).not.toBe(blob);
  });

  test("§2.6-2: webpで長辺2048px超→縮小して同形式(webp)で再エンコードする", async () => {
    const source = makeSource(3000, 1500);
    const deps = makeDeps(source);
    const blob = new Blob(["original"], { type: "image/webp" });

    await normalizePhoto(blob, deps);

    expect(deps.encode).toHaveBeenCalledWith(source, 2048, 1024, "image/webp");
  });

  test("§2.6-2: pngで長辺2048px超→縮小して同形式(png)で再エンコードする（無劣化）", async () => {
    const source = makeSource(2200, 2200);
    const deps = makeDeps(source);
    const blob = new Blob(["original"], { type: "image/png" });

    await normalizePhoto(blob, deps);

    expect(deps.encode).toHaveBeenCalledWith(source, 2048, 2048, "image/png");
  });

  test("§2.6-3: HEIC等の非対応mimeは長辺2048px以下でもJPEGへ再エンコードする", async () => {
    const source = makeSource(1000, 800);
    const deps = makeDeps(source);
    const blob = new Blob(["original"], { type: "image/heic" });

    await normalizePhoto(blob, deps);

    expect(deps.encode).toHaveBeenCalledWith(source, 1000, 800, "image/jpeg");
  });

  test("§2.6-3: type空文字はJPEGへ再エンコードする", async () => {
    const source = makeSource(500, 500);
    const deps = makeDeps(source);
    const blob = new Blob(["original"], { type: "" });

    await normalizePhoto(blob, deps);

    expect(deps.encode).toHaveBeenCalledWith(source, 500, 500, "image/jpeg");
  });

  test("§2.6-3: GIFで長辺2048px超→縮小してJPEGへ再エンコードする", async () => {
    const source = makeSource(5000, 2500);
    const deps = makeDeps(source);
    const blob = new Blob(["original"], { type: "image/gif" });

    await normalizePhoto(blob, deps);

    expect(deps.encode).toHaveBeenCalledWith(source, 2048, 1024, "image/jpeg");
  });

  test("§2.6-4: デコード不能な場合はUnsupportedImageFormatErrorをthrowし保存を中止する", async () => {
    const deps: NormalizePhotoDeps = {
      decode: vi.fn().mockRejectedValue(new UnsupportedImageFormatError()),
      encode: vi.fn(),
    };
    const blob = new Blob(["broken"], { type: "image/heic" });

    await expect(normalizePhoto(blob, deps)).rejects.toThrow(
      UnsupportedImageFormatError,
    );
    expect(deps.encode).not.toHaveBeenCalled();
  });

  test("UnsupportedImageFormatErrorはi18nキーをmessageKeyプロパティに保持する", () => {
    const error = new UnsupportedImageFormatError();
    expect(error.messageKey).toBe("errors.unsupportedImageFormat");
    expect(error.name).toBe("UnsupportedImageFormatError");
  });
});
