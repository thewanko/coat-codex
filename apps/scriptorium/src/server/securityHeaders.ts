// src/server/securityHeaders.ts — 応答へのセキュリティヘッダー注入（技術計画v1 §7 ST-36 / §8-12）
//
// scriptorium は Pages advanced mode（`dist/_worker.js`）のため `_headers` ファイルが
// 無視される。そのため worker.ts が返す応答をここでラップしてヘッダーを注入する。
// インライン<script>はゼロのため script-src に 'unsafe-inline' は付けない
// （style-src のみ Google Fonts CSS・注入スタイルのため 'unsafe-inline' が必要）。

export const DOCUMENT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
].join("; ");

export function withSecurityHeaders(response: Response): Response {
  // 上流（特に env.ASSETS.fetch）の Response はヘッダーが immutable のことがあるため、
  // 必ず複製してから headers.set する。
  const wrapped = new Response(response.body, response);

  wrapped.headers.set("X-Content-Type-Options", "nosniff");

  const contentType = wrapped.headers.get("Content-Type") ?? "";
  if (contentType.toLowerCase().includes("text/html")) {
    wrapped.headers.set("Content-Security-Policy", DOCUMENT_CSP);
    wrapped.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    wrapped.headers.set("X-Frame-Options", "DENY");
    wrapped.headers.set(
      "Permissions-Policy",
      "geolocation=(), camera=(), microphone=()",
    );
  }

  return wrapped;
}
