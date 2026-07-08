import { describe, expect, test, vi } from "vitest";
import {
  COVER_MAX_BYTES,
  COVER_MAX_EDGE,
  THUMB_MAX_BYTES,
  THUMB_MAX_EDGE,
  composeCover,
  computeCropPixelRect,
  findQualityBlob,
  type CoverComposerDeps,
} from "./coverComposer";
import { calcTargetSize } from "./imageProcessing";
import type { DecodedImageSource } from "./imageProcessing";
import type { CropRect } from "@coat-codex/recipe-core";

describe("computeCropPixelRect", () => {
  test("crop未指定（undefined）→ 元寸法全面を返す", () => {
    expect(computeCropPixelRect(1000, 800, undefined)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1000,
      sh: 800,
    });
  });

  test("crop=null→ 元寸法全面を返す", () => {
    expect(computeCropPixelRect(1000, 800, null)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1000,
      sh: 800,
    });
  });

  test("crop {x:0.25,y:0.25,w:0.5,h:0.5} on 1000×800 → {sx:250,sy:200,sw:500,sh:400}", () => {
    const crop: CropRect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    expect(computeCropPixelRect(1000, 800, crop)).toEqual({
      sx: 250,
      sy: 200,
      sw: 500,
      sh: 400,
    });
  });

  test("全面crop {x:0,y:0,w:1,h:1} → 元寸法と一致する", () => {
    const crop: CropRect = { x: 0, y: 0, w: 1, h: 1 };
    expect(computeCropPixelRect(1200, 600, crop)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1200,
      sh: 600,
    });
  });

  test("境界外気味のcrop（x+w>1相当）がクランプされ、sx+sw が画像幅を超えない", () => {
    // 正規化上は許容されない値だが、クランプ処理の頑健性を確認するため境界を超えた値を渡す
    const crop: CropRect = { x: 0.8, y: 0.8, w: 0.5, h: 0.5 };
    const result = computeCropPixelRect(1000, 800, crop);
    expect(result.sx).toBeCloseTo(800);
    expect(result.sy).toBeCloseTo(640);
    expect(result.sx + result.sw).toBeLessThanOrEqual(1000);
    expect(result.sy + result.sh).toBeLessThanOrEqual(800);
    expect(result.sw).toBeGreaterThanOrEqual(1);
    expect(result.sh).toBeGreaterThanOrEqual(1);
  });

  test("退化したcrop（w/hが極小）でもsw/shは最低1pxを保証する", () => {
    const crop: CropRect = { x: 0.999, y: 0.999, w: 0.0001, h: 0.0001 };
    const result = computeCropPixelRect(1000, 800, crop);
    expect(result.sw).toBeGreaterThanOrEqual(1);
    expect(result.sh).toBeGreaterThanOrEqual(1);
    expect(result.sx).toBeLessThanOrEqual(1000);
    expect(result.sy).toBeLessThanOrEqual(800);
  });

  test("負値寄りのcrop（x/yが0未満相当）は0にクランプされる", () => {
    // 型上はmin(0)制約があるが、クランプ処理自体の頑健性を確認する
    const crop = { x: -0.1, y: -0.1, w: 0.5, h: 0.5 } as CropRect;
    const result = computeCropPixelRect(1000, 800, crop);
    expect(result.sx).toBe(0);
    expect(result.sy).toBe(0);
  });
});

