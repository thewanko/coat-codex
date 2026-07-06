// components/overview/exportSheetDrag.test.ts — ドラッグ閉じるしきい値の純関数テスト

import { describe, expect, test } from "vitest";
import { shouldCloseFromDrag } from "./exportSheetDrag";

describe("shouldCloseFromDrag — ドラッグ閉じるしきい値の純関数", () => {
  test("dyが80pxちょうどでは閉じない（境界値、シート高が十分大きい場合）", () => {
    expect(shouldCloseFromDrag(80, 1000)).toBe(false);
  });

  test("dyが80px超なら閉じる", () => {
    expect(shouldCloseFromDrag(81, 1000)).toBe(true);
  });

  test("dyがシート高の30%ちょうどでは閉じない（境界値）", () => {
    expect(shouldCloseFromDrag(60, 200)).toBe(false);
  });

  test("dyがシート高の30%超なら閉じる", () => {
    expect(shouldCloseFromDrag(61, 200)).toBe(true);
  });

  test("80px未満かつシート高30%未満なら閉じない", () => {
    expect(shouldCloseFromDrag(30, 500)).toBe(false);
  });

  test("上方向（負値）のdyは閉じない", () => {
    expect(shouldCloseFromDrag(-100, 500)).toBe(false);
  });

  test("dyが0でも閉じない", () => {
    expect(shouldCloseFromDrag(0, 500)).toBe(false);
  });
});
