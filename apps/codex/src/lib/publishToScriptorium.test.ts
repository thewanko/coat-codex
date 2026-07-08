// lib/publishToScriptorium.test.ts — Scriptorium投稿処理のテスト（技術計画v1.3 §6-1/§4.2/§2.4）
//
// fake-indexeddbでdb.metaの実書き込み経路（defaultRecordMeta）を検証する（M2-data流）。

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CURRENT_SCHEMA_VERSION } from "@coat-codex/recipe-core";
import type { RecipeDoc } from "@coat-codex/recipe-core";
import { db } from "../db/db";
import {
  publishToScriptorium,
  PublishError,
  type PublishInput,
  type ScriptoriumPostRecord,
} from "./publishToScriptorium";

/** strict検証を通る最小の有効RecipeDoc（palette/tools/baseSteps/partsを持つ） */
function makeValidRecipeDoc(): RecipeDoc {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "rcp_publish_1",
    title: "Space Marine Captain",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [
      {
        id: "col_1",
        source: "preset",
        brand: "Citadel",
        name: "Mephiston Red",
        presetId: "citadel:mephiston-red",
        hex: "#960F0F",
        chipPhotoId: null,
      },
    ],
    tools: [{ id: "tool_1", name: "エアブラシ", note: null }],
    baseSteps: [
      {
        id: "stp_base_1",
        technique: { presetKey: "prime", label: null },
        photoId: null,
        paints: [],
        mix: null,
        toolIds: ["tool_1"],
        memo: "",
      },
    ],
    parts: [
      {
        id: "part_1",
        name: "兜",
        steps: [
          {
            id: "stp_1",
            technique: { presetKey: "basecoat", label: null },
            photoId: null,
            paints: [{ colorId: "col_1" }],
            mix: null,
            toolIds: ["tool_1"],
            memo: "",
          },
        ],
      },
    ],
    photoCrops: {},
    source: null,
  };
}

const BASE_INPUT: Omit<PublishInput, "doc"> = {
  handle: "painter_taro",
  lang: "ja",
  deletePassword: "correct-horse-battery-staple",
  turnstileToken: "tok_abc123",
};

async function readFormDataPayload(
  fd: FormData,
): Promise<Record<string, unknown>> {
  const raw = fd.get("payload");
  expect(typeof raw).toBe("string");
  return JSON.parse(raw as string) as Record<string, unknown>;
}

function makeSuccessResponse(body: {
  id: string;
  url: string;
  status: string;
}) {
  return new Response(JSON.stringify(body), { status: 201 });
}

