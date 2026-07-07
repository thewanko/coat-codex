// src/server/recipePage.ts — GET /r/:id: index.html へ OGP メタタグを注入して返す（技術計画v1 §4.2/§4.6）
//
// 旧 `functions/r/[id].ts`（Pages Function形）から `_worker.js` 方式へ移設した
// プレーンハンドラ。Root=/構成では apps/scriptorium/functions/ が Pages に無視される
// ため（本番実証）、全サーバーロジックを dist/_worker.js（advanced mode）へ一本化する
// worker.ts のエントリから呼ばれる。
//
// index.html の取得手段は §4.6 で `ASSETS.fetch()` を本採用済み（ST-16 curl 検証で確定）。
// `_worker.js` 内では ASSETS バインディングが保証されるため、旧実装にあった
// `context.next()` フォールバックは不要（削除）。
// published レシピのみ D1 から title/handle/cover_key を引いて注入し、
// それ以外（pending/flagged/deleted/不存在・D1取得失敗）は素の index.html を
// そのまま返す（SPA 動作不変が最優先。500 にしない）。

import { matchCache, putCache } from "./cache";
import { buildOgpMeta, injectOgp } from "./ogp";
import type { Bindings } from "./bindings";

const OGP_CACHE_TTL_SECONDS = 300;

interface RecipeMetaRow {
  title: string;
  handle: string;
  cover_key: string | null;
}

/** `_worker.js` から呼ばれる ASSETS バインディングの最小インターフェース。 */
export interface AssetsBinding {
  fetch(request: Request | string | URL): Promise<Response>;
}

export type RecipePageBindings = Bindings & { ASSETS: AssetsBinding };

/**
 * D1 を参照し、published レシピなら OGP メタタグ配列を返す（それ以外は null）。
 * HTMLRewriter（injectOgp）に依存しない純ロジック部として分離し、unit test で
 * 「D1参照〜行判定〜メタ組み立て」の分岐を検証できるようにする（ogp.ts の
 * 純ロジック/HTMLRewriter依存分離と同じ流儀）。
 */
export async function resolveOgpMeta(
  recipeId: string,
  env: Pick<RecipePageBindings, "DB">,
  origin: string,
): Promise<ReturnType<typeof buildOgpMeta> | null> {
  let row: RecipeMetaRow | null = null;
  try {
    row = await env.DB.prepare(
      "SELECT title, handle, cover_key FROM recipes WHERE id = ? AND status = 'published'",
    )
      .bind(recipeId)
      .first<RecipeMetaRow>();
  } catch {
    // D1 取得失敗時は素の index.html を返す（SPA 動作不変を優先）。
    row = null;
  }

  if (!row) return null;

  return buildOgpMeta({
    id: recipeId,
    title: row.title,
    handle: row.handle,
    coverKey: row.cover_key,
    origin,
  });
}

/**
 * `/r/:id` を処理する。id はパスの `/r/` 直下1セグメントから抽出する
 * （ディスパッチ側 worker.ts で該当パターンのみ渡される前提）。
 */
export async function handleRecipePage(
  request: Request,
  env: RecipePageBindings,
): Promise<Response> {
  const cached = await matchCache(request);
  if (cached) return cached;

  const url = new URL(request.url);
  const recipeId = extractRecipeId(url.pathname);

  const indexResponse = await env.ASSETS.fetch(new URL("/", request.url));

  if (!recipeId) {
    return indexResponse;
  }

  const tags = await resolveOgpMeta(recipeId, env, url.origin);

  if (!tags) {
    return indexResponse;
  }

  const ogpResponse = injectOgp(indexResponse, tags);

  if (ogpResponse.status === 200) {
    await putCache(request, ogpResponse.clone(), OGP_CACHE_TTL_SECONDS);
  }

  return ogpResponse;
}

/** `/r/:id` の id セグメントを抽出する。マッチしないパス・不正エンコード（%00等で
 * decodeURIComponentがURIErrorを投げるもの）は null（=素のindex.htmlへ縮退。500経路を作らない）。 */
export function extractRecipeId(pathname: string): string | null {
  const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
