// routes/printScale.test.ts — computePrintScaleの境界値テスト（技術計画v2.2 §3.3・§4.2 T36）
//
// 紙面幅(794px)を境界に、利用可能幅→倍率の純関数を検証する。
// 0/負値/NaNは安全側（縮小しない=1）にフォールバックすることを確認する。

import { describe, expect, test } from "vitest";
import { computePrintScale } from "./printScale";

describe("computePrintScale — モバイル自動スケール倍率算出（純関数）", () => {
  test("紙面幅(794)以上の利用可能幅では等倍(1)を返す", () => {
    expect(computePrintScale(794)).toBe(1);
    expect(computePrintScale(1024)).toBe(1);
  });

  test("紙面幅未満では利用可能幅/紙面幅の倍率を返す（375px想定）", () => {
    expect(computePrintScale(375)).toBeCloseTo(375 / 794);
  });

  test("0以下や不正値は安全側の等倍(1)にフォールバックする", () => {
    expect(computePrintScale(0)).toBe(1);
    expect(computePrintScale(-100)).toBe(1);
    expect(computePrintScale(Number.NaN)).toBe(1);
  });
});
