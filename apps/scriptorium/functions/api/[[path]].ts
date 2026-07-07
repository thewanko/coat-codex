// functions/api/[[path]].ts — Pages Functions 薄アダプタ（技術計画v1 §4.1）
//
// Hono アプリ本体（src/server/app.ts）を hono/cloudflare-pages の handle() に渡すだけ。
// ルート直下の catch-all（functions/[[path]].ts）は静的アセット配信と SPA フォールバックを
// 遮蔽して全ページが 404 になるため、Functions は /api・/img・/r/:id のパススコープでのみ
// マウントする（S3出口実機検証で検出・是正）。
// 将来 Worker + Static Assets へ移す場合はこのアダプタの差し替えのみで済む設計。

import { handle } from "hono/cloudflare-pages";
import app from "../../src/server/app";

export const onRequest = handle(app);
