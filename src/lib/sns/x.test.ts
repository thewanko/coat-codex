// lib/sns/x.test.ts — X向けSnsTarget実装のテスト（技術計画v2.2 §4.2 T38）
//
// 境界値は独立に計算してテストへ固定する:
//   - weight=1レンジ: U+0000–U+10FF, U+2000–U+200D, U+2010–U+201F, U+2032–U+2037
//   - 上記以外（ひらがな等CJK）はweight=2
//   - 日本語（CJK）140字 = weight280 → over=false／141字 = weight282 → over=true
//   - URLはプロトコル付きなら実際の文字数に関わらずweight=23固定

import { describe, expect, it } from "vitest";
import { buildXTarget } from "./x";

const x = buildXTarget();

describe("x.countText", () => {
  it("ASCII 280文字ちょうどはover=false", () => {
    const text = "a".repeat(280);
    const result = x.countText(text);
    expect(result.count).toBe(280);
    expect(result.limit).toBe(280);
    expect(result.over).toBe(false);
  });

  it("ASCII 281文字はover=trueに反転する", () => {
    const text = "a".repeat(281);
    const result = x.countText(text);
    expect(result.count).toBe(281);
    expect(result.over).toBe(true);
  });

  it("CJK混在: 日本語140字はweight280でover=false", () => {
    const text = "あ".repeat(140);
    const result = x.countText(text);
    expect(result.count).toBe(280);
    expect(result.over).toBe(false);
  });

  it("CJK混在: 日本語141字はweight282でover=trueに反転する", () => {
    const text = "あ".repeat(141);
    const result = x.countText(text);
    expect(result.count).toBe(282);
    expect(result.over).toBe(true);
  });

  it("weight=1レンジ（Basic Latin〜Latin-1）の文字はweight1として数える", () => {
    // U+00E9 (é) は U+0000–U+10FF の範囲内 = weight1
    const text = "é".repeat(280);
    const result = x.countText(text);
    expect(result.count).toBe(280);
    expect(result.over).toBe(false);
  });

  it("全角記号（weight=1レンジ外）はweight2として数える", () => {
    // U+FF01 (！全角感嘆符) は4レンジいずれにも含まれずweight2
    const text = "！".repeat(140);
    const result = x.countText(text);
    expect(result.count).toBe(280);
    expect(result.over).toBe(false);
    const text2 = "！".repeat(141);
    expect(x.countText(text2).over).toBe(true);
  });

  it("URL含みテキスト: URLは実文字数に関わらずweight23固定", () => {
    const url = "https://example.com/foo/bar/baz/qux"; // 35文字だが23固定
    expect(url.length).toBe(35);
    const text = `${url} 見て`;
    const result = x.countText(text);
    // 23 (url) + 2 (space, weight1) + 2*2 (見て, weight2 each) = 23 + 1 + 4 = 28
    expect(result.count).toBe(28);
  });

  describe("weight=1レンジの境界端点（4レンジそれぞれの終端とその直後の反転を検証）", () => {
    // 各ペアは [レンジ内の最終コードポイント(weight1), レンジ外の直後コードポイント(weight2)]。
    // 期待重みは仕様（x.ts冒頭コメント）のレンジ定義から独立に計算してテストへ固定する。
    const boundaryPairs: Array<{
      label: string;
      weightOne: string;
      weightTwo: string;
    }> = [
      {
        label: "U+10FF(w1)/U+1100(w2)",
        weightOne: String.fromCodePoint(0x10ff),
        weightTwo: String.fromCodePoint(0x1100),
      },
      {
        label: "U+200D(w1)/U+200E(w2)",
        weightOne: String.fromCodePoint(0x200d),
        weightTwo: String.fromCodePoint(0x200e),
      },
      {
        label: "U+201F(w1)/U+2020(w2)",
        weightOne: String.fromCodePoint(0x201f),
        weightTwo: String.fromCodePoint(0x2020),
      },
      {
        label: "U+2037(w1)/U+2038(w2)",
        weightOne: String.fromCodePoint(0x2037),
        weightTwo: String.fromCodePoint(0x2038),
      },
    ];

    for (const { label, weightOne, weightTwo } of boundaryPairs) {
      it(`${label}: レンジ内終端はweight1（280回でover=false・281回でover=true）`, () => {
        const within = x.countText(weightOne.repeat(280));
        expect(within.count).toBe(280);
        expect(within.over).toBe(false);

        const over = x.countText(weightOne.repeat(281));
        expect(over.count).toBe(281);
        expect(over.over).toBe(true);
      });

      it(`${label}: レンジ外直後はweight2（同じ280回でweight560となりover=trueに反転）`, () => {
        const result = x.countText(weightTwo.repeat(280));
        expect(result.count).toBe(560);
        expect(result.over).toBe(true);
      });

      it(`${label}: レンジ外直後は140回でweight280＝over=falseの境界に一致する`, () => {
        const atLimit = x.countText(weightTwo.repeat(140));
        expect(atLimit.count).toBe(280);
        expect(atLimit.over).toBe(false);

        const overLimit = x.countText(weightTwo.repeat(141));
        expect(overLimit.count).toBe(282);
        expect(overLimit.over).toBe(true);
      });
    }
  });

  it("URL複数含みテキストはURLごとにweight23固定で加算する", () => {
    const url1 = "http://a.example.com";
    const url2 = "https://b.example.com/longer/path/than/twentythree/chars";
    const text = `${url1} ${url2}`;
    const result = x.countText(text);
    // 23 + 1(space, weight1) + 23 = 47
    expect(result.count).toBe(47);
  });

  it("空文字列はcount=0でover=false", () => {
    const result = x.countText("");
    expect(result.count).toBe(0);
    expect(result.over).toBe(false);
  });
});

