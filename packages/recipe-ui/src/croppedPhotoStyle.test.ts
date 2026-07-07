import { describe, expect, test } from "vitest";
import { computeCroppedPhotoStyle } from "./croppedPhotoStyle";
import type { CropRect } from "@coat-codex/recipe-core";

describe("computeCroppedPhotoStyle", () => {
  test("crop中央50%（正方形の中央半分）: cropBoxはaspect-ratio 1、imgは200%・-50%オフセット", () => {
    const crop: CropRect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const { cropBoxStyle, imgStyle } = computeCroppedPhotoStyle(crop, {
      width: 1000,
      height: 1000,
    });

    // CA = (0.5*1000)/(0.5*1000) = 1
    expect(cropBoxStyle.aspectRatio).toBe("1");
    expect(imgStyle.width).toBe("calc(100% / 0.5)");
    expect(imgStyle.height).toBe("calc(100% / 0.5)");
    expect(imgStyle.left).toBe("calc(-100% * 0.25 / 0.5)");
    expect(imgStyle.top).toBe("calc(-100% * 0.25 / 0.5)");
  });

  test("端寄せ（x=0,y=0の左上1/4切り出し）: imgのleft/topオフセットは0", () => {
    const crop: CropRect = { x: 0, y: 0, w: 0.5, h: 0.5 };
    const { imgStyle } = computeCroppedPhotoStyle(crop, {
      width: 800,
      height: 600,
    });

    expect(imgStyle.left).toBe("calc(-100% * 0 / 0.5)");
    expect(imgStyle.top).toBe("calc(-100% * 0 / 0.5)");
    expect(imgStyle.width).toBe("calc(100% / 0.5)");
  });

  test("全体{x:0,y:0,w:1,h:1}: CAは元画像アスペクトそのもの、imgは等倍相当（分母1）", () => {
    const crop: CropRect = { x: 0, y: 0, w: 1, h: 1 };
    const { cropBoxStyle, imgStyle } = computeCroppedPhotoStyle(crop, {
      width: 1600,
      height: 900,
    });

    // CA = (1*1600)/(1*900) = 1.7777...
    expect(cropBoxStyle.aspectRatio).toBe(String((1 * 1600) / (1 * 900)));
    expect(imgStyle.width).toBe("calc(100% / 1)");
    expect(imgStyle.height).toBe("calc(100% / 1)");
    expect(imgStyle.left).toBe("calc(-100% * 0 / 1)");
    expect(imgStyle.top).toBe("calc(-100% * 0 / 1)");
  });

  test("非正方形naturalSize×非正方形crop: CAが縦横比を正しく反映する", () => {
    // 元画像2000x1000(2:1)、クロップw=0.4,h=0.8 → CA = (0.4*2000)/(0.8*1000) = 1
    const crop: CropRect = { x: 0.1, y: 0.1, w: 0.4, h: 0.8 };
    const { cropBoxStyle } = computeCroppedPhotoStyle(crop, {
      width: 2000,
      height: 1000,
    });
    expect(cropBoxStyle.aspectRatio).toBe("1");
  });
});
