// lib/sns/bluesky.test.ts — Bluesky向けSnsTarget実装のテスト（技術計画v2.2 §4.2 T38）
//
// 境界値は独立に計算してテストへ固定する:
//   - Intl.Segmenter(granularity: "grapheme")で300 graphemeちょうど/301で反転
//   - ZWJ絵文字（👨‍👩‍👧‍👦）は1 grapheme、結合文字（é = e + U+0301）も1 grapheme

import { describe, expect, it } from "vitest";
import { buildBlueskyTarget } from "./bluesky";

const bluesky = buildBlueskyTarget();

describe("bluesky.countText", () => {
  it("300 graphemeちょうどはover=false", () => {
    const text = "a".repeat(300);
    const result = bluesky.countText(text);
    expect(result.count).toBe(300);
    expect(result.limit).toBe(300);
    expect(result.over).toBe(false);
  });

  it("301 graphemeはover=trueに反転する", () => {
    const text = "a".repeat(301);
    const result = bluesky.countText(text);
    expect(result.count).toBe(301);
    expect(result.over).toBe(true);
  });

  it("ZWJ絵文字（👨‍👩‍👧‍👦）は1 graphemeとして数える", () => {
    const family = "👨‍👩‍👧‍👦";
    const result = bluesky.countText(family);
    expect(result.count).toBe(1);
    expect(result.over).toBe(false);
  });

  it("肌色修飾つき絵文字（👍🏽）は1 graphemeとして数える", () => {
    const thumbsUp = "👍🏽";
    const result = bluesky.countText(thumbsUp);
    expect(result.count).toBe(1);
  });

  it("結合文字（e + 結合アキュート U+0301）は1 graphemeとして数える", () => {
    const combined = "é"; // é（結合文字表現）
    const result = bluesky.countText(combined);
    expect(result.count).toBe(1);
  });

  it("ZWJ絵文字300個ちょうどはover=false、301個はover=true", () => {
    const text300 = "👨‍👩‍👧‍👦".repeat(300);
    expect(bluesky.countText(text300).count).toBe(300);
    expect(bluesky.countText(text300).over).toBe(false);

    const text301 = "👨‍👩‍👧‍👦".repeat(301);
    expect(bluesky.countText(text301).count).toBe(301);
    expect(bluesky.countText(text301).over).toBe(true);
  });

  it("空文字列はcount=0でover=false", () => {
    const result = bluesky.countText("");
    expect(result.count).toBe(0);
    expect(result.over).toBe(false);
  });
});

describe("bluesky.trimToLimit", () => {
  it("上限内のテキストは無変換で返す", () => {
    const text = "hello #coatcodex";
    expect(bluesky.trimToLimit(text)).toBe(text);
  });

  it("上限超過時は末尾から削り省略記号を付与する（タグなし）", () => {
    const text = "a".repeat(350);
    const result = bluesky.trimToLimit(text);
    expect(bluesky.countText(result).over).toBe(false);
    expect(result.endsWith("…")).toBe(true);
  });

  it("`#coatcodex` はトリム対象外＝末尾維持される", () => {
    const text = `${"a".repeat(301)} #coatcodex`;
    const result = bluesky.trimToLimit(text);
    expect(result.endsWith("#coatcodex")).toBe(true);
    expect(bluesky.countText(result).over).toBe(false);
    // 独立計算: 300 graphemeちょうどになる（検算済み）
    expect(bluesky.countText(result).count).toBe(300);
  });

  it("ZWJ絵文字混じりの超過テキストもgrapheme単位で正しくトリムされる", () => {
    const text = `${"👨‍👩‍👧‍👦".repeat(305)} #coatcodex`;
    const result = bluesky.trimToLimit(text);
    expect(bluesky.countText(result).over).toBe(false);
    expect(result.endsWith("#coatcodex")).toBe(true);
  });

  it("タグが本文中間にあるケースは末尾維持の対象外（endsWithでない）", () => {
    const text = `#coatcodex ${"a".repeat(350)}`;
    const result = bluesky.trimToLimit(text);
    expect(result.endsWith("#coatcodex")).toBe(false);
    expect(bluesky.countText(result).over).toBe(false);
  });

  it("すでに上限内なら`#coatcodex`付きでも無変換", () => {
    const text = "短い本文 #coatcodex";
    expect(bluesky.trimToLimit(text)).toBe(text);
  });
});

describe("bluesky.buildIntentUrl", () => {
  it("プレフィックスとencodeURIComponentされたテキストを結合する", () => {
    const text = "hello world";
    const url = bluesky.buildIntentUrl(text);
    expect(url).toBe(
      `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
    );
  });

  it("日本語・改行・#・&を含むテキストを正しくエンコードする", () => {
    const text = "タイトル\n概要 #coatcodex & test";
    const url = bluesky.buildIntentUrl(text);
    expect(url).toBe(
      `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
    );
    expect(url).not.toContain("\n");
    expect(url).not.toContain(" ");
  });

  it("300 grapheme超過テキストはURLエンコード前に強制トリムされる（強制トリム発動）", () => {
    const text = "あ".repeat(350);
    const url = bluesky.buildIntentUrl(text);
    const expectedTrimmed = bluesky.trimToLimit(text);
    expect(url).toBe(
      `https://bsky.app/intent/compose?text=${encodeURIComponent(expectedTrimmed)}`,
    );
    expect(bluesky.countText(expectedTrimmed).over).toBe(false);
    // 強制トリムが実際に発動している（元テキストのままではない）ことを確認
    expect(url).not.toBe(
      `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
    );
  });
});