describe("findQualityBlob", () => {
  /** q（0〜1）に単調増加する擬似サイズのBlobを返すスタブ */
  function makeMonotonicEncode(maxSize: number) {
    return vi.fn(async (q: number) => {
      const size = Math.max(1, Math.round(q * maxSize));
      return new Blob([new Uint8Array(size)]);
    });
  }

  test("maxBytes以下に収まり、1段上げると超える最大q付近を返す", async () => {
    const maxBytes = 400 * 1024;
    const encode = makeMonotonicEncode(1_000_000);

    const result = await findQualityBlob(encode, { maxBytes });

    expect(result.size).toBeLessThanOrEqual(maxBytes);

    // 「1段上げると超える」ことの検算: 見つかったBlobサイズに対応するqより
    // 十分大きいq（例: qMaxそのもの）でencodeすると超過することを確認する
    const atQMax = await encode(0.95);
    expect(atQMax.size).toBeGreaterThan(maxBytes);
  });

  test("全qがmaxBytes超のケース→ qMin相当の最小Blobを返す", async () => {
    const maxBytes = 100; // qMin(0.3)でも1_000_000*0.3=300,000byte相当なので必ず超過する
    const encode = makeMonotonicEncode(1_000_000);

    const result = await findQualityBlob(encode, { maxBytes });

    const qMinBlob = await encode(0.3);
    expect(result.size).toBe(qMinBlob.size);
  });

  test("全qがminBytes未満のケース→ qMaxのBlobを返す", async () => {
    // maxSizeを小さくし、qMax(0.95)でもminBytesに届かないようにする
    const maxBytes = 400 * 1024;
    const minBytes = 200 * 1024;
    const encode = makeMonotonicEncode(1000); // qMax(0.95)でも950byte程度

    const result = await findQualityBlob(encode, { maxBytes, minBytes });

    const qMaxBlob = await encode(0.95);
    expect(result.size).toBe(qMaxBlob.size);
    expect(result.size).toBeLessThanOrEqual(maxBytes);
  });

  test("目標範囲内（200-400KB）に収まる場合、それを狙って探索する", async () => {
    const maxBytes = 400 * 1024;
    const minBytes = 200 * 1024;
    // q=1のとき500KB相当になるようスケールし、目標範囲に入るqが存在するようにする
    const encode = makeMonotonicEncode(500 * 1024);

    const result = await findQualityBlob(encode, { maxBytes, minBytes });

    expect(result.size).toBeLessThanOrEqual(maxBytes);
  });

  test("encode呼び出し回数がsteps+数回以内に収まる", async () => {
    const maxBytes = 400 * 1024;
    const minBytes = 200 * 1024;
    const encode = makeMonotonicEncode(500 * 1024);

    await findQualityBlob(encode, {
      maxBytes,
      minBytes,
      steps: 7,
    });

    expect(encode.mock.calls.length).toBeLessThanOrEqual(7 + 2);
  });

  test("steps=0でもqMin/qMaxの2回のみでクラッシュせず動作する", async () => {
    const maxBytes = 400 * 1024;
    const encode = makeMonotonicEncode(500 * 1024);

    const result = await findQualityBlob(encode, {
      maxBytes,
      steps: 0,
    });

    expect(result).toBeInstanceOf(Blob);
    expect(encode.mock.calls.length).toBe(2);
  });
});

function makeDecodedSource(width: number, height: number): DecodedImageSource {
  return { width, height } as DecodedImageSource;
}

