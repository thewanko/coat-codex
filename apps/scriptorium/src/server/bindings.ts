// src/server/bindings.ts — Hono Bindings 型（技術計画v1 §4.3）
//
// S3で使う分（DB・BUCKET）に加え、本タスク（投稿エンドポイント）で使う
// TURNSTILE_SECRET・IP_HASH_SECRET を宣言する。D1Database/R2Bucket は
// tsconfig.server.json の compilerOptions.types で `@cloudflare/workers-types` を
// グローバルに取り込んで解決する（型はこのモジュール経由でのみ export し、
// アプリ側コードが直接 workers-types をグローバル参照しないようにする）。

export interface Bindings {
  DB: D1Database;
  BUCKET: R2Bucket;
  TURNSTILE_SECRET: string;
  IP_HASH_SECRET: string;
}
