// src/server/cache.ts — Cache API ヘルパー（技術計画v1 §4.5）
//
// 一覧・詳細レスポンスを `caches.default` に TTL 付きで格納する。
// vitest（node環境）には `caches` グローバルが存在しないため、
// `typeof caches === "undefined"` の環境では素通し（キャッシュなし）する。
// このため unit test はキャッシュなし経路（実際のハンドラロジック）を検証し、
// ヘルパー自体はスタブ caches の注入で別途1本テストする。

/** `caches.default` 相当の最小インターフェース（テストのスタブ注入用）。 */
export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/**
 * リクエストに対応するキャッシュ済みレスポンスがあれば返す。
 * `caches` が存在しない環境（vitest node）では常に undefined。
 */
export async function matchCache(
  request: Request,
  cacheOverride?: CacheLike,
): Promise<Response | undefined> {
  const cache = cacheOverride ?? getDefaultCache();
  if (!cache) return undefined;
  return cache.match(request);
}

/**
 * レスポンスを `caches.default` へ TTL 付きで格納する（fire-and-forgetではなく待機して呼ぶ）。
 * `caches` が存在しない環境では何もしない。
 * `response` は呼び出し側で複製済みのものを渡すこと（body は一度しか読めないため）。
 */
export async function putCache(
  request: Request,
  response: Response,
  ttlSeconds: number,
  cacheOverride?: CacheLike,
): Promise<void> {
  const cache = cacheOverride ?? getDefaultCache();
  if (!cache) return;
  const cacheableResponse = new Response(response.body, response);
  cacheableResponse.headers.set(
    "Cache-Control",
    `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
  );
  await cache.put(request, cacheableResponse);
}

function getDefaultCache(): CacheLike | undefined {
  if (typeof caches === "undefined") return undefined;
  return caches.default as unknown as CacheLike;
}
