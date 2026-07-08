// src/server/bindings.ts — Hono Bindings 型（技術計画v1 §4.3）
//
// S3で使う分（DB・BUCKET）に加え、本タスク（投稿エンドポイント）で使う
// TURNSTILE_SECRET・IP_HASH_SECRET を宣言する。D1Database/R2Bucket は
// tsconfig.server.json の compilerOptions.types で `@cloudflare/workers-types` を
// グローバルに取り込んで解決する（型はこのモジュール経由でのみ export し、
// アプリ側コードが直接 workers-types をグローバル参照しないようにする）。
//
// AI は ST-29（NSFW スクリーニング）で追加。workers-types の `Ai` 型はモデル固有の
// 厳密な run() オーバーロードを持ち、汎用の `AiRunner`（screenImage.ts）とは
// 構造的に噛み合わないため、ここでは screenImage.ts 側の緩い `AiRunner` 型を採用する。
// 未設定環境（ローカル test 等）では undefined のままになる（既存挙動不変）。
//
// MAIL_API_KEY・NOTIFY_EMAIL_TO・NOTIFY_EMAIL_FROM は ST-27（notifier.ts）で追加。
// Resend の API キー・通知先/送信元アドレス。いずれも任意バインディングとし、
// MAIL_API_KEY と NOTIFY_EMAIL_TO が揃っていない環境（ローカル test 等）では
// app.ts 側で notify を注入せず、既存挙動（notify 未注入 = best-effort no-op）を維持する。
//
// ACCESS_DEV_BYPASS は ST-31（/api/admin/* 管理API）で追加。ローカル `.dev.vars`
// 専用の開発用バイパス（値 "on" で Cf-Access-Jwt-Assertion ヘッダ無しでも許可）。
// 本番Pagesの環境変数には絶対に設定しないこと（Cloudflare Access 保護が無効化される）。

import type { AiRunner } from "./moderation/screenImage";

export interface Bindings {
  DB: D1Database;
  BUCKET: R2Bucket;
  TURNSTILE_SECRET: string;
  IP_HASH_SECRET: string;
  AI?: AiRunner;
  MAIL_API_KEY?: string;
  NOTIFY_EMAIL_TO?: string;
  NOTIFY_EMAIL_FROM?: string;
  ACCESS_DEV_BYPASS?: string;
}
