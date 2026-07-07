// src/server/guards/rateLimit.ts — rate_limits テーブルによる投稿レート制限（技術計画v1 §4.2, §4.4）
//
// UPSERT + RETURNING count で「増分してから増分後の値を判定」する。cron が無い
// Pages Functions 環境のため、古い period 行は投稿ハンドラ内で lazy delete する
// （§3.1 コメント）。

export interface RateLimitResult {
  allowed: boolean;
  count: number;
}

/**
 * bucket/period のカウンタを +1 し、増分後の値が limit 以下なら許可する
 * （= ちょうど limit 回まで許可し、limit+1 回目で拒否）。
 */
export async function checkAndIncrementRateLimit(
  db: D1Database,
  bucket: string,
  period: string,
  limit: number,
): Promise<RateLimitResult> {
  const row = await db
    .prepare(
      "INSERT INTO rate_limits (bucket, period, count) VALUES (?, ?, 1) ON CONFLICT (bucket, period) DO UPDATE SET count = count + 1 RETURNING count",
    )
    .bind(bucket, period)
    .first<{ count: number }>();

  if (!row) {
    return { allowed: false, count: 0 };
  }

  return { allowed: row.count <= limit, count: row.count };
}

/** cutoffPeriod より前の rate_limits 行を削除する（cron 不在のための lazy delete）。 */
export async function pruneOldRateLimits(
  db: D1Database,
  cutoffPeriod: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM rate_limits WHERE period < ?")
    .bind(cutoffPeriod)
    .run();
}

/** 日次バケットの period 文字列（"YYYY-MM-DD"）。 */
export function dailyPeriod(nowIso: string): string {
  return nowIso.slice(0, 10);
}

/** 時間次バケットの period 文字列（"YYYY-MM-DDTHH"）。global-post 用。 */
export function hourlyPeriod(nowIso: string): string {
  return nowIso.slice(0, 13);
}
