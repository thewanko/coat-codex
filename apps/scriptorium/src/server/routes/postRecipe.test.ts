// @vitest-environment node
// src/server/routes/postRecipe.test.ts — POST /api/recipes 統合テスト（技術計画v1 §4.2/§4.4/§3.1/§3.2/§2.3）

import { describe, expect, test, vi } from "vitest";
import { Hono } from "hono";
import type { Bindings } from "../bindings";
import { handlePostRecipe, hashIp, type PostRecipeDeps } from "./postRecipe";
import app from "../app";
import { FakeD1Database, type FakeRecipeRow } from "../../../tests/fakes/d1";
import { FakeR2Bucket } from "../../../tests/fakes/r2";
import type { ModerationEvent } from "../moderation/events";

const NOW = new Date("2026-07-08T09:00:00Z");

/** base64 文字列を Uint8Array に変換する（Node の Buffer に依存せず atob を使う）。 */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const VALID_COVER_BYTES = base64ToBytes(
  "UklGRhgAAABXRUJQVlA4TAwAAAAvAAAAEChyySrT/wA=",
);

const VALID_RECIPE = {
  scriptoriumSchemaVersion: 1,
  title: "T",
  palette: [],
  tools: [],
  baseSteps: [],
  parts: [],
};

function asciiBytes(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

function u16le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

/** SOFn セグメントの中身（precision(1)/height(2 BE)/width(2 BE)/成分情報）。imageHeader.test.ts と同型。 */
function buildSofPayload(width: number, height: number): number[] {
  const numComponents = 3;
  const components = [1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return [
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    numComponents,
    ...components,
  ];
}

/** SOI + SOF0(width×height) + EOI の最小JPEGフィクスチャ。imageHeader.test.ts と同型。 */
function buildJpeg(width: number, height: number): Uint8Array {
  const payload = buildSofPayload(width, height);
  const length = payload.length + 2;
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xc0, // SOF0
    (length >> 8) & 0xff,
    length & 0xff,
    ...payload,
    0xff,
    0xd9, // EOI
  ]);
}

/** VP8 (lossy) の合成フィクスチャ。長辺超過ケースの寸法検査を検証するため使う（imageHeader.test.ts と同型）。 */
function buildVP8Lossy(width: number, height: number): Uint8Array {
  const payload = [
    0x00,
    0x00,
    0x00,
    0x9d,
    0x01,
    0x2a,
    ...u16le(width),
    ...u16le(height),
  ];
  const chunkSize = 4 + payload.length;
  const bytes = [
    ...asciiBytes("RIFF"),
    ...u16le(chunkSize),
    0,
    0,
    ...asciiBytes("WEBP"),
    ...asciiBytes("VP8 "),
    ...u16le(payload.length),
    0,
    0,
    ...payload,
  ];
  return new Uint8Array(bytes);
}

