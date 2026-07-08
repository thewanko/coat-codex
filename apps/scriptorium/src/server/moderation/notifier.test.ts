// src/server/moderation/notifier.test.ts — Resend REST API 経由のモデレーション通知テスト（技術計画v1 §4.2/§8-4・S6 ST-27）

import { describe, expect, test, vi } from "vitest";
import { createNotifier } from "./notifier";
import type { ModerationEvent } from "./events";

function makeFetchStub(
  response: Response,
): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

const BASE_DEPS = {
  apiKey: "re_secret_key_12345",
  from: "notify@example.com",
  to: "admin@example.com",
};

describe("createNotifier", () => {
  test("flagged: URL/メソッド/ヘッダー/bodyが仕様どおり・subjectとtextに内容が含まれる", async () => {
    const fetchStub = makeFetchStub(new Response("{}", { status: 200 }));
    const notify = createNotifier({ ...BASE_DEPS, fetch: fetchStub });

    const event: ModerationEvent = {
      type: "flagged",
      recipeId: "scr_abc123",
      reportCount: 3,
    };
    await notify(event);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_secret_key_12345");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init?.body as string) as {
      from: string;
      to: string;
      subject: string;
      text: string;
    };
    expect(body.from).toBe("notify@example.com");
    expect(body.to).toBe("admin@example.com");
    expect(body.subject).toContain("通報");
    expect(body.text).toContain("scr_abc123");
    expect(body.text).toContain("3");
  });

  test("circuitOpen: subjectにイベント種別・textにperiod/countが含まれる", async () => {
    const fetchStub = makeFetchStub(new Response("{}", { status: 200 }));
    const notify = createNotifier({ ...BASE_DEPS, fetch: fetchStub });

    const event: ModerationEvent = {
      type: "circuitOpen",
      count: 42,
      period: "2026-07-08",
    };
    await notify(event);

    const [, init] = fetchStub.mock.calls[0];
    const body = JSON.parse(init?.body as string) as {
      subject: string;
      text: string;
    };
    expect(body.subject).toContain("サーキットブレーカー");
    expect(body.text).toContain("2026-07-08");
    expect(body.text).toContain("42");
  });

  test("endpoint省略時はResendの既定URLを使う", async () => {
    const fetchStub = makeFetchStub(new Response("{}", { status: 200 }));
    const notify = createNotifier({ ...BASE_DEPS, fetch: fetchStub });
    await notify({ type: "flagged", recipeId: "x", reportCount: 1 });
    const [url] = fetchStub.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
  });

  test("endpoint指定時はそのURLを使う", async () => {
    const fetchStub = makeFetchStub(new Response("{}", { status: 200 }));
    const notify = createNotifier({
      ...BASE_DEPS,
      fetch: fetchStub,
      endpoint: "https://example.test/custom",
    });
    await notify({ type: "flagged", recipeId: "x", reportCount: 1 });
    const [url] = fetchStub.mock.calls[0];
    expect(url).toBe("https://example.test/custom");
  });

  test("400応答→throw・メッセージにstatus含む・apiKey非含有", async () => {
    const fetchStub = makeFetchStub(
      new Response("bad request: invalid from address", { status: 400 }),
    );
    const notify = createNotifier({ ...BASE_DEPS, fetch: fetchStub });

    await expect(
      notify({ type: "flagged", recipeId: "x", reportCount: 1 }),
    ).rejects.toThrow(/400/);

    try {
      await notify({ type: "flagged", recipeId: "x", reportCount: 1 });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("400");
      expect(message).not.toContain(BASE_DEPS.apiKey);
    }
  });

  test("500応答→throw・メッセージにstatus含む・apiKey非含有", async () => {
    const fetchStub = makeFetchStub(
      new Response("internal server error", { status: 500 }),
    );
    const notify = createNotifier({ ...BASE_DEPS, fetch: fetchStub });

    try {
      await notify({ type: "circuitOpen", count: 1, period: "p" });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("500");
      expect(message).not.toContain(BASE_DEPS.apiKey);
    }
  });

  test("fetch reject時はそのまま伝播する", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network down"));
    const notify = createNotifier({ ...BASE_DEPS, fetch: fetchStub });

    await expect(
      notify({ type: "flagged", recipeId: "x", reportCount: 1 }),
    ).rejects.toThrow("network down");
  });

  test("マクロタスク遅延を挟んだ非同期fetchでも正しく解決する", async () => {
    const fetchStub = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(new Response("{}", { status: 200 }));
          }, 0);
        }),
    );
    const notify = createNotifier({ ...BASE_DEPS, fetch: fetchStub });

    await expect(
      notify({ type: "flagged", recipeId: "x", reportCount: 1 }),
    ).resolves.toBeUndefined();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
