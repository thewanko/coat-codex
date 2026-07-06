// logic/cropGeometry.test.ts — クロップ座標純関数のユニットテスト（実装計画B-2）

import { describe, expect, it } from "vitest";
import {
  ARROW_STEP,
  ARROW_STEP_LARGE,
  MIN_CROP_SIZE,
  clampCropRect,
  moveCropRect,
  resizeCropRect,
  roundCropRect,
} from "./cropGeometry";

describe("clampCropRect", () => {
  it("最小サイズ未満のw/hをMIN_CROP_SIZEへ引き上げる", () => {
    const result = clampCropRect({ x: 0, y: 0, w: 0.05, h: 0.05 }, 0.1);
    expect(result.w).toBe(0.1);
    expect(result.h).toBe(0.1);
  });

  it("[0,1]境界: xが負なら0へ、x+w>1ならxを引き下げる", () => {
    const result = clampCropRect({ x: -0.2, y: 0, w: 0.5, h: 0.5 }, 0.1);
    expect(result.x).toBe(0);

    const result2 = clampCropRect({ x: 0.8, y: 0, w: 0.5, h: 0.5 }, 0.1);
    expect(result2.x + result2.w).toBeLessThanOrEqual(1);
  });

  it("x+wが1を超えないようクランプする", () => {
    const result = clampCropRect({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 0.1);
    expect(result.x + result.w).toBeCloseTo(1, 10);
    expect(result.y + result.h).toBeCloseTo(1, 10);
  });

  it("wが1超なら1へクランプする", () => {
    const result = clampCropRect({ x: 0, y: 0, w: 1.5, h: 1.5 }, 0.1);
    expect(result.w).toBe(1);
    expect(result.h).toBe(1);
  });
});

describe("roundCropRect", () => {
  it("小数7桁以上を6桁へ丸める", () => {
    const result = roundCropRect({
      x: 0.123456789,
      y: 0.1,
      w: 0.3,
      h: 0.3,
    });
    expect(result.x).toBe(0.123457);
  });

  it("丸め後も有効な矩形（[0,1]内・最小サイズ）を返す", () => {
    const result = roundCropRect({ x: 0.999999999, y: 0, w: 0.5, h: 0.5 });
    expect(result.x + result.w).toBeLessThanOrEqual(1);
    expect(result.w).toBeGreaterThanOrEqual(MIN_CROP_SIZE);
  });
});

describe("moveCropRect", () => {
  it("差分だけ移動する", () => {
    const result = moveCropRect({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, 0.1, 0.05);
    expect(result.x).toBeCloseTo(0.3);
    expect(result.y).toBeCloseTo(0.25);
    expect(result.w).toBe(0.3);
    expect(result.h).toBe(0.3);
  });

  it("画像外へ出ないようクランプする", () => {
    const result = moveCropRect({ x: 0.8, y: 0.8, w: 0.3, h: 0.3 }, 0.5, 0.5);
    expect(result.x).toBeCloseTo(0.7);
    expect(result.y).toBeCloseTo(0.7);
  });

  it("負方向のクランプ（0未満にならない）", () => {
    const result = moveCropRect({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, -0.5, -0.5);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });
});

describe("resizeCropRect", () => {
  it("seハンドル: 右下を広げるとw/hが増える", () => {
    const result = resizeCropRect(
      { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
      "se",
      0.1,
      0.1,
      0.1,
    );
    expect(result.x).toBe(0.1);
    expect(result.y).toBe(0.1);
    expect(result.w).toBeCloseTo(0.4);
    expect(result.h).toBeCloseTo(0.4);
  });

  it("nwハンドル: 左上を動かすとx,y,w,hが連動する", () => {
    const result = resizeCropRect(
      { x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
      "nw",
      0.1,
      0.1,
      0.1,
    );
    expect(result.x).toBeCloseTo(0.3);
    expect(result.y).toBeCloseTo(0.3);
    expect(result.w).toBeCloseTo(0.3);
    expect(result.h).toBeCloseTo(0.3);
  });

  it("最小サイズ未満へは縮小できない", () => {
    const result = resizeCropRect(
      { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
      "se",
      -1,
      -1,
      0.1,
    );
    expect(result.w).toBeCloseTo(0.1);
    expect(result.h).toBeCloseTo(0.1);
  });

  it("[0,1]境界を超えて拡大できない", () => {
    const result = resizeCropRect(
      { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
      "ne",
      5,
      -5,
      0.1,
    );
    expect(result.x + result.w).toBeLessThanOrEqual(1);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });
});

describe("arrow step constants", () => {
  it("ARROW_STEP_LARGEはARROW_STEPより大きい", () => {
    expect(ARROW_STEP_LARGE).toBeGreaterThan(ARROW_STEP);
  });
});