function makeEnv(settings: Record<string, string> = {}) {
  const rows: FakeRecipeRow[] = [];
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

function makeStubDeps(overrides: Partial<PostRecipeDeps> = {}): PostRecipeDeps {
  return {
    verifyTurnstile: async () => true,
    now: () => NOW,
    randomId: () => "scr_test_fixed",
    ...overrides,
  };
}

function buildTestApp(deps: PostRecipeDeps) {
  return new Hono<{ Bindings: Bindings }>().post("/api/recipes", (c) =>
    handlePostRecipe(c, deps),
  );
}

function buildFormData(opts: {
  handle?: string;
  lang?: string | null;
  recipe?: unknown;
  deletePassword?: string;
  turnstileToken?: string;
  includeCover?: boolean;
  coverBytes?: Uint8Array;
  coverFileName?: string;
  coverMimeType?: string;
  includeThumb?: boolean;
  thumbBytes?: Uint8Array;
  thumbFileName?: string;
  thumbMimeType?: string;
  rawPayload?: string;
}): FormData {
  const formData = new FormData();
  const payload = {
    handle: opts.handle ?? "painter",
    lang: opts.lang ?? "en",
    recipe: opts.recipe ?? VALID_RECIPE,
    deletePassword: opts.deletePassword ?? "password123",
    turnstileToken: opts.turnstileToken ?? "tok",
  };
  formData.append(
    "payload",
    opts.rawPayload !== undefined ? opts.rawPayload : JSON.stringify(payload),
  );
  if (opts.includeCover !== false && opts.coverBytes) {
    formData.append(
      "cover",
      new File([opts.coverBytes], opts.coverFileName ?? "cover.webp", {
        type: opts.coverMimeType ?? "image/webp",
      }),
    );
  }
  if (opts.includeThumb !== false && opts.thumbBytes) {
    formData.append(
      "thumb",
      new File([opts.thumbBytes], opts.thumbFileName ?? "thumb.webp", {
        type: opts.thumbMimeType ?? "image/webp",
      }),
    );
  }
  return formData;
}

describe("hashIp", () => {
  test("同一(ip, secret)で安定した64文字hex", async () => {
    const a = await hashIp("1.2.3.4", "secret1");
    const b = await hashIp("1.2.3.4", "secret1");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test("異なるipで異なるhex", async () => {
    const a = await hashIp("1.2.3.4", "secret1");
    const b = await hashIp("5.6.7.8", "secret1");
    expect(a).not.toBe(b);
  });
});

describe("POST /api/recipes 正常系", () => {
  test("cover/thumb あり・auto モードで201・DB/R2反映", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({
      coverBytes: VALID_COVER_BYTES,
      thumbBytes: VALID_COVER_BYTES,
    });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      url: string;
      status: string;
    };
    expect(body.id).toBe("scr_test_fixed");
    expect(body.url).toBe(
      "https://scriptorium.coat-codex.com/r/scr_test_fixed",
    );
    expect(body.status).toBe("published");

    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].status).toBe("published");
    expect(db.rows[0].title).toBe("T");
    expect(db.rows[0].cover_key).toBe("covers/scr_test_fixed.webp");
    expect(db.rows[0].thumb_key).toBe("thumbs/scr_test_fixed.webp");
    expect(db.rows[0].published_at).toBe(NOW.toISOString());

    const bucket = env.BUCKET as unknown as FakeR2Bucket;
    const stored = await bucket.get("covers/scr_test_fixed.webp");
    expect(stored).not.toBeNull();
  });

  test("有効なJPEG cover/thumbで201・R2に.jpgキー＋image/jpegで保存", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const jpegBytes = buildJpeg(100, 100);
    const formData = buildFormData({
      coverBytes: jpegBytes,
      coverFileName: "cover.jpg",
      coverMimeType: "image/jpeg",
      thumbBytes: jpegBytes,
      thumbFileName: "thumb.jpg",
      thumbMimeType: "image/jpeg",
    });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(201);

    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows[0].cover_key).toBe("covers/scr_test_fixed.jpg");
    expect(db.rows[0].thumb_key).toBe("thumbs/scr_test_fixed.jpg");

    const bucket = env.BUCKET as unknown as FakeR2Bucket;
    const storedCover = await bucket.get("covers/scr_test_fixed.jpg");
    expect(storedCover).not.toBeNull();
    expect(storedCover?.httpMetadata?.contentType).toBe("image/jpeg");
    const storedThumb = await bucket.get("thumbs/scr_test_fixed.jpg");
    expect(storedThumb).not.toBeNull();
    expect(storedThumb?.httpMetadata?.contentType).toBe("image/jpeg");
  });

  test("画像なしで201・cover_key/thumb_keyがnull", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({});
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(201);

    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].cover_key).toBeNull();
    expect(db.rows[0].thumb_key).toBeNull();
  });

  test("承認モード(moderation_mode=approval)で201・status=pending・published_at=null", async () => {
    const env = makeEnv({ moderation_mode: "approval" });
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({});
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("pending");

    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows[0].status).toBe("pending");
    expect(db.rows[0].published_at).toBeNull();
  });
});

