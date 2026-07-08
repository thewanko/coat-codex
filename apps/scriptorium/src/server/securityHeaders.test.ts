// @vitest-environment node
// src/server/securityHeaders.test.ts — セキュリティ応答ヘッダー注入の unit test（技術計画v1 §7 ST-36）

import { describe, expect, test } from "vitest";
import { DOCUMENT_CSP, withSecurityHeaders } from "./securityHeaders";

describe("withSecurityHeaders", () => {
  test("text/html 応答には CSP 一式が set され、status/body は不変", async () => {
    const original = new Response("<html></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });

    const wrapped = withSecurityHeaders(original);

    expect(wrapped.status).toBe(200);
    expect(await wrapped.text()).toBe("<html></html>");
    expect(wrapped.headers.get("Content-Security-Policy")).toBe(DOCUMENT_CSP);
    expect(wrapped.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(wrapped.headers.get("X-Frame-Options")).toBe("DENY");
    expect(wrapped.headers.get("Permissions-Policy")).toBe(
      "geolocation=(), camera=(), microphone=()",
    );
    expect(wrapped.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("text/html; charset=utf-8 応答にも同様に付与される（部分一致判定）", async () => {
    const original = new Response("<html></html>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

    const wrapped = withSecurityHeaders(original);

    expect(wrapped.headers.get("Content-Security-Policy")).toBe(DOCUMENT_CSP);
    expect(wrapped.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("非HTML応答（text/css）には nosniff のみ付き、CSP等は付かない", () => {
    const original = new Response("body { color: red; }", {
      status: 200,
      headers: { "Content-Type": "text/css" },
    });

    const wrapped = withSecurityHeaders(original);

    expect(wrapped.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(wrapped.headers.get("Content-Security-Policy")).toBeNull();
    expect(wrapped.headers.get("Referrer-Policy")).toBeNull();
    expect(wrapped.headers.get("X-Frame-Options")).toBeNull();
    expect(wrapped.headers.get("Permissions-Policy")).toBeNull();
  });

  test("Content-Type ヘッダーなし応答には nosniff のみ付く", () => {
    const original = new Response("plain", { status: 200 });

    const wrapped = withSecurityHeaders(original);

    expect(wrapped.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(wrapped.headers.get("Content-Security-Policy")).toBeNull();
  });

  test("Content-Type が大文字混在（TEXT/HTML）でも CSP が付与される（.toLowerCase 分岐固定）", async () => {
    const original = new Response("<html></html>", {
      status: 200,
      headers: { "Content-Type": "TEXT/HTML" },
    });

    const wrapped = withSecurityHeaders(original);

    expect(wrapped.headers.get("Content-Security-Policy")).toBe(DOCUMENT_CSP);
    expect(wrapped.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("body null（304 想定）応答でも例外にならず nosniff が付与され、status/CSP なしが保存される", () => {
    const original = new Response(null, { status: 304 });

    const wrapped = withSecurityHeaders(original);

    expect(wrapped.status).toBe(304);
    expect(wrapped.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(wrapped.headers.get("Content-Security-Policy")).toBeNull();
  });

  test("元の Response のヘッダーは変更されない（非破壊・新インスタンス返却）", () => {
    const original = new Response("<html></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });

    const wrapped = withSecurityHeaders(original);

    expect(wrapped).not.toBe(original);
    expect(original.headers.get("Content-Security-Policy")).toBeNull();
    expect(original.headers.get("X-Content-Type-Options")).toBeNull();
  });
});
