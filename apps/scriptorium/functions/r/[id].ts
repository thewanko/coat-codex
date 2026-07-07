// functions/r/[id].ts — GET /r/:id: index.html へ OGP メタタグを注入して返す（技術計画v1 §4.2/§4.6）
//
// `functions/[[path]].ts`（Hono薄アダプタ）より詳細なパスとして Pages Functions に
// 優先マッチする。published レシピのみ D1 から title/handle/cover_key を引いて注入し、
// それ以外（pending/flagged/deleted/不存在・D1取得失敗）は素の index.html を
// そのまま返す（SPA 動作不変が最優先。500 にしない）。
//
// index.html の取得手段は §4.6 で2案（①`ASSETS.fetch()` ②`context.next()`）を挙げ、
// ST-16 の curl 結合検証で確定するとされている。本実装はまず ASSETS.fetch() を試し、
// 失敗時（未定義・非200）は context.next() へフォールバックする。

import { matchCache, putCache } from "../../src/server/cache";
import { buildOgpMeta, injectOgp } from "../../src/server/ogp";
import type { Bindings } from "../../src/server/bindings";

const OGP_CACHE_TTL_SECONDS = 300;

interface RecipeMetaRow {
  title: string;
  handle: string;
  cover_key: string | null;
}

export const onRequestGet: PagesFunction<Bindings, "id"> = async (context) => {
  const cached = await matchCache(context.request);
  if (cached) return cached;

  const id = context.params.id;
  const recipeId = Array.isArray(id) ? id[0] : id;

  const indexResponse = await fetchIndexHtml(context);

  if (!recipeId) {
    return indexResponse;
  }

  let row: RecipeMetaRow | null = null;
  try {
    row = await context.env.DB.prepare(
      "SELECT title, handle, cover_key FROM recipes WHERE id = ? AND status = 'published'",
    )
      .bind(recipeId)
      .first<RecipeMetaRow>();
  } catch {
    // D1 取得失敗時は素の index.html を返す（SPA 動作不変を優先）。
    row = null;
  }

  if (!row) {
    return indexResponse;
  }

  const origin = new URL(context.request.url).origin;
  const tags = buildOgpMeta({
    id: recipeId,
    title: row.title,
    handle: row.handle,
    coverKey: row.cover_key,
    origin,
  });

  const ogpResponse = injectOgp(indexResponse, tags);

  if (ogpResponse.status === 200) {
    await putCache(context.request, ogpResponse.clone(), OGP_CACHE_TTL_SECONDS);
  }

  return ogpResponse;
};

/**
 * index.html を取得する。まず `context.env.ASSETS.fetch()` を試し、
 * ASSETS が未定義・エラー・非200 応答の場合は `context.next()` へフォールバックする。
 */
async function fetchIndexHtml(
  context: Parameters<PagesFunction<Bindings, "id">>[0],
): Promise<Response> {
  const assets = context.env.ASSETS;
  if (assets) {
    try {
      const response = await assets.fetch(
        new URL("/", context.request.url).toString(),
      );
      if (response.status === 200) {
        return response;
      }
    } catch {
      // ASSETS.fetch が使えない環境ではフォールバックへ。
    }
  }
  return context.next();
}
