// src/server/worker.ts — `dist/_worker.js`（Pages advanced mode）のエントリ（技術計画v1 §4.1/§4.2/§4.3）
//
// 本番Pagesプロジェクト（coat-scriptorium）は Root directory=`/`・Output=`apps/scriptorium/dist`
// 構成で運用する。この構成では Pages はリポジトリルート直下の `functions/` しか探索せず、
// `apps/scriptorium/functions/` は無視される（本番実証: バンドルハッシュ一致のデプロイで
// /api/recipes がSPAフォールバックHTMLを返した）。
//
// 是正として、ビルド出力 `dist/_worker.js`（Pages advanced mode。出力ディレクトリ内に
// 置くためRoot設定と無関係に必ず有効化される）へ全サーバーロジックを一本化する。
// §4.1 の移行保険（Hono アプリ本体 app.ts の差し替えのみで Worker+Static Assets へ移行可能な設計）
// と同型で、ここでも app.ts・cache.ts・ogp.ts・bindings.ts は無改変で流用する。
//
// `_worker.js` は全リクエストを受けるため、非対象経路は `env.ASSETS.fetch(request)` へ
// 明示フォールバックする（Pages のアセット配信ロジック＝SPAフォールバック込み、が適用される）。
// catch-all で静的配信を殺した過去の事故（apps/scriptorium/functions/ 廃止前の
// `functions/[[path]].ts` 全滅事故）の再発防止として、非APIルートは必ず ASSETS へ委譲すること。

import app from "./app";
import { handleRecipePage, type RecipePageBindings } from "./recipePage";

const RECIPE_PAGE_PATTERN = /^\/r\/[^/]+\/?$/;

export type WorkerEnv = RecipePageBindings;

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/img/")) {
      return app.fetch(request, env, ctx);
    }

    if (request.method === "GET" && RECIPE_PAGE_PATTERN.test(url.pathname)) {
      return handleRecipePage(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
