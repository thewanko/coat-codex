// lib/pendingPaints.test.ts — pending塗料スロット除去の純関数テスト（技術計画v2.2 §2.3/§2.5）

import { describe, expect, test } from "vitest";
import {
  isPendingColorId,
  PENDING_COLOR_PREFIX,
  stripPendingPaints,
} from "./pendingPaints";
import type { MixState } from "./mixRatio";

describe("isPendingColorId", () => {
  test("col_pending_プレフィックスを持つIDはtrue", () => {
    expect(isPendingColorId(`${PENDING_COLOR_PREFIX}abc123`)).toBe(true);
  });

  test("通常のcol_プレフィックスはfalse", () => {
    expect(isPendingColorId("col_abc123")).toBe(false);
  });
});

describe("stripPendingPaints", () => {
  test("pendingスロットが無ければpaints/mixとも変化しない（値として等価な新オブジェクトを返す）", () => {
    const state: MixState = {
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [60, 40],
    };
    const result = stripPendingPaints(state);
    expect(result).toEqual(state);
  });

  test("pendingスロットとそのmix要素のみ除去し、残りのmixはpaints順に整合する", () => {
    const state: MixState = {
      paints: [
        { colorId: "col_a" },
        { colorId: `${PENDING_COLOR_PREFIX}xyz` },
        { colorId: "col_c" },
      ],
      mix: [50, 30, 20],
    };
    const result = stripPendingPaints(state);
    expect(result.paints).toEqual([{ colorId: "col_a" }, { colorId: "col_c" }]);
    expect(result.mix).toEqual([50, 20]);
  });

  test("除去後にpaints.length<=1になる場合はmixをnull化する（INV-4整合）", () => {
    const state: MixState = {
      paints: [{ colorId: "col_a" }, { colorId: `${PENDING_COLOR_PREFIX}xyz` }],
      mix: [70, 30],
    };
    const result = stripPendingPaints(state);
    expect(result.paints).toEqual([{ colorId: "col_a" }]);
    expect(result.mix).toBeNull();
  });

  test("除去後にpaints.length===0になる場合はpaints=[]・mix=null", () => {
    const state: MixState = {
      paints: [{ colorId: `${PENDING_COLOR_PREFIX}only` }],
      mix: null,
    };
    const result = stripPendingPaints(state);
    expect(result.paints).toEqual([]);
    expect(result.mix).toBeNull();
  });

  test("全てpending以外で件数2以上の場合はmixが元のpaints長と一致する（INV-2整合）", () => {
    const state: MixState = {
      paints: [
        { colorId: `${PENDING_COLOR_PREFIX}p1` },
        { colorId: "col_a" },
        { colorId: "col_b" },
      ],
      mix: [10, 40, 50],
    };
    const result = stripPendingPaints(state);
    expect(result.paints).toHaveLength(2);
    expect(result.mix).toHaveLength(2);
    expect(result.mix).toEqual([40, 50]);
  });

  test("引数のstateを破壊しない（純関数）", () => {
    const state: MixState = {
      paints: [{ colorId: "col_a" }, { colorId: `${PENDING_COLOR_PREFIX}p1` }],
      mix: [60, 40],
    };
    const snapshot = JSON.parse(JSON.stringify(state));
    stripPendingPaints(state);
    expect(state).toEqual(snapshot);
  });
});
