// @vitest-environment node
// src/server/routes/report.test.ts — POST /api/recipes/:id/report 統合テスト（技術計画v1 §4.2/§3.1）

import { describe, expect, test, vi } from "vitest";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { handleReportRecipe, type ReportDeps } from "./report";
import type { ModerationEvent } from "../moderation/events";
import app from "../app";
import { FakeD1Database, type FakeRecipeRow } from "../../../tests/fakes/d1";
import { FakeR2Bucket } from "../../../tests/fakes/r2";

const NOW = new Date("2026-07-08T09:00:00Z");

function makeRow(overrides: Partial<FakeRecipeRow> = {}): FakeRecipeRow {
  return {
    id: "scr_target",
    status: "published",
    handle: "painter",
    title: "T",
    lang: "en",
    schema_version: 1,
    recipe_json: "{}",
    cover_key: null,
    thumb_key: null,
    delete_pw_hash: "",
    report_count: 0,
    ip_hash: "hash",
    created_at: "2026-07-01T00:00:00Z",
    published_at: "2026-07-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

async function makeEnv(
  rows: FakeRecipeRow[],
  settings: Record<string, string> = {},
) {
  const settingsMap = new Map(Object.entries(settings));
  const db = new FakeD1Database(rows, settingsMap);
  const bucket = new FakeR2Bucket();
  return {
    DB: db as unknown as D1Database,
    BUCKET: bucket as unknown as R2Bucket,
    TURNSTILE_SECRET: "test-secret",
    IP_HASH_SECRET: "test-ip-secret",
  } satisfies Bindings;
}

function makeStubDeps(overrides: Partial<ReportDeps> = {}): ReportDeps {
  return {
    now: () => NOW,
    verifyTurnstile: async () => true,
    ...overrides,
  };
}

function buildTestApp(deps: ReportDeps) {
  return new Hono<{ Bindings: Bindings }>().post(
    "/api/recipes/:id/report",
    (c) => handleReportRecipe(c, deps),
  );
}

function reportRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return {
    method: "POST" as const,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  };
}

const VALID_BODY = { reason: "spam", turnstileToken: "tok" };

describe("POST /api/recipes/:id/report 正常系", () => {
  test("有効な通報で200 {ok: true}・reports 1件・report_count同期", async () => {
    const row = makeRow();
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY),
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body).toEqual({ ok: true });

    const db = env.DB as unknown as FakeD1Database;
    expect(db.reports).toHaveLength(1);
    expect(db.reports[0].reason).toBe("spam");
    expect(db.reports[0].detail).toBeNull();
    expect(db.rows[0].report_count).toBe(1);
    expect(db.rows[0].status).toBe("published");
  });

  test("detail省略→null格納", async () => {
    const row = makeRow();
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest({ reason: "other", turnstileToken: "tok" }),
      env,
    );
    const db = env.DB as unknown as FakeD1Database;
    expect(db.reports[0].detail).toBeNull();
  });

  test("detail空文字→null格納", async () => {
    const row = makeRow();
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest({ reason: "other", detail: "   ", turnstileToken: "tok" }),
      env,
    );
    const db = env.DB as unknown as FakeD1Database;
    expect(db.reports[0].detail).toBeNull();
  });

  test("detailあり(trim後)を保存", async () => {
    const row = makeRow();
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest({
        reason: "copyright",
        detail: "  this is stolen  ",
        turnstileToken: "tok",
      }),
      env,
    );
    const db = env.DB as unknown as FakeD1Database;
    expect(db.reports[0].detail).toBe("this is stolen");
  });

  test("flagged状態の行にも通報でき200", async () => {
    const row = makeRow({ status: "flagged", report_count: 3 });
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(
        { reason: "spam", turnstileToken: "tok" },
        {
          "CF-Connecting-IP": "1.1.1.1",
        },
      ),
      env,
    );
    expect(res.status).toBe(200);
  });

  test("同一IP2回目は200だがreportsは1件のまま・report_count=1", async () => {
    const row = makeRow();
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    const headers = { "CF-Connecting-IP": "2.2.2.2" };

    const res1 = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY, headers),
      env,
    );
    const res2 = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY, headers),
      env,
    );

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const db = env.DB as unknown as FakeD1Database;
    expect(db.reports).toHaveLength(1);
    expect(db.rows[0].report_count).toBe(1);
  });

  test("threshold=3で異なるip 3件目にstatus='flagged'＋notify 1回・イベント内容検証", async () => {
    const row = makeRow();
    const env = await makeEnv([row], { report_threshold: "3" });
    const notify = vi
      .fn<(event: ModerationEvent) => Promise<void>>()
      .mockResolvedValue(undefined);
    const testApp = buildTestApp(makeStubDeps({ notify }));

    await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY, { "CF-Connecting-IP": "1.1.1.1" }),
      env,
    );
    await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY, { "CF-Connecting-IP": "2.2.2.2" }),
      env,
    );
    expect(notify).not.toHaveBeenCalled();
    expect((env.DB as unknown as FakeD1Database).rows[0].status).toBe(
      "published",
    );
    const res3 = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY, { "CF-Connecting-IP": "3.3.3.3" }),
      env,
    );

    expect(res3.status).toBe(200);
    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows[0].status).toBe("flagged");
    expect(db.rows[0].report_count).toBe(3);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      type: "flagged",
      recipeId: "scr_target",
      reportCount: 3,
    });
  });

  test("flagged遷移後の追加通報は200・notify再発火なし", async () => {
    const row = makeRow({ status: "flagged", report_count: 3 });
    const env = await makeEnv([row], { report_threshold: "3" });
    const notify = vi
      .fn<(event: ModerationEvent) => Promise<void>>()
      .mockResolvedValue(undefined);
    const testApp = buildTestApp(makeStubDeps({ notify }));

    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY, { "CF-Connecting-IP": "9.9.9.9" }),
      env,
    );

    expect(res.status).toBe(200);
    expect(notify).not.toHaveBeenCalled();
    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows[0].status).toBe("flagged");
  });

  test("notify throw→200維持", async () => {
    const row = makeRow();
    const env = await makeEnv([row], { report_threshold: "1" });
    const notify = vi
      .fn<(event: ModerationEvent) => Promise<void>>()
      .mockRejectedValue(new Error("smtp down"));
    const testApp = buildTestApp(makeStubDeps({ notify }));

    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY, { "CF-Connecting-IP": "5.5.5.5" }),
      env,
    );

    expect(res.status).toBe(200);
    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows[0].status).toBe("flagged");
  });

  test("notify未注入でも200・flagged遷移は発生", async () => {
    const row = makeRow();
    const env = await makeEnv([row], { report_threshold: "1" });
    const testApp = buildTestApp(makeStubDeps());

    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY, { "CF-Connecting-IP": "6.6.6.6" }),
      env,
    );

    expect(res.status).toBe(200);
    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows[0].status).toBe("flagged");
  });
});

