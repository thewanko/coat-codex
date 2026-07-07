// lib/api.test.ts — APIクライアント薄層の単体テスト（fetchはDIでスタブ）

import { describe, expect, test, vi } from "vitest";
import { fetchFeed, fetchRecipeDetail } from "./api";
import type { FeedResponse, RecipeDetailResponse } from "./api";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("fetchFeed", () => {
  test("cursor省略時は/api/recipesを呼ぶ", async () => {
    const body: FeedResponse = { items: [], nextCursor: null };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(body));
    const result = await fetchFeed(undefined, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/recipes");
    expect(result).toEqual(body);
  });

  test("cursor指定時はクエリに含める", async () => {
    const body: FeedResponse = { items: [], nextCursor: null };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(body));
    await fetchFeed("abc123", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/recipes?cursor=abc123");
  });

  test("非2xxはnullを返す", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "x" }, false, 500));
    const result = await fetchFeed(undefined, fetchImpl);
    expect(result).toBeNull();
  });

  test("fetch例外はnullを返す", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    const result = await fetchFeed(undefined, fetchImpl);
    expect(result).toBeNull();
  });
});

describe("fetchRecipeDetail", () => {
  test("idをパスに含めて呼ぶ", async () => {
    const body = { id: "scr_1" } as unknown as RecipeDetailResponse;
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(body));
    const result = await fetchRecipeDetail("scr_1", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/recipes/scr_1");
    expect(result).toEqual(body);
  });

  test("404はnullを返す", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "not found" }, false, 404));
    const result = await fetchRecipeDetail("scr_missing", fetchImpl);
    expect(result).toBeNull();
  });
});
