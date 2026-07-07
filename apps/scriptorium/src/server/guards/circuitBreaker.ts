// src/server/guards/circuitBreaker.ts — サーキットブレーカー判定（技術計画v1 §4.2, §4.4）
//
// settings.circuit_breaker='open' のとき投稿を全拒否（503）。'closed'・未設定は通す。

import { getSetting } from "../settings";

/** settings.circuit_breaker が "open" のとき true（投稿を全拒否すべき状態）。 */
export async function isCircuitOpen(db: D1Database): Promise<boolean> {
  const value = await getSetting(db, "circuit_breaker");
  return value === "open";
}
