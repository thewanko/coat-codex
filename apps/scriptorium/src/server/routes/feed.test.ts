// @vitest-environment node
// src/server/routes/feed.test.ts — cursor/limit 純関数の unit test（技術計画v1 §4.2）

import { describe, expect, test } from "vitest";
import { resolveLimit, encodeCursor, decodeCursor } from "./feed";

describe("resolveLimit", () => {
  test("未指定は既定20", () => {
    expect(resolveLimit(undefined)).toBe(20);
  });

  test("51以上は50にclamp", () => {
    expect(resolveLimit("51")).toBe(50);
    expect(resolveLimit("1000")).toBe(50);
  });

  test("0/負/非数は既定20へフォールバック", () => {
    expect(resolveLimit("0")).toBe(20);
    expect(resolveLimit("-1")).toBe(20);
    expect(resolveLimit("abc")).toBe(20);
  });

  test("正常範囲はそのまま", () => {
    expect(resolveLimit("2")).toBe(2);
    expect(resolveLimit("50")).toBe(50);
  });
});

describe("encodeCursor/decodeCursor", () => {
  test("往復でpublishedAt/idが復元される", () => {
    const cursor = encodeCursor("2026-07-06T12:00:00.000Z", "scr_seed_wolf");
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({
      publishedAt: "2026-07-06T12:00:00.000Z",
      id: "scr_seed_wolf",
    });
  });

  test("不正なbase64urlはnull", () => {
    expect(decodeCursor("not valid base64!!")).toBeNull();
  });

  test("セパレータを含まない文字列はnull", () => {
    const cursor = btoa("no-separator")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeCursor(cursor)).toBeNull();
  });
});
