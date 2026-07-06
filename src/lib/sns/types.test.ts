// lib/sns/types.test.ts — SnsTarget配列登録制のテスト（技術計画v2.2 §4.2 T38）

import { describe, expect, it } from "vitest";
import {
  snsTargets,
  trimWithFixedTag,
  SNS_FIXED_TAG,
  SNS_ELLIPSIS,
  type WeightedUnit,
} from "./types";

/** 全ASCII文字をweight=1として数える単純toUnits（境界値検証を独立させるためのテスト専用実装） */
function toAsciiUnits(text: string): WeightedUnit[] {
  return Array.from(text).map((char) => ({ text: char, weight: 1 }));
}

describe("trimWithFixedTag: 極小limitでの不変条件（トリム後は必ずover=false相当に収まるかタグのみを返す）", () => {
  it("tagWeight+ellipsisWeightがlimit超過な極小limitでは本文もELLIPSISも持たずtagSuffixのみ返す", () => {
    // SNS_FIXED_TAG="#coatcodex"は10文字=weight10（ASCII単位）。ELLIPSIS="…"はweight1。
    // limit=5 なら 10+1=11 > 5 となり、本文を全削りしてもELLIPSIS付きでは収まらない。
    const text = `本文本文本文${SNS_FIXED_TAG}`;
    const result = trimWithFixedTag(text, toAsciiUnits, 5);
    expect(result).toBe(SNS_FIXED_TAG);
    // ELLIPSISを含まない・超過しない最小の応答であることを確認
    expect(result).not.toContain(SNS_ELLIPSIS);
  });

  it("tagWeight自体がlimitを超える極限ケースでもタグは温存され、本文・ELLIPSISは付与しない", () => {
    const text = `本文本文本文${SNS_FIXED_TAG}`;
    const result = trimWithFixedTag(text, toAsciiUnits, 1);
    expect(result).toBe(SNS_FIXED_TAG);
  });

  it("タグなしテキストで極小limitの場合は空文字列を返す（ELLIPSISすら付与できない）", () => {
    const text = "a".repeat(50);
    const result = trimWithFixedTag(text, toAsciiUnits, 0);
    expect(result).toBe("");
  });

  it("ぎりぎりガードに入らない極小limit（tagWeight+ellipsisWeight===limit）は本文0文字＋ELLIPSIS＋タグを返す", () => {
    // tagWeight=10, ellipsisWeight=1 → limit=11 でちょうど境界（ガード条件は超過のみで発動、等価は非発動）
    const text = `本文本文本文${SNS_FIXED_TAG}`;
    const result = trimWithFixedTag(text, toAsciiUnits, 11);
    expect(result).toBe(`${SNS_ELLIPSIS}${SNS_FIXED_TAG}`);
  });
});

describe("snsTargets", () => {
  it("x, bluesky の順で2件登録されている", () => {
    expect(snsTargets.map((target) => target.key)).toEqual(["x", "bluesky"]);
  });

  it("各ターゲットはlabel・buildIntentUrl・countText・trimToLimitを持つ", () => {
    for (const target of snsTargets) {
      expect(typeof target.label).toBe("string");
      expect(target.label.length).toBeGreaterThan(0);
      expect(typeof target.buildIntentUrl).toBe("function");
      expect(typeof target.countText).toBe("function");
      expect(typeof target.trimToLimit).toBe("function");
    }
  });

  it("Xのlabelは'X'、Blueskyのlabelは'Bluesky'", () => {
    const x = snsTargets.find((target) => target.key === "x");
    const bluesky = snsTargets.find((target) => target.key === "bluesky");
    expect(x?.label).toBe("X");
    expect(bluesky?.label).toBe("Bluesky");
  });
});