describe("publishToScriptorium — 正常系", () => {
  test("payload/cover/thumbが送信され、成功後にrecordMetaがdeletePasswordなしで呼ばれる（cover/thumbはJPEG＝coverComposerの実出力形式）", async () => {
    let capturedFd: FormData | null = null;
    let capturedInit: RequestInit | undefined;
    const fetchStub = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedFd = init?.body as FormData;
      capturedInit = init;
      return makeSuccessResponse({
        id: "scr_x",
        url: "https://scriptorium.example/r/scr_x",
        status: "published",
      });
    });
    const recordMeta =
      vi.fn<
        (recipeId: string, record: ScriptoriumPostRecord) => Promise<void>
      >();

    const doc = makeValidRecipeDoc();
    const cover = new Blob(["cover-bytes"], { type: "image/jpeg" });
    const thumb = new Blob(["thumb-bytes"], { type: "image/jpeg" });

    const result = await publishToScriptorium(
      { doc, ...BASE_INPUT, cover, thumb },
      {
        fetch: fetchStub as unknown as typeof fetch,
        now: () => new Date("2026-07-08T00:00:00.000Z"),
        recordMeta,
      },
    );

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(capturedFd).toBeInstanceOf(FormData);
    const fd = capturedFd as unknown as FormData;

    const payload = await readFormDataPayload(fd);
    expect(payload.handle).toBe("painter_taro");
    expect(payload.lang).toBe("ja");
    expect(payload.deletePassword).toBe("correct-horse-battery-staple");
    expect(payload.turnstileToken).toBe("tok_abc123");
    expect(
      (payload.recipe as { scriptoriumSchemaVersion: number })
        .scriptoriumSchemaVersion,
    ).toBe(1);

    const coverFile = fd.get("cover");
    const thumbFile = fd.get("thumb");
    expect(coverFile).toBeInstanceOf(File);
    expect(thumbFile).toBeInstanceOf(File);
    expect((coverFile as File).name).toBe("cover.jpg");
    expect((coverFile as File).type).toBe("image/jpeg");
    expect((thumbFile as File).name).toBe("thumb.jpg");
    expect((thumbFile as File).type).toBe("image/jpeg");

    // Content-Typeを手動指定していない（FormDataのまま。境界はブラウザ/実装に任せる）
    expect(capturedInit?.headers).toBeUndefined();

    expect(result).toEqual({
      id: "scr_x",
      url: "https://scriptorium.example/r/scr_x",
      status: "published",
    });

    expect(recordMeta).toHaveBeenCalledTimes(1);
    const [recipeId, record] = recordMeta.mock.calls[0];
    expect(recipeId).toBe("rcp_publish_1");
    expect(record).toEqual({
      scriptoriumId: "scr_x",
      url: "https://scriptorium.example/r/scr_x",
      postedAt: "2026-07-08T00:00:00.000Z",
    });
    expect("deletePassword" in record).toBe(false);
  });

  test("cover/thumbがimage/webp（後方互換）の場合は.webp/image/webpのまま送信する", async () => {
    let capturedFd: FormData | null = null;
    const fetchStub = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedFd = init?.body as FormData;
      return makeSuccessResponse({
        id: "scr_webp",
        url: "https://scriptorium.example/r/scr_webp",
        status: "published",
      });
    });
    const recordMeta = vi.fn(async () => {});

    const doc = makeValidRecipeDoc();
    const cover = new Blob(["cover-bytes"], { type: "image/webp" });
    const thumb = new Blob(["thumb-bytes"], { type: "image/webp" });

    await publishToScriptorium(
      { doc, ...BASE_INPUT, cover, thumb },
      { fetch: fetchStub as unknown as typeof fetch, recordMeta },
    );

    const fd = capturedFd as unknown as FormData;
    const coverFile = fd.get("cover") as File;
    const thumbFile = fd.get("thumb") as File;
    expect(coverFile.name).toBe("cover.webp");
    expect(coverFile.type).toBe("image/webp");
    expect(thumbFile.name).toBe("thumb.webp");
    expect(thumbFile.type).toBe("image/webp");
  });

  test("cover/thumbのtypeが空/不明な場合はjpeg既定にフォールバックする", async () => {
    let capturedFd: FormData | null = null;
    const fetchStub = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedFd = init?.body as FormData;
      return makeSuccessResponse({
        id: "scr_unknown",
        url: "https://scriptorium.example/r/scr_unknown",
        status: "published",
      });
    });
    const recordMeta = vi.fn(async () => {});

    const doc = makeValidRecipeDoc();
    const cover = new Blob(["cover-bytes"]); // typeを指定しない
    const thumb = new Blob(["thumb-bytes"]);

    await publishToScriptorium(
      { doc, ...BASE_INPUT, cover, thumb },
      { fetch: fetchStub as unknown as typeof fetch, recordMeta },
    );

    const fd = capturedFd as unknown as FormData;
    const coverFile = fd.get("cover") as File;
    const thumbFile = fd.get("thumb") as File;
    expect(coverFile.name).toBe("cover.jpg");
    expect(coverFile.type).toBe("image/jpeg");
    expect(thumbFile.name).toBe("thumb.jpg");
    expect(thumbFile.type).toBe("image/jpeg");
  });

  test("cover/thumbなし: FormDataにcover/thumbパートを含めない", async () => {
    let capturedFd: FormData | null = null;
    const fetchStub = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedFd = init?.body as FormData;
      return makeSuccessResponse({
        id: "scr_y",
        url: "https://scriptorium.example/r/scr_y",
        status: "published",
      });
    });
    const recordMeta = vi.fn(async () => {});

    await publishToScriptorium(
      { doc: makeValidRecipeDoc(), ...BASE_INPUT },
      { fetch: fetchStub as unknown as typeof fetch, recordMeta },
    );

    const fd = capturedFd as unknown as FormData;
    expect(fd.get("cover")).toBeNull();
    expect(fd.get("thumb")).toBeNull();
  });
});