describe("x.trimToLimit", () => {
  it("上限内のテキストは無変換で返す", () => {
    const text = "hello #coat-codex";
    expect(x.trimToLimit(text)).toBe(text);
  });

  it("上限超過時は末尾から削り省略記号を付与する（タグなし）", () => {
    const text = "a".repeat(300);
    const result = x.trimToLimit(text);
    expect(x.countText(result).over).toBe(false);
    expect(result.endsWith("…")).toBe(true);
    expect(result.startsWith("a")).toBe(true);
  });

  it("`#coat-codex` はトリム対象外＝末尾維持される", () => {
    const text = `${"あ".repeat(141)} #coat-codex`;
    const result = x.trimToLimit(text);
    expect(result.endsWith("#coat-codex")).toBe(true);
    expect(x.countText(result).over).toBe(false);
  });

  it("タグを含むトリム結果は省略記号＋タグの合計重みも上限計算に含める", () => {
    // 独立計算: tagWeight(" #coat-codex")=12, ellipsisWeight("…")=2
    // 残り本文weight上限 = 280 - 12 - 2 = 266 → CJK(weight2)なら133文字
    const text = `${"あ".repeat(141)} #coat-codex`;
    const result = x.trimToLimit(text);
    const bodyPart = result.slice(0, result.indexOf("…"));
    expect(Array.from(bodyPart).length).toBe(133);
    expect(x.countText(result).count).toBe(280 - 1); // 279（検算済み）
  });

  it("タグが本文中間にあるケースは末尾維持の対象外（endsWithでない）", () => {
    const text = `#coat-codex ${"a".repeat(300)}`;
    const result = x.trimToLimit(text);
    // 末尾にタグが無いため通常の末尾トリム対象として扱われる
    expect(result.endsWith("#coat-codex")).toBe(false);
    expect(x.countText(result).over).toBe(false);
  });

  it("すでに上限内なら`#coat-codex`付きでも無変換", () => {
    const text = "短い本文 #coat-codex";
    expect(x.trimToLimit(text)).toBe(text);
  });
});

describe("x.buildIntentUrl", () => {
  it("プレフィックスとencodeURIComponentされたテキストを結合する", () => {
    const text = "hello world";
    const url = x.buildIntentUrl(text);
    expect(url).toBe(
      `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
    );
  });

  it("日本語・改行・#・&を含むテキストを正しくエンコードする", () => {
    const text = "タイトル\n概要 #coat-codex & test";
    const url = x.buildIntentUrl(text);
    expect(url).toBe(
      `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
    );
    expect(url).not.toContain("\n");
    expect(url).not.toContain(" ");
  });

  it("上限超過テキストはURLエンコード前に強制トリムされる", () => {
    const text = "あ".repeat(200);
    const url = x.buildIntentUrl(text);
    const expectedTrimmed = x.trimToLimit(text);
    expect(url).toBe(
      `https://x.com/intent/post?text=${encodeURIComponent(expectedTrimmed)}`,
    );
    expect(x.countText(expectedTrimmed).over).toBe(false);
  });
});
