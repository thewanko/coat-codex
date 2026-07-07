// lib/api.ts — scriptorium API クライアント薄層（技術計画v1 §4.2）
//
// GET /api/recipes?cursor&limit / GET /api/recipes/:id を呼ぶだけの薄いfetchラッパー。
// fetch実装は引数注入可能にし、テストではスタブに差し替える（codex流のDI）。
// 同一オリジンAPI（§4.1）のため相対パスで呼ぶ。

import type { PublishedRecipe } from "@coat-codex/recipe-core";

export interface FeedItem {
  id: string;
  title: string;
  handle: string;
  lang: string | null;
  publishedAt: string;
  thumbUrl: string | null;
}

export interface FeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
}

export interface RecipeDetailResponse {
  id: string;
  handle: string;
  lang: string | null;
  publishedAt: string;
  coverUrl: string | null;
  thumbUrl: string | null;
  recipe: PublishedRecipe;
}

export type FetchLike = typeof fetch;

/**
 * GET /api/recipes?cursor&limit — 公開一覧を取得する。
 * 非2xx応答・ネットワークエラーはnullを返す（呼び出し側でエラー状態に落とす）。
 */
export async function fetchFeed(
  cursor?: string,
  fetchImpl: FetchLike = fetch,
): Promise<FeedResponse | null> {
  const params = new URLSearchParams();
  if (cursor) {
    params.set("cursor", cursor);
  }
  const query = params.toString();
  const url = query ? `/api/recipes?${query}` : "/api/recipes";

  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as FeedResponse;
  } catch {
    return null;
  }
}

/**
 * GET /api/recipes/:id — レシピ詳細を取得する。
 * 404（非公開/不存在）・非2xx応答・ネットワークエラーはnullを返す。
 */
export async function fetchRecipeDetail(
  id: string,
  fetchImpl: FetchLike = fetch,
): Promise<RecipeDetailResponse | null> {
  try {
    const response = await fetchImpl(`/api/recipes/${encodeURIComponent(id)}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as RecipeDetailResponse;
  } catch {
    return null;
  }
}