describe("publishToScriptorium — strict検証失敗", () => {
  test("titleにURLを含むdocはPublishError(validation)をthrowし、fetchを呼ばない", async () => {
    const fetchStub = vi.fn();
    const doc = makeValidRecipeDoc();
    doc.title = "見てね http://example.com";

    await expect(
      publishToScriptorium(
        { doc, ...BASE_INPUT },
        { fetch: fetchStub as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ code: "validation" });

    expect(fetchStub).not.toHaveBeenCalled();
  });

  test("PublishErrorのインスタンスである", async () => {
    const doc = makeValidRecipeDoc();
    doc.title = "見てね http://example.com";

    await expect(
      publishToScriptorium(
        { doc, ...BASE_INPUT },
        { fetch: vi.fn() as unknown as typeof fetch },
      ),
    ).rejects.toBeInstanceOf(PublishError);
  });
});

describe("publishToScriptorium — エラー写像", () => {
  const cases: { status: number; code: string }[] = [
    { status: 403, code: "turnstile" },
    { status: 429, code: "rateLimit" },
    { status: 503, code: "circuit" },
    { status: 413, code: "tooLarge" },
    { status: 400, code: "validation" },
  ];

  for (const { status, code } of cases) {
    test(`status ${status} → code ${code}`, async () => {
      const fetchStub = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "failed" }), { status }),
      );

      await expect(
        publishToScriptorium(
          { doc: makeValidRecipeDoc(), ...BASE_INPUT },
          { fetch: fetchStub as unknown as typeof fetch },
        ),
      ).rejects.toMatchObject({ code, status });
    });
  }

  test("未知のstatusはunknownへ写像される", async () => {
    const fetchStub = vi.fn(async () => new Response(null, { status: 500 }));

    await expect(
      publishToScriptorium(
        { doc: makeValidRecipeDoc(), ...BASE_INPUT },
        { fetch: fetchStub as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ code: "unknown", status: 500 });
  });

  test("fetchがthrowするとcode=networkのPublishErrorになる", async () => {
    const fetchStub = vi.fn(async () => {
      throw new Error("offline");
    });

    await expect(
      publishToScriptorium(
        { doc: makeValidRecipeDoc(), ...BASE_INPUT },
        { fetch: fetchStub as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ code: "network" });
  });
});

describe("publishToScriptorium — defaultRecordMeta（実DB書き込み）", () => {
  beforeEach(async () => {
    await db.meta.clear();
  });

  afterEach(async () => {
    await db.meta.clear();
  });

  test("recordMeta省略時は実dbへscriptoriumPost:<recipeId>を記録し、deletePasswordを含まない", async () => {
    const doc = makeValidRecipeDoc();
    const fetchStub = vi.fn(async () =>
      makeSuccessResponse({
        id: "scr_real",
        url: "https://scriptorium.example/r/scr_real",
        status: "published",
      }),
    );

    await publishToScriptorium(
      { doc, ...BASE_INPUT },
      {
        fetch: fetchStub as unknown as typeof fetch,
        now: () => new Date("2026-07-08T01:00:00.000Z"),
      },
    );

    const stored = await db.meta.get(`scriptoriumPost:${doc.id}`);
    expect(stored).toBeDefined();
    const value = JSON.parse(stored?.value as string) as Record<
      string,
      unknown
    >;
    expect(value).toEqual({
      scriptoriumId: "scr_real",
      url: "https://scriptorium.example/r/scr_real",
      postedAt: "2026-07-08T01:00:00.000Z",
    });
    expect("deletePassword" in value).toBe(false);
  });
});
