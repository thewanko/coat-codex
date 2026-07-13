// lib/toolTags.test.ts — normalizeTag/addTag/collectAllTags（技術計画v2.6 §2.8 T53）

import { describe, expect, test } from "vitest";
import { addTag, collectAllTags, normalizeTag } from "./toolTags";

describe("normalizeTag", () => {
  test("先頭の半角#を除去する", () => {
    expect(normalizeTag("#筆")).toBe("筆");
  });

  test("先頭の全角＃を除去する", () => {
    expect(normalizeTag("＃筆")).toBe("筆");
  });

  test("前後の空白をtrimする", () => {
    expect(normalizeTag("  brush  ")).toBe("brush");
  });

  test("NFC正規化する", () => {
    // "が" を濁点分解形（NFD）で与えてもNFC結合形になる
    const decomposed = "が"; // か + 濁点
    expect(normalizeTag(decomposed)).toBe("が");
  });

  test("空文字は空文字を返す", () => {
    expect(normalizeTag("")).toBe("");
    expect(normalizeTag("   ")).toBe("");
  });

  test("#のみは空文字を返す", () => {
    expect(normalizeTag("#")).toBe("");
    expect(normalizeTag("＃")).toBe("");
    expect(normalizeTag("  #  ")).toBe("");
  });
});

describe("addTag", () => {
  test("正規化して末尾に追加する", () => {
    expect(addTag([], "#筆")).toEqual(["筆"]);
    expect(addTag(["筆"], "#スポンジ")).toEqual(["筆", "スポンジ"]);
  });

  test("大小無視で重複する場合は不変", () => {
    const tags = ["Brush"];
    expect(addTag(tags, "brush")).toBe(tags);
    expect(addTag(tags, "BRUSH")).toBe(tags);
  });

  test("正規化後に空文字なら不変", () => {
    const tags = ["筆"];
    expect(addTag(tags, "   ")).toBe(tags);
    expect(addTag(tags, "#")).toBe(tags);
  });

  test("元の配列を破壊しない", () => {
    const tags = ["筆"];
    const next = addTag(tags, "スポンジ");
    expect(tags).toEqual(["筆"]);
    expect(next).toEqual(["筆", "スポンジ"]);
    expect(next).not.toBe(tags);
  });
});

describe("collectAllTags", () => {
  test("全ツールのタグをunion・大小無視dedupe・昇順で返す", () => {
    const tools = [
      { tags: ["筆", "brush"] },
      { tags: ["Brush", "スポンジ"] },
      { tags: [] },
    ];
    expect(collectAllTags(tools)).toEqual(
      ["筆", "brush", "スポンジ"].sort((a, b) => a.localeCompare(b)),
    );
  });

  test("空配列を渡すと空配列を返す", () => {
    expect(collectAllTags([])).toEqual([]);
  });
});