describe("composeCover", () => {
  function makeSpyDeps(naturalWidth: number, naturalHeight: number) {
    const decode = vi
      .fn()
      .mockResolvedValue(makeDecodedSource(naturalWidth, naturalHeight));

    // q(0〜1)に応じて単調増加する擬似サイズを返す。destサイズが大きいほど同qでも
    // サイズが大きくなるよう destWidth*destHeight に比例させる（実エンコードに近い挙動）。
    const encodeRegion = vi.fn(
      async (
        _source: DecodedImageSource,
        _src: unknown,
        destWidth: number,
        destHeight: number,
        quality: number,
      ) => {
        const size = Math.max(
          1,
          Math.round(quality * destWidth * destHeight * 0.6),
        );
        return new Blob([new Uint8Array(size)]);
      },
    );

    const deps: CoverComposerDeps = { decode, encodeRegion };
    return { deps, decode, encodeRegion };
  }

  test("cover.size <= COVER_MAX_BYTES かつ thumb.size <= THUMB_MAX_BYTES", async () => {
    const { deps } = makeSpyDeps(4000, 3000);
    const source = new Blob(["original"], { type: "image/jpeg" });

    const result = await composeCover(source, null, deps);

    expect(result.cover.size).toBeLessThanOrEqual(COVER_MAX_BYTES);
    expect(result.thumb.size).toBeLessThanOrEqual(THUMB_MAX_BYTES);
  });

  test("crop後アスペクト比を保って長辺1600/400以下に縮小される（encodeRegion destサイズをspy検算）", async () => {
    const { deps, encodeRegion } = makeSpyDeps(4000, 2000);
    const crop: CropRect = { x: 0, y: 0, w: 1, h: 1 };
    const source = new Blob(["original"], { type: "image/jpeg" });

    await composeCover(source, crop, deps);

    // computeCropPixelRectで全面crop(4000x2000)→calcTargetSizeで長辺1600/400に縮小した値と一致するはず
    const expectedCoverTarget = calcTargetSize(4000, 2000, COVER_MAX_EDGE);
    const expectedThumbTarget = calcTargetSize(4000, 2000, THUMB_MAX_EDGE);

    const coverCalls = encodeRegion.mock.calls.filter(
      (call) => call[2] === expectedCoverTarget.width,
    );
    const thumbCalls = encodeRegion.mock.calls.filter(
      (call) => call[2] === expectedThumbTarget.width,
    );

    expect(coverCalls.length).toBeGreaterThan(0);
    expect(thumbCalls.length).toBeGreaterThan(0);

    for (const call of coverCalls) {
      expect(call[2]).toBe(expectedCoverTarget.width);
      expect(call[3]).toBe(expectedCoverTarget.height);
      expect(Math.max(call[2], call[3])).toBeLessThanOrEqual(COVER_MAX_EDGE);
    }
    for (const call of thumbCalls) {
      expect(call[2]).toBe(expectedThumbTarget.width);
      expect(call[3]).toBe(expectedThumbTarget.height);
      expect(Math.max(call[2], call[3])).toBeLessThanOrEqual(THUMB_MAX_EDGE);
    }

    // アスペクト比がcrop後（4000x2000=2:1）と一致することを確認する
    expect(expectedCoverTarget.width / expectedCoverTarget.height).toBeCloseTo(
      4000 / 2000,
    );
    expect(expectedThumbTarget.width / expectedThumbTarget.height).toBeCloseTo(
      4000 / 2000,
    );
  });

  test("crop焼込のソース矩形がcomputeCropPixelRectと一致する（encodeRegion引数をspy検証）", async () => {
    const { deps, encodeRegion } = makeSpyDeps(1000, 800);
    const crop: CropRect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const source = new Blob(["original"], { type: "image/jpeg" });

    await composeCover(source, crop, deps);

    // computeCropPixelRect(1000,800,crop) = {sx:250,sy:200,sw:500,sh:400}
    for (const call of encodeRegion.mock.calls) {
      const srcRect = call[1] as {
        sx: number;
        sy: number;
        sw: number;
        sh: number;
      };
      expect(srcRect).toEqual({ sx: 250, sy: 200, sw: 500, sh: 400 });
    }
    expect(encodeRegion.mock.calls.length).toBeGreaterThan(0);
  });

  test("小さいソース（長辺<1600）は縮小されない（needsResize=falseで元サイズのまま焼込）", async () => {
    const { deps, encodeRegion } = makeSpyDeps(800, 600);
    const source = new Blob(["original"], { type: "image/jpeg" });

    await composeCover(source, null, deps);

    const coverCalls = encodeRegion.mock.calls.filter(
      (call) => call[2] === 800 && call[3] === 600,
    );
    expect(coverCalls.length).toBeGreaterThan(0);

    // thumbは400px上限があるため縮小される（長辺800→400）
    const thumbCalls = encodeRegion.mock.calls.filter(
      (call) => Math.max(call[2] as number, call[3] as number) === 400,
    );
    expect(thumbCalls.length).toBeGreaterThan(0);
  });

  test("full寸法ではqMin(0.1)でもCOVER_MAX_BYTESを超える高精細画像→寸法縮小して最終的に上限内へ収める", async () => {
    // quality * destW * destH * K に比例する擬似サイズを返すスタブ。
    // K=3.0のとき、full寸法(3000x2000→長辺1600に縮小後1600x1067)はqMin(0.1)でも
    // 0.1*1600*1067*3.0 ≈ 512,160byte > COVER_MAX_BYTES(460,800byte)で必ず超過し、
    // 1段縮小後(edge=1280→1280x853)は 0.1*1280*853*3.0 ≈ 327,552byte で上限内に収まる
    // （＝このKは寸法縮小フォールバックが必ず発火することを保証する値）。
    const K = 3.0;
    const decode = vi.fn().mockResolvedValue(makeDecodedSource(3000, 2000));

    const encodeRegion = vi.fn(
      async (
        _source: DecodedImageSource,
        _src: unknown,
        destWidth: number,
        destHeight: number,
        quality: number,
      ) => {
        const size = Math.max(
          1,
          Math.round(quality * destWidth * destHeight * K),
        );
        return new Blob([new Uint8Array(size)]);
      },
    );

    const deps: CoverComposerDeps = { decode, encodeRegion };
    const source = new Blob(["original"], { type: "image/jpeg" });

    const result = await composeCover(source, null, deps);

    // hard上限を必ず保証する
    expect(result.cover.size).toBeLessThanOrEqual(COVER_MAX_BYTES);
    expect(result.thumb.size).toBeLessThanOrEqual(THUMB_MAX_BYTES);

    // full寸法(長辺1600)のままではhard上限を超えるため寸法縮小が発生し、
    // COVER_MAX_EDGE未満のdestWidthでencodeRegionが呼ばれたことを確認する
    const fullEdgeTarget = calcTargetSize(3000, 2000, COVER_MAX_EDGE);
    const coverCallsBelowFullEdge = encodeRegion.mock.calls.filter(
      (call) =>
        Math.max(call[2] as number, call[3] as number) <
        Math.max(fullEdgeTarget.width, fullEdgeTarget.height),
    );
    expect(coverCallsBelowFullEdge.length).toBeGreaterThan(0);
  });

  test("full寸法で既に上限内なら寸法縮小せず、full寸法のままエンコードされる（回帰防止）", async () => {
    const { deps, encodeRegion } = makeSpyDeps(4000, 3000);
    const source = new Blob(["original"], { type: "image/jpeg" });

    await composeCover(source, null, deps);

    const expectedCoverTarget = calcTargetSize(4000, 3000, COVER_MAX_EDGE);
    const expectedThumbTarget = calcTargetSize(4000, 3000, THUMB_MAX_EDGE);

    // encodeRegionに渡ったdestサイズが常にfull寸法（縮小なし）であることを確認する
    for (const call of encodeRegion.mock.calls) {
      const destWidth = call[2] as number;
      const destHeight = call[3] as number;
      const isCoverSize =
        destWidth === expectedCoverTarget.width &&
        destHeight === expectedCoverTarget.height;
      const isThumbSize =
        destWidth === expectedThumbTarget.width &&
        destHeight === expectedThumbTarget.height;
      expect(isCoverSize || isThumbSize).toBe(true);
    }
  });

  test("既定deps省略時（decode/encodeRegion未指定）は型エラーなくPromiseを返す（呼び出し可能性のみ確認）", () => {
    // 実canvasが動くかどうかはブラウザ検証側の責務。ここではdeps省略時に例外を投げずに
    // Promiseオブジェクトを返す（jsdom未対応で最終的にrejectしても構わない）ことのみ確認する。
    const source = new Blob(["original"], { type: "image/jpeg" });
    const promise = composeCover(source, null);
    expect(promise).toBeInstanceOf(Promise);
    // jsdomにはcreateImageBitmap/canvas.toBlobの完全実装がないため、reject前提でcatchしておく
    promise.catch(() => {
      // 意図的に無視する
    });
  });

  test("既定encodeRegion（canvas経由）はcanvas.toBlobをimage/jpegで呼ぶ（WebP非対応Safari対策）", async () => {
    // jsdomにはcanvas 2dの実装がないため、getContext/toBlobをスパイしてformat引数のみ検証する。
    // defaultEncodeRegionは非exportのためcomposeCover経由（deps省略でdecodeのみ注入）で検証する。
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation(function (
        this: HTMLCanvasElement,
        callback: BlobCallback,
      ) {
        callback(new Blob([new Uint8Array(1024)]));
      });
    const drawImageSpy = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: drawImageSpy,
    } as unknown as CanvasRenderingContext2D);

    const decode = vi
      .fn()
      .mockResolvedValue(makeDecodedSource(800, 600) as DecodedImageSource);
    const source = new Blob(["original"], { type: "image/jpeg" });

    await composeCover(source, null, { decode });

    expect(toBlobSpy).toHaveBeenCalled();
    for (const call of toBlobSpy.mock.calls) {
      expect(call[1]).toBe("image/jpeg");
    }

    toBlobSpy.mockRestore();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockRestore?.();
  });
});
