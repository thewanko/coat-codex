import { describe, expect, test } from "vitest";
import {
  addPaintSlot,
  allocateIntegerPercents,
  commitPercentInput,
  commitRatioInput,
  expandRatioToPercents,
  formatMixBadge,
  formatRatioText,
  isMixTotalValid,
  parseRatioText,
  reducePercentsToRatio,
  removePaintSlot,
  sumPercents,
  type MixState,
} from "./mixRatio";

describe("parseRatioText", () => {
  test("'5:3:2'→[5,3,2]", () => {
    expect(parseRatioText("5:3:2")).toEqual([5, 3, 2]);
  });

  test("空白混じり' 3 : 2 'を受理", () => {
    expect(parseRatioText(" 3 : 2 ")).toEqual([3, 2]);
  });

  test("小数'1.5:1'は拒否（v2.2: 整数のみ）", () => {
    expect(parseRatioText("1.5:1")).toBeNull();
  });

  test("'3:0'は拒否（0不可）", () => {
    expect(parseRatioText("3:0")).toBeNull();
  });

  test("1項は拒否", () => {
    expect(parseRatioText("5")).toBeNull();
  });

  test("6項は拒否", () => {
    expect(parseRatioText("1:1:1:1:1:1")).toBeNull();
  });

  test("非数値は拒否", () => {
    expect(parseRatioText("a:b")).toBeNull();
  });
});

describe("formatRatioText", () => {
  test("[5,3,2]→'5:3:2'", () => {
    expect(formatRatioText([5, 3, 2])).toBe("5:3:2");
  });

  test("[3,2]→'3:2'", () => {
    expect(formatRatioText([3, 2])).toBe("3:2");
  });
});

describe("expandRatioToPercents", () => {
  test("3:2を[60,40]へ展開", () => {
    expect(expandRatioToPercents([3, 2])).toEqual([60, 40]);
  });

  test("5:3:2を[50,30,20]へ展開", () => {
    expect(expandRatioToPercents([5, 3, 2])).toEqual([50, 30, 20]);
  });

  test("1:1:1は[33,33,34]（剰余+1は末尾スロットへ）", () => {
    expect(expandRatioToPercents([1, 1, 1])).toEqual([33, 33, 34]);
  });

  test("1:2は[33,67]（剰余は末尾へ）", () => {
    expect(expandRatioToPercents([1, 2])).toEqual([33, 67]);
  });

  test("1:1:1:1:1の合計が100", () => {
    const result = expandRatioToPercents([1, 1, 1, 1, 1]);
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(100);
  });
});

describe("allocateIntegerPercents", () => {
  test("targetSum=100で剰余+1を末尾スロットへ加算", () => {
    expect(allocateIntegerPercents([33.33, 33.33, 33.33], 100)).toEqual([
      33, 33, 34,
    ]);
  });

  test("targetSum=90で合計90になる（削除按分用）", () => {
    const result = allocateIntegerPercents([45, 45], 90);
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(90);
  });

  test("剰余0はそのまま返す", () => {
    expect(allocateIntegerPercents([60, 40], 100)).toEqual([60, 40]);
  });
});

describe("reducePercentsToRatio", () => {
  test("[60,40]→[3,2]", () => {
    expect(reducePercentsToRatio([60, 40])).toEqual([3, 2]);
  });

  test("[50,30,20]→[5,3,2]", () => {
    expect(reducePercentsToRatio([50, 30, 20])).toEqual([5, 3, 2]);
  });

  test("[55,45]はnull（約分後11:9が1桁に収まらない）", () => {
    expect(reducePercentsToRatio([55, 45])).toBeNull();
  });

  test("[33,33,34]はnull（GCD=1）", () => {
    expect(reducePercentsToRatio([33, 33, 34])).toBeNull();
  });

  test("合計≠100の[60,50]はnull", () => {
    expect(reducePercentsToRatio([60, 50])).toBeNull();
  });
});

describe("sumPercents", () => {
  test("[60,40]→100", () => {
    expect(sumPercents([60, 40])).toBe(100);
  });

  test("[60,50]→110", () => {
    expect(sumPercents([60, 50])).toBe(110);
  });

  test("nullは0", () => {
    expect(sumPercents(null)).toBe(0);
  });
});

describe("isMixTotalValid", () => {
  const paints2 = [{ colorId: "col_a" }, { colorId: "col_b" }];

  test("合計100はtrue", () => {
    expect(isMixTotalValid(paints2, [60, 40])).toBe(true);
  });

  test("合計110はfalse", () => {
    expect(isMixTotalValid(paints2, [60, 50])).toBe(false);
  });

  test("単色（mix=null）はtrue", () => {
    expect(isMixTotalValid([{ colorId: "col_a" }], null)).toBe(true);
  });

  test("塗料0件はtrue", () => {
    expect(isMixTotalValid([], null)).toBe(true);
  });
});

describe("formatMixBadge", () => {
  test("2色合計100は'60% + 40% (3:2)'", () => {
    const paints = [{ colorId: "col_a" }, { colorId: "col_b" }];
    expect(formatMixBadge(paints, [60, 40])).toBe("60% + 40% (3:2)");
  });

  test("3色合計100は'50% + 30% + 20% (5:3:2)'", () => {
    const paints = [
      { colorId: "col_a" },
      { colorId: "col_b" },
      { colorId: "col_c" },
    ];
    expect(formatMixBadge(paints, [50, 30, 20])).toBe(
      "50% + 30% + 20% (5:3:2)",
    );
  });

  test("約分不能は'55% + 45%'（比率省略）", () => {
    const paints = [{ colorId: "col_a" }, { colorId: "col_b" }];
    expect(formatMixBadge(paints, [55, 45])).toBe("55% + 45%");
  });

  test("合計≠100は'60% + 50%'（比率省略）", () => {
    const paints = [{ colorId: "col_a" }, { colorId: "col_b" }];
    expect(formatMixBadge(paints, [60, 50])).toBe("60% + 50%");
  });

  test("単色は空文字", () => {
    expect(formatMixBadge([{ colorId: "col_a" }], null)).toBe("");
  });

  test("塗料0件は空文字", () => {
    expect(formatMixBadge([], null)).toBe("");
  });
});

