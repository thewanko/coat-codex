// tests/fakes/d1.ts — D1Database の in-memory フェイク（技術計画v1 §4.7）
//
// 方式判断: 「SQLを解釈するフェイク」ではなく「in-memoryの行配列をJSで直接操作する
// プログラマブルスタブ」を採用した。ST-14で使うSQLパターンは
// (a) 一覧: SELECT ... WHERE status='published' AND (published_at,id) keyset ...
//     ORDER BY published_at DESC, id DESC LIMIT ?
// (b) 詳細: SELECT ... WHERE id=? AND status='published'
// の2種のみで、汎用SQLパーサを書くコストは過剰（YAGNI）。
// `prepare(sql)` はSQL文字列を保持するだけの薄いラッパーを返し、
// `.bind(...).all()/.first()` の呼び出し時に、あらかじめ登録した
// 「SQL文字列の特徴（含まれるキーワード）→ 行配列に対する操作」を関数として
// ディスパッチする。実SQLとフェイクの操作ロジックが乖離するリスクはあるが、
// テスト対象のハンドラ実装（feed.ts）がSQL文字列自体もこのフェイクと共に
// 変更される前提のため許容する。

export interface FakeRecipeRow {
  id: string;
  status: string;
  handle: string;
  title: string;
  lang: string | null;
  schema_version: number;
  recipe_json: string;
  cover_key: string | null;
  thumb_key: string | null;
  delete_pw_hash: string;
  report_count: number;
  ip_hash: string;
  created_at: string;
  published_at: string | null;
  deleted_at: string | null;
}

type D1Value = string | number | null;

export interface FakeReportRow {
  recipe_id: string;
  reason: string;
  detail: string | null;
  ip_hash: string;
  created_at: string;
}

/** D1PreparedStatement 相当の最小実装。 */
class FakePreparedStatement {
  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
    private readonly params: D1Value[] = [],
  ) {}

  bind(...params: D1Value[]): FakePreparedStatement {
    return new FakePreparedStatement(this.db, this.sql, params);
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const { rows } = this.db.execute(this.sql, this.params);
    return { results: rows as unknown as T[] };
  }

  async first<T = unknown>(): Promise<T | null> {
    const { rows } = this.db.execute(this.sql, this.params);
    return (rows[0] as unknown as T | undefined) ?? null;
  }

  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    const { changes } = this.db.execute(this.sql, this.params);
    return { success: true, meta: { changes } };
  }
}

interface FakeExecuteResult {
  rows: Record<string, unknown>[];
  changes: number;
}

/**
 * D1Database の最小フェイク。`rows` は呼び出し元がテストごとに直接注入する
 * in-memory の recipes 行配列（参照共有・変更はテスト側からも見える）。
 */
export class FakeD1Database {
  constructor(
    public rows: FakeRecipeRow[],
    public settings: Map<string, string> = new Map(),
    public rateLimits: Map<string, number> = new Map(),
    public reports: FakeReportRow[] = [],
  ) {}

  prepare(sql: string): FakePreparedStatement {
    return new FakePreparedStatement(this, sql);
  }

