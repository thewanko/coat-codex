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
    const results = this.db.execute(this.sql, this.params) as T[];
    return { results };
  }

  async first<T = unknown>(): Promise<T | null> {
    const results = this.db.execute(this.sql, this.params) as T[];
    return results[0] ?? null;
  }

  async run(): Promise<{ success: boolean }> {
    this.db.execute(this.sql, this.params);
    return { success: true };
  }
}

/**
 * D1Database の最小フェイク。`rows` は呼び出し元がテストごとに直接注入する
 * in-memory の recipes 行配列（参照共有・変更はテスト側からも見える）。
 */
export class FakeD1Database {
  constructor(public rows: FakeRecipeRow[]) {}

  prepare(sql: string): FakePreparedStatement {
    return new FakePreparedStatement(this, sql);
  }

  /**
   * SQL文字列の特徴からハンドラの意図（一覧 keyset / 詳細）を判別し、
   * `rows` に対する操作を実行して結果行配列を返す。
   */
  execute(sql: string, params: D1Value[]): FakeRecipeRow[] {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (
      /FROM\s+recipes/i.test(normalized) &&
      /WHERE\s+id\s*=\s*\?/i.test(normalized)
    ) {
      // 詳細: WHERE id = ? AND status = 'published'
      const [id] = params;
      const row = this.rows.find(
        (r) => r.id === id && r.status === "published",
      );
      return row ? [row] : [];
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
      return candidates.slice(0, limit);
    }

    throw new Error(`FakeD1Database: unrecognized SQL pattern: ${normalized}`);
  }
}