describe("commitPercentInput", () => {
  test("mix[index]のみ更新し他スロットは不変", () => {
    const state: MixState = {
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [60, 40],
    };
    const result = commitPercentInput(state, 0, 70);
    expect(result.mix).toEqual([70, 40]);
    expect(state.mix).toEqual([60, 40]);
  });

  test("101はclampされ100", () => {
    const state: MixState = {
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [60, 40],
    };
    expect(commitPercentInput(state, 0, 101).mix).toEqual([100, 40]);
  });

  test("小数入力は四捨五入で整数化", () => {
    const state: MixState = {
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [60, 40],
    };
    expect(commitPercentInput(state, 0, 60.6).mix).toEqual([61, 40]);
  });
});

describe("commitRatioInput", () => {
  test("[5,3,2]で[50,30,20]が設定される", () => {
    const state: MixState = {
      paints: [
        { colorId: "col_a" },
        { colorId: "col_b" },
        { colorId: "col_c" },
      ],
      mix: [10, 10, 80],
    };
    expect(commitRatioInput(state, [5, 3, 2]).mix).toEqual([50, 30, 20]);
  });

  test("項数不一致は現状態を返す", () => {
    const state: MixState = {
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [60, 40],
    };
    expect(commitRatioInput(state, [5, 3, 2])).toBe(state);
  });

  test("単色（1スロット）へは適用されない（現状態を返す）", () => {
    const state: MixState = { paints: [{ colorId: "col_a" }], mix: null };
    expect(commitRatioInput(state, [1])).toBe(state);
  });
});

describe("addPaintSlot", () => {
  test("塗料0件への1件目追加はmix=nullのまま（単色規約）", () => {
    const state: MixState = { paints: [], mix: null };
    const result = addPaintSlot(state, "col_a");
    expect(result.paints).toEqual([{ colorId: "col_a" }]);
    expect(result.mix).toBeNull();
  });

  test("単色に2色目追加でmix=[100,0]", () => {
    const state: MixState = { paints: [{ colorId: "col_a" }], mix: null };
    const result = addPaintSlot(state, "col_b");
    expect(result.paints).toEqual([{ colorId: "col_a" }, { colorId: "col_b" }]);
    expect(result.mix).toEqual([100, 0]);
  });

  test("混色への追加でmix末尾に0（既存値不変）", () => {
    const state: MixState = {
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [60, 40],
    };
    const result = addPaintSlot(state, "col_c");
    expect(result.mix).toEqual([60, 40, 0]);
  });

  test("5件到達時の追加は拒否（現状態を返す）", () => {
    const state: MixState = {
      paints: [
        { colorId: "col_a" },
        { colorId: "col_b" },
        { colorId: "col_c" },
        { colorId: "col_d" },
        { colorId: "col_e" },
      ],
      mix: [20, 20, 20, 20, 20],
    };
    expect(addPaintSlot(state, "col_f")).toBe(state);
  });
});

describe("removePaintSlot", () => {
  test("削除スロットの%を残スロットへ現在比按分（剰余は末尾へ）", () => {
    const state: MixState = {
      paints: [
        { colorId: "col_a" },
        { colorId: "col_b" },
        { colorId: "col_c" },
      ],
      mix: [50, 30, 20],
    };
    const result = removePaintSlot(state, 1);
    expect(result.paints).toEqual([{ colorId: "col_a" }, { colorId: "col_c" }]);
    expect(result.mix).toEqual([71, 29]);
    expect(sumPercentsOf(result.mix)).toBe(100);
  });

  test("合計90（≠100）から削除しても削除前合計90を維持して按分", () => {
    const state: MixState = {
      paints: [
        { colorId: "col_a" },
        { colorId: "col_b" },
        { colorId: "col_c" },
      ],
      mix: [30, 30, 30],
    };
    const result = removePaintSlot(state, 0);
    expect(result.mix).toEqual([45, 45]);
  });

  test("按分先が全0なら均等按分", () => {
    const state: MixState = {
      paints: [
        { colorId: "col_a" },
        { colorId: "col_b" },
        { colorId: "col_c" },
      ],
      mix: [100, 0, 0],
    };
    const result = removePaintSlot(state, 0);
    expect(result.mix).toEqual([50, 50]);
  });

  test("残1件でmix=null（単色化）", () => {
    const state: MixState = {
      paints: [{ colorId: "col_a" }, { colorId: "col_b" }],
      mix: [60, 40],
    };
    const result = removePaintSlot(state, 1);
    expect(result.paints).toEqual([{ colorId: "col_a" }]);
    expect(result.mix).toBeNull();
  });

  test("全削除でpaints=[]・mix=null", () => {
    const state: MixState = { paints: [{ colorId: "col_a" }], mix: null };
    const result = removePaintSlot(state, 0);
    expect(result.paints).toEqual([]);
    expect(result.mix).toBeNull();
  });
});

function sumPercentsOf(mix: number[] | null): number {
  if (mix === null) return 0;
  return mix.reduce((sum, value) => sum + value, 0);
}