  /**
   * SQL文字列の特徴からハンドラの意図（一覧 keyset / 詳細 / settings / rate_limits /
   * reports）を判別し、対応する in-memory ストアへの操作を実行して結果を返す。
   * `changes` は UPDATE/INSERT が実際に行を変更した件数（run() の meta.changes 相当）。
   */
  execute(sql: string, params: D1Value[]): FakeExecuteResult {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (
      /FROM\s+recipes/i.test(normalized) &&
      /WHERE\s+id\s*=\s*\?/i.test(normalized) &&
      /delete_pw_hash/i.test(normalized)
    ) {
      // 削除用フェッチ: SELECT id, status, delete_pw_hash, cover_key, thumb_key
      //   FROM recipes WHERE id = ?（status で絞らず全 status を返す）
      const [id] = params;
      const row = this.rows.find((r) => r.id === id);
      return {
        rows: row ? [row as unknown as Record<string, unknown>] : [],
        changes: 0,
      };
    }

    if (
      /SELECT\s+status,\s*report_count/i.test(normalized) &&
      /FROM\s+recipes/i.test(normalized) &&
      /WHERE\s+id\s*=\s*\?/i.test(normalized)
    ) {
      // 通報用フェッチ: SELECT status, report_count, cover_key, thumb_key
      //   FROM recipes WHERE id = ?
      //   （status で絞らず全 status を返す＝published/flagged 以外はハンドラ側で404判定）
      const [id] = params;
      const row = this.rows.find((r) => r.id === id);
      return {
        rows: row
          ? [
              {
                status: row.status,
                report_count: row.report_count,
                cover_key: row.cover_key,
                thumb_key: row.thumb_key,
              },
            ]
          : [],
        changes: 0,
      };
    }

    if (
      /FROM\s+recipes/i.test(normalized) &&
      /WHERE\s+id\s*=\s*\?/i.test(normalized)
    ) {
      // 詳細: WHERE id = ? AND status = 'published'
      const [id] = params;
      const row = this.rows.find(
        (r) => r.id === id && r.status === "published",
      );
      return {
        rows: row ? [row as unknown as Record<string, unknown>] : [],
        changes: 0,
      };
    }

    if (
      /FROM\s+recipes/i.test(normalized) &&
      /ORDER BY published_at DESC, id DESC/i.test(normalized)
    ) {
      // 一覧 keyset: WHERE status = 'published' [AND (published_at < ? OR (published_at = ? AND id < ?))]
      // ORDER BY published_at DESC, id DESC LIMIT ?
      let candidates = this.rows.filter((r) => r.status === "published");

      const hasCursor = /published_at\s*<\s*\?/i.test(normalized);
      if (hasCursor) {
        const [cursorPublishedAt, cursorPublishedAt2, cursorId] = params as [
          string,
          string,
          string,
        ];
        candidates = candidates.filter((r) => {
          const pa = r.published_at ?? "";
          if (pa < cursorPublishedAt) return true;
          if (pa === cursorPublishedAt2 && r.id < cursorId) return true;
          return false;
        });
      }

      candidates = candidates.slice().sort((a, b) => {
        const pa = (b.published_at ?? "").localeCompare(a.published_at ?? "");
        if (pa !== 0) return pa;
        return b.id.localeCompare(a.id);
      });

      const limit = Number(params[params.length - 1]);
      return {
        rows: candidates.slice(0, limit) as unknown as Record<
          string,
          unknown
        >[],
        changes: 0,
      };
    }

    if (
      /UPDATE\s+settings/i.test(normalized) &&
      /value\s*=\s*'open'/i.test(normalized)
    ) {
      // UPDATE settings SET value = 'open' WHERE key = 'circuit_breaker' AND value <> 'open'
      //   （条件付き＝既に'open'の行・未設定キーは変化なし＝changes=0）
      const current = this.settings.get("circuit_breaker");
      if (current !== undefined && current !== "open") {
        this.settings.set("circuit_breaker", "open");
        return { rows: [], changes: 1 };
      }
      return { rows: [], changes: 0 };
    }

    if (
      /FROM\s+settings/i.test(normalized) &&
      /WHERE\s+key\s*=\s*\?/i.test(normalized)
    ) {
      // SELECT value FROM settings WHERE key = ?
      const [key] = params as [string];
      return {
        rows: this.settings.has(key) ? [{ value: this.settings.get(key) }] : [],
        changes: 0,
      };
    }

    if (
      /INSERT\s+INTO\s+rate_limits/i.test(normalized) &&
      /RETURNING\s+count/i.test(normalized)
    ) {
      // INSERT INTO rate_limits (bucket, period, count) VALUES (?, ?, 1)
      // ON CONFLICT (bucket, period) DO UPDATE SET count = count + 1 RETURNING count
      const [bucket, period] = params as [string, string];
      const mapKey = bucket + "\n" + period;
      const next = (this.rateLimits.get(mapKey) ?? 0) + 1;
      this.rateLimits.set(mapKey, next);
      return { rows: [{ count: next }], changes: 1 };
    }

    if (/DELETE\s+FROM\s+rate_limits/i.test(normalized)) {
      // DELETE FROM rate_limits WHERE period < ?
      const [cutoff] = params as [string];
      let changes = 0;
      for (const k of [...this.rateLimits.keys()]) {
        const p = k.slice(k.indexOf("\n") + 1);
        if (p < cutoff) {
          this.rateLimits.delete(k);
          changes += 1;
        }
      }
      return { rows: [], changes };
    }

    if (/INSERT\s+OR\s+IGNORE\s+INTO\s+reports/i.test(normalized)) {
      // INSERT OR IGNORE INTO reports (recipe_id, reason, detail, ip_hash, created_at)
      //   VALUES (?, ?, ?, ?, ?)（UNIQUE(recipe_id, ip_hash)＝同一IP多重通報は無視）
      const [recipeId, reason, detail, ipHash, createdAt] = params as [
        string,
        string,
        string | null,
        string,
        string,
      ];
      const VALID_REPORT_REASONS = ["spam", "nsfw", "copyright", "other"];
      if (!VALID_REPORT_REASONS.includes(reason)) {
        // 実D1のCHECK(reason IN (...))制約を代表させる。ハンドラ層のreason検証が
        // 将来退行してもこのフェイクで検出できるようにする。
        throw new Error("CHECK constraint failed: reports.reason");
      }
      const exists = this.reports.some(
        (r) => r.recipe_id === recipeId && r.ip_hash === ipHash,
      );
      if (exists) {
        return { rows: [], changes: 0 };
      }
      this.reports.push({
        recipe_id: recipeId,
        reason,
        detail,
        ip_hash: ipHash,
        created_at: createdAt,
      });
      return { rows: [], changes: 1 };
    }

    if (
      /SELECT\s+COUNT\(\*\)\s+AS\s+cnt/i.test(normalized) &&
      /FROM\s+reports/i.test(normalized)
    ) {
      // SELECT COUNT(*) AS cnt FROM reports WHERE recipe_id = ?
      const [recipeId] = params as [string];
      const cnt = this.reports.filter((r) => r.recipe_id === recipeId).length;
      return { rows: [{ cnt }], changes: 0 };
    }

    if (
      /UPDATE\s+recipes/i.test(normalized) &&
      /report_count\s*=\s*\?/i.test(normalized)
    ) {
      // UPDATE recipes SET report_count = ? WHERE id = ?
      const [reportCount, id] = params as [number, string];
      const row = this.rows.find((r) => r.id === id);
      if (row) {
        row.report_count = reportCount;
        return { rows: [], changes: 1 };
      }
      return { rows: [], changes: 0 };
    }

    if (
      /UPDATE\s+recipes/i.test(normalized) &&
      /status\s*=\s*'flagged'/i.test(normalized)
    ) {
      // UPDATE recipes SET status = 'flagged' WHERE id = ? AND status = 'published'
      //   （条件付き＝既に flagged/pending/deleted の行は変化なし）
      const [id] = params as [string];
      const row = this.rows.find(
        (r) => r.id === id && r.status === "published",
      );
      if (row) {
        row.status = "flagged";
        return { rows: [], changes: 1 };
      }
      return { rows: [], changes: 0 };
    }

    if (
      /UPDATE\s+recipes/i.test(normalized) &&
      /deleted_at\s*=\s*\?/i.test(normalized)
    ) {
      // UPDATE recipes SET status = 'deleted', deleted_at = ? WHERE id = ?
      const [deletedAt, id] = params as [string, string];
      const row = this.rows.find((r) => r.id === id);
      if (row) {
        row.status = "deleted";
        row.deleted_at = deletedAt;
        return { rows: [], changes: 1 };
      }
      return { rows: [], changes: 0 };
    }

    if (/INSERT\s+INTO\s+recipes/i.test(normalized)) {
      // INSERT INTO recipes (id, status, handle, title, lang, schema_version,
      //   recipe_json, cover_key, thumb_key, delete_pw_hash, report_count,
      //   ip_hash, created_at, published_at, deleted_at) VALUES (?, ..., ?)
      const [
        id,
        status,
        handle,
        title,
        lang,
        schemaVersion,
        recipeJson,
        coverKey,
        thumbKey,
        deletePwHash,
        reportCount,
        ipHash,
        createdAt,
        publishedAt,
        deletedAt,
      ] = params as [
        string,
        string,
        string,
        string,
        string | null,
        number,
        string,
        string | null,
        string | null,
        string,
        number,
        string,
        string,
        string | null,
        string | null,
      ];
      const row: FakeRecipeRow = {
        id,
        status,
        handle,
        title,
        lang,
        schema_version: schemaVersion,
        recipe_json: recipeJson,
        cover_key: coverKey,
        thumb_key: thumbKey,
        delete_pw_hash: deletePwHash,
        report_count: reportCount,
        ip_hash: ipHash,
        created_at: createdAt,
        published_at: publishedAt,
        deleted_at: deletedAt,
      };
      this.rows.push(row);
      return { rows: [], changes: 1 };
    }

    throw new Error(`FakeD1Database: unrecognized SQL pattern: ${normalized}`);
  }
}
