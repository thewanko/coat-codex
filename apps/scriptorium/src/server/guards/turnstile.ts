// src/server/guards/turnstile.ts — Cloudflare Turnstile siteverify 検証ガード（技術計画v1 §4.4「Turnstileガードのテスト可能性」）
//
// siteverify への fetch を注入可能にし、unit test は成功/失敗レスポンスのスタブで書ける（実サイトキー/シークレット不要）。

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileDeps {
  fetch: typeof fetch; // 注入可能（本番=global fetch、test=スタブ）
}

interface SiteverifyResponse {
  success?: boolean;
}

/**
 * Cloudflare Turnstile siteverify で token を検証する。
 *
 * fail-closed 設計: token/secret 空・fetch throw・HTTP 非 ok・JSON パース失敗など
 * あらゆる異常時は false を返す。投稿の濫用防止ガードは、検証不能な場合に
 * 通してしまうと悪用リスクが残るため、疑わしきは拒否する方が安全側に倒れる。
 */
export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string | null,
  deps: TurnstileDeps,
): Promise<boolean> {
  if (!token || !secret) {
    return false;
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp !== null) {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await deps.fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      return false;
    }
    const data = (await response.json()) as SiteverifyResponse;
    return data.success === true;
  } catch {
    return false;
  }
}
