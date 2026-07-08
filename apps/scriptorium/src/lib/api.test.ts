// lib/api.test.ts — APIクライアント薄層の単体テスト（fetchはDIでスタブ）

import { describe, expect, test, vi } from "vitest";
import {
  deleteRecipe,
  fetchFeed,
  fetchRecipeDetail,
  reportRecipe,
} from "./api";
import type { FeedResponse, FetchLike, RecipeDetailResponse } from "./api";

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

describe("deleteRecipe", () => {
  test("200正常: DELETEでid/PWを送りok:trueを返す（マクロタスク遅延スタブ）", async () => {
    const fetchImpl = vi.fn<FetchLike>(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve(jsonResponse({ id: "scr_1", status: "deleted" })),
            0,
          );
        }),
    );

    const result = await deleteRecipe("scr_1", "correct-horse", fetchImpl);

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/recipes/scr_1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deletePassword: "correct-horse" }),
    });
  });

  test("403はwrongPassword＋serverErrorを逐語格納する", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse({ error: "incorrect password" }, false, 403),
      );

    const result = await deleteRecipe("scr_1", "wrong", fetchImpl);

    expect(result).toEqual({
      ok: false,
      code: "wrongPassword",
      serverError: "incorrect password",
    });
  });

  test("429はrateLimited＋serverErrorを逐語格納する", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse({ error: "rate limit exceeded" }, false, 429),
      );

    const result = await deleteRecipe("scr_1", "pw", fetchImpl);

    expect(result).toEqual({
      ok: false,
      code: "rateLimited",
      serverError: "rate limit exceeded",
    });
  });

  test("404はnotFound＋serverErrorを逐語格納する", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ error: "not found" }, false, 404));

    const result = await deleteRecipe("scr_missing", "pw", fetchImpl);

    expect(result).toEqual({
      ok: false,
      code: "notFound",
      serverError: "not found",
    });
  });

  test("400はbadRequest＋serverErrorを逐語格納する", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse({ error: "invalid deletePassword" }, false, 400),
      );

    const result = await deleteRecipe("scr_1", "", fetchImpl);

    expect(result).toEqual({
      ok: false,
      code: "badRequest",
      serverError: "invalid deletePassword",
    });
  });

  test("fetch例外はnetworkを返す", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockRejectedValue(new Error("offline"));

    const result = await deleteRecipe("scr_1", "pw", fetchImpl);

    expect(result).toEqual({ ok: false, code: "network" });
  });

  test("非JSON応答（json()がthrow）はnetworkを返す", async () => {
    function invalidJsonResponse(): Response {
      return {
        ok: false,
        status: 500,
        json: async (): Promise<unknown> => {
          throw new Error("not json");
        },
      } as Response;
    }
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(invalidJsonResponse());

    const result = await deleteRecipe("scr_1", "pw", fetchImpl);

    expect(result).toEqual({ ok: false, code: "network" });
  });
});

describe("reportRecipe", () => {
  test("200正常: POSTでreason/detail/turnstileTokenを送りok:trueを返す（マクロタスク遅延スタブ）", async () => {
    const fetchImpl = vi.fn<FetchLike>(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(jsonResponse({ ok: true })), 0);
        }),
    );

    const result = await reportRecipe(
      "scr_1",
      { reason: "spam", detail: "looks fake", turnstileToken: "tok_1" },
      fetchImpl,
    );

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/recipes/scr_1/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "spam",
        detail: "looks fake",
        turnstileToken: "tok_1",
      }),
    });
  });

  test("403はturnstile＋serverErrorを逐語格納する", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse({ error: "turnstile verification failed" }, false, 403),
      );

    const result = await reportRecipe(
      "scr_1",
      { reason: "other", turnstileToken: "tok_bad" },
      fetchImpl,
    );

    expect(result).toEqual({
      ok: false,
      code: "turnstile",
      serverError: "turnstile verification failed",
    });
  });

  test("429はrateLimited＋serverErrorを逐語格納する", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        jsonResponse({ error: "rate limit exceeded" }, false, 429),
      );

    const result = await reportRecipe(
      "scr_1",
      { reason: "spam", turnstileToken: "tok_1" },
      fetchImpl,
    );

    expect(result).toEqual({
      ok: false,
      code: "rateLimited",
      serverError: "rate limit exceeded",
    });
  });

  test("404はnotFound＋serverErrorを逐語格納する", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ error: "not found" }, false, 404));

    const result = await reportRecipe(
      "scr_missing",
      { reason: "spam", turnstileToken: "tok_1" },
      fetchImpl,
    );

    expect(result).toEqual({
      ok: false,
      code: "notFound",
      serverError: "not found",
    });
  });

  test("400はbadRequest＋serverErrorを逐語格納する", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ error: "invalid reason" }, false, 400));

    const result = await reportRecipe(
      "scr_1",
      { reason: "spam", turnstileToken: "" },
      fetchImpl,
    );

    expect(result).toEqual({
      ok: false,
      code: "badRequest",
      serverError: "invalid reason",
    });
  });

  test("fetch例外はnetworkを返す", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockRejectedValue(new Error("offline"));

    const result = await reportRecipe(
      "scr_1",
      { reason: "spam", turnstileToken: "tok_1" },
      fetchImpl,
    );

    expect(result).toEqual({ ok: false, code: "network" });
  });

  test("非JSON応答（json()がthrow）はnetworkを返す", async () => {
    function invalidJsonResponse(): Response {
      return {
        ok: false,
        status: 500,
        json: async (): Promise<unknown> => {
          throw new Error("not json");
        },
      } as Response;
    }
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(invalidJsonResponse());

    const result = await reportRecipe(
      "scr_1",
      { reason: "spam", turnstileToken: "tok_1" },
      fetchImpl,
    );

    expect(result).toEqual({ ok: false, code: "network" });
  });
});
