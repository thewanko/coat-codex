// functions/[[path]].ts — Pages Functions 薄アダプタ（技術計画v1 §4.1）
//
// Hono アプリ本体（src/server/app.ts）を hono/cloudflare-pages の handle() に渡すだけ。
// 将来 Worker + Static Assets へ移す場合はこのアダプタの差し替えのみで済む設計。

import { handle } from "hono/cloudflare-pages";
import app from "../src/server/app";

export const onRequest = handle(app);
