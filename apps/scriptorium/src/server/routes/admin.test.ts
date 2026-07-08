// @vitest-environment node
// src/server/routes/admin.test.ts — /api/admin/* 統合テスト（技術計画v1 §4.2/§7 S7/ST-31）
//
// app.test.ts の共有フェイク（tests/fakes/d1.ts・r2.ts）とのSQLディスパッチ衝突を
// 避けるため、このファイル内に admin.ts のSQLパターンのみに対応する
// 自己完結のフェイクD1/R2を定義する。

import { describe, expect, test } from "vitest";
import type { Bindings } from "../bindings";
import app from "../app";

interface AdminRecipeRow {
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

class AdminFakePreparedStatement {
  constructor(
    private readonly db: AdminFakeD1Database,
    private readonly sql: string,
    private readonly params: D1Value[] = [],
  ) {}

  bind(...params: D1Value[]): AdminFakePreparedStatement {
    return new AdminFakePreparedStatement(this.db, this.sql, params);
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

class AdminFakeD1Database {
  public lastListBind: D1Value[] | null = null;

  constructor(
    public rows: AdminRecipeRow[],
    public settings: Map<string, string> = new Map(),
  ) {}

  prepare(sql: string): AdminFakePreparedStatement {
    return new AdminFakePreparedStatement(this, sql);
  }

  execute(
    sql: string,
    params: D1Value[],
  ): { rows: Record<string, unknown>[]; changes: number } {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (
      /SELECT id, status, handle, title, lang, report_count/i.test(
        normalized,
      ) &&
      /FROM recipes WHERE status = \?/i.test(normalized)
    ) {
      this.lastListBind = params;
      const [status] = params as [string];
      const filtered = this.rows
        .filter((r) => r.status === status)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return {
        rows: filtered.map((r) => ({
          id: r.id,
          status: r.status,
          handle: r.handle,
          title: r.title,
          lang: r.lang,
          report_count: r.report_count,
          created_at: r.created_at,
          published_at: r.published_at,
          deleted_at: r.deleted_at,
          cover_key: r.cover_key,
          thumb_key: r.thumb_key,
        })) as unknown as Record<string, unknown>[],
        changes: 0,
      };
    }

    if (
      /SELECT id, status, handle, title, lang, schema_version, recipe_json/i.test(
        normalized,
      ) &&
      /FROM recipes WHERE id = \?/i.test(normalized)
    ) {
      const [id] = params as [string];
      const row = this.rows.find((r) => r.id === id);
      // 実SQLの明示列挙と対で射影する（delete_pw_hash・ip_hash は返さない）
      return {
        rows: row
          ? [
              {
                id: row.id,
                status: row.status,
                handle: row.handle,
                title: row.title,
                lang: row.lang,
                schema_version: row.schema_version,
                recipe_json: row.recipe_json,
                cover_key: row.cover_key,
                thumb_key: row.thumb_key,
                report_count: row.report_count,
                created_at: row.created_at,
                published_at: row.published_at,
                deleted_at: row.deleted_at,
              } as unknown as Record<string, unknown>,
            ]
          : [],
        changes: 0,
      };
    }

    if (
      /SELECT status, cover_key, thumb_key FROM recipes WHERE id = \?/i.test(
        normalized,
      )
    ) {
      const [id] = params as [string];
      const row = this.rows.find((r) => r.id === id);
      return {
        rows: row
          ? [
              {
                status: row.status,
                cover_key: row.cover_key,
                thumb_key: row.thumb_key,
              },
            ]
          : [],
        changes: 0,
      };
    }

    if (
      /UPDATE recipes SET status = 'published', published_at = \? WHERE id = \? AND status = 'pending'/i.test(
        normalized,
      )
    ) {
      const [publishedAt, id] = params as [string, string];
      const row = this.rows.find((r) => r.id === id && r.status === "pending");
      if (row) {
        row.status = "published";
        row.published_at = publishedAt;
        return { rows: [], changes: 1 };
      }
      return { rows: [], changes: 0 };
    }

    if (
      /UPDATE recipes SET status = 'published', published_at = COALESCE\(published_at, \?\) WHERE id = \? AND status = 'flagged'/i.test(
        normalized,
      )
    ) {
      const [publishedAt, id] = params as [string, string];
      const row = this.rows.find((r) => r.id === id && r.status === "flagged");
      if (row) {
        row.status = "published";
        row.published_at = row.published_at ?? publishedAt;
        return { rows: [], changes: 1 };
      }
      return { rows: [], changes: 0 };
    }

    if (
      /UPDATE recipes SET status = 'deleted', deleted_at = \? WHERE id = \? AND status != 'deleted'/i.test(
        normalized,
      )
    ) {
      const [deletedAt, id] = params as [string, string];
      const row = this.rows.find((r) => r.id === id && r.status !== "deleted");
      if (row) {
        row.status = "deleted";
        row.deleted_at = deletedAt;
        return { rows: [], changes: 1 };
      }
      return { rows: [], changes: 0 };
    }

    if (/SELECT key, value FROM settings/i.test(normalized)) {
      const rows = [...this.settings.entries()].map(([key, value]) => ({
        key,
        value,
      }));
      return { rows, changes: 0 };
    }

    if (
      /INSERT INTO settings \(key, value\) VALUES \(\?, \?\) ON CONFLICT\(key\) DO UPDATE SET value = excluded\.value/i.test(
        normalized,
      )
    ) {
      const [key, value] = params as [string, string];
      this.settings.set(key, value);
      return { rows: [], changes: 1 };
    }

    throw new Error(`AdminFakeD1Database: unrecognized SQL: ${normalized}`);
  }
}

class AdminFakeR2Bucket {
  public deletedKeys: string[] = [];
  public failDelete = false;

  async delete(key: string): Promise<void> {
    if (this.failDelete) {
      throw new Error("r2 down");
    }
    this.deletedKeys.push(key);
  }
}

function makeRow(overrides: Partial<AdminRecipeRow> = {}): AdminRecipeRow {
  return {
    id: "scr_target",
    status: "pending",
    handle: "painter",
    title: "T",
    lang: "en",
    schema_version: 1,
    recipe_json: '{"a":1}',
    cover_key: null,
    thumb_key: null,
    delete_pw_hash: "hash",
    report_count: 0,
    ip_hash: "iphash",
    created_at: "2026-07-01T00:00:00Z",
    published_at: null,
    deleted_at: null,
    ...overrides,
  };
}

function makeEnv(
  rows: AdminRecipeRow[],
  settings: Record<string, string> = {},
  opts: { accessDevBypass?: string; r2?: AdminFakeR2Bucket } = {},
) {
  const db = new AdminFakeD1Database(rows, new Map(Object.entries(settings)));
  const bucket = opts.r2 ?? new AdminFakeR2Bucket();
  const env = {
    DB: db as unknown as D1Database,
    BUCKET: bucket as unknown as R2Bucket,
    TURNSTILE_SECRET: "test-secret",
    IP_HASH_SECRET: "test-ip-secret",
    ACCESS_DEV_BYPASS: opts.accessDevBypass,
  } satisfies Bindings;
  return { env, db, bucket };
}

const ACCESS_HEADERS = { "Cf-Access-Jwt-Assertion": "valid.jwt.token" };

describe("/api/admin/* 認証ガード", () => {
  test("ヘッダ無し: GET /api/admin/recipes は401", async () => {
    const { env } = makeEnv([]);
    const res = await app.request("/api/admin/recipes?status=pending", {}, env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  test("ヘッダ無し: PUT /api/admin/settings は401", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/settings",
      {
        method: "PUT",
        body: JSON.stringify({ key: "circuit_breaker", value: "open" }),
        headers: { "Content-Type": "application/json" },
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  test("空文字ヘッダは401", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/recipes?status=pending",
      { headers: { "Cf-Access-Jwt-Assertion": "" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  test("ヘッダ有りで通過（200）", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/recipes?status=pending",
      { headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(200);
  });

  test("ACCESS_DEV_BYPASS=on ならヘッダ無しでも通過", async () => {
    const { env } = makeEnv([], {}, { accessDevBypass: "on" });
    const res = await app.request("/api/admin/recipes?status=pending", {}, env);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/recipes 一覧", () => {
  test("status=pending絞り＋返却形", async () => {
    const rows = [
      makeRow({ id: "scr_p1", status: "pending" }),
      makeRow({ id: "scr_pub1", status: "published" }),
    ];
    const { env, db } = makeEnv(rows);
    const res = await app.request(
      "/api/admin/recipes?status=pending",
      { headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.lastListBind).toEqual(["pending"]);
    const body = (await res.json()) as { recipes: { id: string }[] };
    expect(body.recipes).toHaveLength(1);
    expect(body.recipes[0]).toEqual({
      id: "scr_p1",
      status: "pending",
      handle: "painter",
      title: "T",
      lang: "en",
      report_count: 0,
      created_at: "2026-07-01T00:00:00Z",
      published_at: null,
      deleted_at: null,
      cover_key: null,
      thumb_key: null,
    });
  });

  test("status不正で400", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/recipes?status=bogus",
      { headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("status欠如で400", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/recipes",
      { headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/recipes/:id 詳細", () => {
  test("200・recipe_json含む", async () => {
    const rows = [makeRow({ id: "scr_x", recipe_json: '{"title":"x"}' })];
    const { env } = makeEnv(rows);
    const res = await app.request(
      "/api/admin/recipes/scr_x",
      { headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.recipe_json).toBe('{"title":"x"}');
    // データ最小化: 削除PWハッシュとIPハッシュは admin 詳細応答に含めない（review R1 M1）
    expect(body.delete_pw_hash).toBeUndefined();
    expect(body.ip_hash).toBeUndefined();
  });

  test("不存在で404", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/recipes/nonexistent",
      { headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/recipes/:id/approve", () => {
  test("pending→published・published_at設定", async () => {
    const rows = [makeRow({ id: "scr_a", status: "pending" })];
    const { env, db } = makeEnv(rows);
    const res = await app.request(
      "/api/admin/recipes/scr_a/approve",
      { method: "POST", headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body).toEqual({ id: "scr_a", status: "published" });
    expect(db.rows[0].status).toBe("published");
    expect(db.rows[0].published_at).not.toBeNull();
  });

  test("非pendingは409", async () => {
    const rows = [makeRow({ id: "scr_a", status: "published" })];
    const { env } = makeEnv(rows);
    const res = await app.request(
      "/api/admin/recipes/scr_a/approve",
      { method: "POST", headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /api/admin/recipes/:id/restore", () => {
  test("flagged→published", async () => {
    const rows = [makeRow({ id: "scr_r", status: "flagged" })];
    const { env, db } = makeEnv(rows);
    const res = await app.request(
      "/api/admin/recipes/scr_r/restore",
      { method: "POST", headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.rows[0].status).toBe("published");
  });

  test("published_at既存値は保持（COALESCE）", async () => {
    const rows = [
      makeRow({
        id: "scr_r",
        status: "flagged",
        published_at: "2026-06-01T00:00:00Z",
      }),
    ];
    const { env, db } = makeEnv(rows);
    await app.request(
      "/api/admin/recipes/scr_r/restore",
      { method: "POST", headers: ACCESS_HEADERS },
      env,
    );
    expect(db.rows[0].published_at).toBe("2026-06-01T00:00:00Z");
  });

  test("非flaggedは409", async () => {
    const rows = [makeRow({ id: "scr_r", status: "published" })];
    const { env } = makeEnv(rows);
    const res = await app.request(
      "/api/admin/recipes/scr_r/restore",
      { method: "POST", headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /api/admin/recipes/:id/delete", () => {
  test("200＋R2 delete呼び出し(cover/thumb両key)", async () => {
    const rows = [
      makeRow({
        id: "scr_d",
        status: "published",
        cover_key: "covers/scr_d.webp",
        thumb_key: "thumbs/scr_d.webp",
      }),
    ];
    const { env, db, bucket } = makeEnv(rows);
    const res = await app.request(
      "/api/admin/recipes/scr_d/delete",
      { method: "POST", headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.rows[0].status).toBe("deleted");
    expect(bucket.deletedKeys).toEqual([
      "covers/scr_d.webp",
      "thumbs/scr_d.webp",
    ]);
  });

  test("R2失敗でも200（best-effort）", async () => {
    const rows = [
      makeRow({
        id: "scr_d",
        status: "published",
        cover_key: "covers/scr_d.webp",
      }),
    ];
    const failingBucket = new AdminFakeR2Bucket();
    failingBucket.failDelete = true;
    const { env, db } = makeEnv(rows, {}, { r2: failingBucket });
    const res = await app.request(
      "/api/admin/recipes/scr_d/delete",
      { method: "POST", headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.rows[0].status).toBe("deleted");
  });

  test("既deletedは404", async () => {
    const rows = [makeRow({ id: "scr_d", status: "deleted" })];
    const { env } = makeEnv(rows);
    const res = await app.request(
      "/api/admin/recipes/scr_d/delete",
      { method: "POST", headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(404);
  });

  test("cover_key null時はR2呼ばれない", async () => {
    const rows = [
      makeRow({
        id: "scr_d",
        status: "published",
        cover_key: null,
        thumb_key: null,
      }),
    ];
    const { env, bucket } = makeEnv(rows);
    const res = await app.request(
      "/api/admin/recipes/scr_d/delete",
      { method: "POST", headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(200);
    expect(bucket.deletedKeys).toEqual([]);
  });
});

describe("GET /api/admin/settings", () => {
  test("全件返却形", async () => {
    const { env } = makeEnv([], {
      moderation_mode: "auto",
      report_threshold: "3",
    });
    const res = await app.request(
      "/api/admin/settings",
      { headers: ACCESS_HEADERS },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { settings: Record<string, string> };
    expect(body.settings).toEqual({
      moderation_mode: "auto",
      report_threshold: "3",
    });
  });
});

describe("PUT /api/admin/settings", () => {
  function putRequest(body: unknown) {
    return {
      method: "PUT" as const,
      body: JSON.stringify(body),
      headers: { ...ACCESS_HEADERS, "Content-Type": "application/json" },
    };
  }

  test("正常: enum 1件", async () => {
    const { env, db } = makeEnv([]);
    const res = await app.request(
      "/api/admin/settings",
      putRequest({ key: "circuit_breaker", value: "open" }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; value: string };
    expect(body).toEqual({ key: "circuit_breaker", value: "open" });
    expect(db.settings.get("circuit_breaker")).toBe("open");
  });

  test("正常: 数値 1件", async () => {
    const { env, db } = makeEnv([]);
    const res = await app.request(
      "/api/admin/settings",
      putRequest({ key: "report_threshold", value: "5" }),
      env,
    );
    expect(res.status).toBe(200);
    expect(db.settings.get("report_threshold")).toBe("5");
  });

  test("正常: 数値の先頭ゼロは正規化して保存する（review R1 L2）", async () => {
    const { env, db } = makeEnv([]);
    const res = await app.request(
      "/api/admin/settings",
      putRequest({ key: "report_threshold", value: "05" }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; value: string };
    expect(body.value).toBe("5");
    expect(db.settings.get("report_threshold")).toBe("5");
  });

  test("不正key: 400", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/settings",
      putRequest({ key: "not_a_real_key", value: "x" }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("不正value: enum外は400", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/settings",
      putRequest({ key: "moderation_mode", value: "bogus" }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("不正value: 非整数は400", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/settings",
      putRequest({ key: "daily_post_limit", value: "abc" }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("不正value: 範囲外0は400", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/settings",
      putRequest({ key: "hourly_global_limit", value: "0" }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("不正value: 範囲外10001は400", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/settings",
      putRequest({ key: "hourly_global_limit", value: "10001" }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("不正JSON: 400", async () => {
    const { env } = makeEnv([]);
    const res = await app.request(
      "/api/admin/settings",
      {
        method: "PUT",
        body: "not-json{{{",
        headers: { ...ACCESS_HEADERS, "Content-Type": "application/json" },
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});
