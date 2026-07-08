// src/server/guards/circuitBreaker.ts — サーキットブレーカー判定・自動遷移（技術計画v1 §4.2, §4.4, S6 ST-28）
//
// settings.circuit_breaker='open' のとき投稿を全拒否（503）。'closed'・未設定は通す。

import { getSetting } from "../settings";

/** settings.circuit_breaker が "open" のとき true（投稿を全拒否すべき状態）。 */
export async function isCircuitOpen(db: D1Database): Promise<boolean> {
  const value = await getSetting(db, "circuit_breaker");
  return value === "open";
}

/**
 * settings.circuit_breaker が 'open' でなければ 'open' へ遷移させる（ST-28）。
 * 条件付き UPDATE（WHERE value <> 'open'）により、closed→open の遷移が起きた
 * 呼び出しだけが true を返す（冪等・並行呼び出し下でも遷移は1回だけ true）。
 * settings.circuit_breaker 行は 0001_init.sql の INSERT OR IGNORE で必ず存在する
 * 前提（UPDATE は新規行を作らないため、行が無ければ常に changes=0 になる）。
 */
export async function openCircuitIfClosed(db: D1Database): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE settings SET value = 'open' WHERE key = 'circuit_breaker' AND value <> 'open'",
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
}
