// functions/img/[[path]].ts — Pages Functions 薄アダプタ（技術計画v1 §4.1）
//
// /img/* を Hono アプリ本体（src/server/app.ts の R2 プロキシルート）へ委譲する。
// パススコープでマウントする理由は functions/api/[[path]].ts のコメントを参照。

import { handle } from "hono/cloudflare-pages";
import app from "../../src/server/app";

export const onRequest = handle(app);