describe("POST /api/recipes ガード失敗系", () => {
  test("Turnstile失敗で403・rows/R2不変", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(
      makeStubDeps({ verifyTurnstile: async () => false }),
    );
    const formData = buildFormData({});
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(403);
    const db = env.DB as unknown as FakeD1Database;
    expect(db.rows).toHaveLength(0);
  });

  test("circuit_breaker=openで503", async () => {
    const env = makeEnv({ circuit_breaker: "open" });
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({});
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(503);
  });

  test("rate limit: daily_post_limit=2で3回目が429（同一IP）", async () => {
    const env = makeEnv({ daily_post_limit: "2" });
    const testApp = buildTestApp(makeStubDeps());
    const headers = { "CF-Connecting-IP": "9.9.9.9" };

    const res1 = await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({}), headers },
      env,
    );
    expect(res1.status).toBe(201);

    const res2 = await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({}), headers },
      env,
    );
    expect(res2.status).toBe(201);

    const res3 = await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({}), headers },
      env,
    );
    expect(res3.status).toBe(429);
  });

  test("strict zod失敗: title にURLを含む場合400", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({
      recipe: { ...VALID_RECIPE, title: "http://x" },
    });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("strict zod失敗: title 空で400", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({
      recipe: { ...VALID_RECIPE, title: "" },
    });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("envelope不正: handle 41文字で400", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({ handle: "a".repeat(41) });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("envelope不正: lang='fr'で400", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({ lang: "fr" });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("envelope不正: deletePassword 7文字で400", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({ deletePassword: "short12" });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("payload非JSONで400", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({ rawPayload: "not-json{{{" });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("cover寸法超過(長辺1601px)で400", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const oversizedCover = buildVP8Lossy(1601, 100);
    const formData = buildFormData({ coverBytes: oversizedCover });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("JPEG cover寸法超過(長辺1601px)で400", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const oversizedCover = buildJpeg(1601, 100);
    const formData = buildFormData({
      coverBytes: oversizedCover,
      coverFileName: "cover.jpg",
      coverMimeType: "image/jpeg",
    });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(400);
  });

  test("cover不正バイト列（JPEGでもWebPでもない）で400 invalid cover image", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    const formData = buildFormData({ coverBytes: garbage });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid cover image");
  });

  test("thumb不正バイト列（JPEGでもWebPでもない）で400 invalid thumb image", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    const formData = buildFormData({
      coverBytes: VALID_COVER_BYTES,
      thumbBytes: garbage,
    });
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid thumb image");
  });

  test("ガード順: circuit openかつTurnstile失敗が同時のとき403が先", async () => {
    const env = makeEnv({ circuit_breaker: "open" });
    const testApp = buildTestApp(
      makeStubDeps({ verifyTurnstile: async () => false }),
    );
    const formData = buildFormData({});
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/recipes サーキットブレーカー自動遷移（ST-28）", () => {
  test("global超過でレスポンス不変(429)＋circuit_breaker='open'化＋notify1回", async () => {
    const env = makeEnv({
      hourly_global_limit: "1",
      circuit_breaker: "closed",
    });
    const notify = vi.fn<(event: ModerationEvent) => Promise<void>>(
      async () => {},
    );
    const testApp = buildTestApp(makeStubDeps({ notify }));

    const res1 = await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({ handle: "a" }), headers: {} },
      env,
    );
    expect(res1.status).toBe(201);

    const res2 = await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({ handle: "b" }), headers: {} },
      env,
    );
    expect(res2.status).toBe(429);
    const body = (await res2.json()) as { error: string };
    expect(body.error).toBe("rate limit exceeded");

    const db = env.DB as unknown as FakeD1Database;
    expect(db.settings.get("circuit_breaker")).toBe("open");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toEqual({
      type: "circuitOpen",
      count: 2,
      period: "2026-07-08T09",
    });
  });

  test("既にcircuit_breaker='open'のときは503（circuitガード）で再通知なし", async () => {
    const env = makeEnv({
      hourly_global_limit: "1",
      circuit_breaker: "open",
    });
    const notify = vi.fn<(event: ModerationEvent) => Promise<void>>(
      async () => {},
    );
    const testApp = buildTestApp(makeStubDeps({ notify }));

    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({}) },
      env,
    );
    expect(res.status).toBe(503);
    expect(notify).not.toHaveBeenCalled();
  });

  test("per-IP日次超過(daily_post_limit)のみのときsettings不変・notify呼ばれず", async () => {
    const env = makeEnv({
      daily_post_limit: "1",
      circuit_breaker: "closed",
    });
    const notify = vi.fn<(event: ModerationEvent) => Promise<void>>(
      async () => {},
    );
    const testApp = buildTestApp(makeStubDeps({ notify }));
    const headers = { "CF-Connecting-IP": "1.1.1.1" };

    const res1 = await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({}), headers },
      env,
    );
    expect(res1.status).toBe(201);

    const res2 = await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({}), headers },
      env,
    );
    expect(res2.status).toBe(429);

    const db = env.DB as unknown as FakeD1Database;
    expect(db.settings.get("circuit_breaker")).toBe("closed");
    expect(notify).not.toHaveBeenCalled();
  });

  test("notifyがthrowしてもレスポンスは不変(429)", async () => {
    const env = makeEnv({
      hourly_global_limit: "1",
      circuit_breaker: "closed",
    });
    const notify = vi.fn<(event: ModerationEvent) => Promise<void>>(
      async () => {
        throw new Error("smtp down");
      },
    );
    const testApp = buildTestApp(makeStubDeps({ notify }));

    await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({ handle: "a" }) },
      env,
    );
    const res2 = await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({ handle: "b" }) },
      env,
    );
    expect(res2.status).toBe(429);

    const db = env.DB as unknown as FakeD1Database;
    expect(db.settings.get("circuit_breaker")).toBe("open");
  });

  test("notify未注入でも従来どおり429（例外なし）", async () => {
    const env = makeEnv({
      hourly_global_limit: "1",
      circuit_breaker: "closed",
    });
    const testApp = buildTestApp(makeStubDeps());

    await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({ handle: "a" }) },
      env,
    );
    const res2 = await testApp.request(
      "/api/recipes",
      { method: "POST", body: buildFormData({ handle: "b" }) },
      env,
    );
    expect(res2.status).toBe(429);

    const db = env.DB as unknown as FakeD1Database;
    expect(db.settings.get("circuit_breaker")).toBe("open");
  });
});

describe("POST /api/recipes CORS", () => {
  test("正常系レスポンスにACAOヘッダ", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(makeStubDeps());
    const formData = buildFormData({});
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://coat-codex.com",
    );
  });

  test("失敗系レスポンス(403)にもACAOヘッダ", async () => {
    const env = makeEnv();
    const testApp = buildTestApp(
      makeStubDeps({ verifyTurnstile: async () => false }),
    );
    const formData = buildFormData({});
    const res = await testApp.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://coat-codex.com",
    );
  });
});

describe("app.ts 結線確認", () => {
  test("本番appにPOST /api/recipesが結線され、空secretでTurnstileが403（fetch非依存）", async () => {
    const env = makeEnv();
    (env as unknown as { TURNSTILE_SECRET: string }).TURNSTILE_SECRET = "";
    const formData = buildFormData({});
    const res = await app.request(
      "/api/recipes",
      { method: "POST", body: formData },
      env,
    );
    expect(res.status).toBe(403);
  });
});