describe("POST /api/recipes/:id/report 400系", () => {
  test("body不正: JSONでない→400", async () => {
    const env = await makeEnv([makeRow()]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      {
        method: "POST",
        body: "not-json{{{",
        headers: { "Content-Type": "application/json" },
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("reason不正な値→400", async () => {
    const env = await makeEnv([makeRow()]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest({ reason: "not-a-reason", turnstileToken: "tok" }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("reason欠落→400", async () => {
    const env = await makeEnv([makeRow()]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest({ turnstileToken: "tok" }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("detailが1001字→400", async () => {
    const env = await makeEnv([makeRow()]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest({
        reason: "spam",
        detail: "a".repeat(1001),
        turnstileToken: "tok",
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  test("detailちょうど1000字は許可（200）", async () => {
    const env = await makeEnv([makeRow()]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest({
        reason: "spam",
        detail: "a".repeat(1000),
        turnstileToken: "tok",
      }),
      env,
    );
    expect(res.status).toBe(200);
  });

  test("turnstileToken欠落→400", async () => {
    const env = await makeEnv([makeRow()]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest({ reason: "spam" }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/recipes/:id/report 403", () => {
  test("turnstile false→403", async () => {
    const env = await makeEnv([makeRow()]);
    const testApp = buildTestApp(
      makeStubDeps({ verifyTurnstile: async () => false }),
    );
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/recipes/:id/report 429", () => {
  test("同一IPで10回まで許可・11回目429（不存在idへの連投でも429が404より先）", async () => {
    const env = await makeEnv([]);
    const testApp = buildTestApp(makeStubDeps());
    const headers = { "CF-Connecting-IP": "7.7.7.7" };

    for (let i = 0; i < 10; i += 1) {
      const res = await testApp.request(
        "/api/recipes/nonexistent/report",
        reportRequest(VALID_BODY, headers),
        env,
      );
      expect(res.status).toBe(404);
    }

    const res11 = await testApp.request(
      "/api/recipes/nonexistent/report",
      reportRequest(VALID_BODY, headers),
      env,
    );
    expect(res11.status).toBe(429);
  });
});

describe("POST /api/recipes/:id/report 404（存在秘匿）", () => {
  test("不存在id→404", async () => {
    const env = await makeEnv([]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/nonexistent/report",
      reportRequest(VALID_BODY, { "CF-Connecting-IP": "8.8.8.1" }),
      env,
    );
    expect(res.status).toBe(404);
  });

  test("pending状態の行→404", async () => {
    const row = makeRow({ status: "pending", published_at: null });
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY, { "CF-Connecting-IP": "8.8.8.2" }),
      env,
    );
    expect(res.status).toBe(404);
  });

  test("deleted状態の行→404", async () => {
    const row = makeRow({
      status: "deleted",
      deleted_at: "2026-07-02T00:00:00Z",
    });
    const env = await makeEnv([row]);
    const testApp = buildTestApp(makeStubDeps());
    const res = await testApp.request(
      "/api/recipes/scr_target/report",
      reportRequest(VALID_BODY, { "CF-Connecting-IP": "8.8.8.3" }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("app.ts 結線確認", () => {
  test("本番appにPOST /api/recipes/:id/reportが結線され、空secretでTurnstileが403（fetch非依存）", async () => {
    const env = await makeEnv([]);
    (env as unknown as { TURNSTILE_SECRET: string }).TURNSTILE_SECRET = "";
    const res = await app.request(
      "/api/recipes/nonexistent/report",
      reportRequest(VALID_BODY, { "CF-Connecting-IP": "8.8.8.4" }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
