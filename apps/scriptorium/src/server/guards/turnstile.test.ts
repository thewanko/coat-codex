// @vitest-environment node
// src/server/guards/turnstile.test.ts — Turnstile siteverify 検証ガードの unit test（技術計画v1 §4.4）

import { describe, expect, test, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function parseBody(body: unknown): URLSearchParams {
  expect(body).toBeInstanceOf(URLSearchParams);
  return body as URLSearchParams;
}

describe("verifyTurnstile", () => {
  test("成功: successレスポンスでtrue・正しいURL/bodyでfetchを呼ぶ", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

    const result = await verifyTurnstile("token-abc", "secret-xyz", "1.2.3.4", {
      fetch: fetchSpy,
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    const params = parseBody(init.body);
    expect(params.get("secret")).toBe("secret-xyz");
    expect(params.get("response")).toBe("token-abc");
    expect(params.get("remoteip")).toBe("1.2.3.4");
  });

  test("失敗: success:falseのレスポンスでfalse", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 200 }),
      );

    const result = await verifyTurnstile("token-abc", "secret-xyz", "1.2.3.4", {
      fetch: fetchSpy,
    });

    expect(result).toBe(false);
  });

  test("空tokenはfetchを呼ばずにfalse", async () => {
    const fetchSpy = vi.fn();

    const result = await verifyTurnstile("", "secret-xyz", "1.2.3.4", {
      fetch: fetchSpy,
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("空secretはfetchを呼ばずにfalse", async () => {
    const fetchSpy = vi.fn();

    const result = await verifyTurnstile("token-abc", "", "1.2.3.4", {
      fetch: fetchSpy,
    });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("fetchがthrowするとfalse", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network error"));

    const result = await verifyTurnstile("token-abc", "secret-xyz", "1.2.3.4", {
      fetch: fetchSpy,
    });

    expect(result).toBe(false);
  });

  test("HTTP 500はfalse", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 500 }),
      );

    const result = await verifyTurnstile("token-abc", "secret-xyz", "1.2.3.4", {
      fetch: fetchSpy,
    });

    expect(result).toBe(false);
  });

  test("不正JSONはfalse", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response("not json", { status: 200 }));

    const result = await verifyTurnstile("token-abc", "secret-xyz", "1.2.3.4", {
      fetch: fetchSpy,
    });

    expect(result).toBe(false);
  });

  test("remoteIp=nullのときbodyにremoteipを含めない", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

    const result = await verifyTurnstile("token-abc", "secret-xyz", null, {
      fetch: fetchSpy,
    });

    expect(result).toBe(true);
    const [, init] = fetchSpy.mock.calls[0];
    const params = parseBody(init.body);
    expect(params.has("remoteip")).toBe(false);
  });
});
