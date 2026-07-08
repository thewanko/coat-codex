// src/server/moderation/notifier.ts — Resend REST API 経由のモデレーション通知（技術計画v1 §4.2/§8-4・S6 ST-27）
//
// プロバイダは Resend に確定（2026-07-08 ユーザー裁定・§8-4 候補どおり）。
// report.ts からは best-effort（try/catch）で呼ばれる想定のため、本モジュールは
// 単純に「失敗したら throw する」だけの責務に留める（リトライ・キューイングはしない）。
// API キーはログ・エラーメッセージに一切含めない。

import type { ModerationEvent } from "./events";

const DEFAULT_ENDPOINT = "https://api.resend.com/emails";
const ERROR_BODY_PREVIEW_LENGTH = 200;

export interface NotifierDeps {
  fetch: typeof fetch;
  apiKey: string;
  from: string;
  to: string;
  endpoint?: string;
}

interface EmailContent {
  subject: string;
  text: string;
}

/**
 * Resend REST API（`POST /emails`）でメール通知を送る関数を生成する。
 * 返り値は `ReportDeps.notify` にそのまま注入できる形。
 */
export function createNotifier(
  deps: NotifierDeps,
): (event: ModerationEvent) => Promise<void> {
  const endpoint = deps.endpoint ?? DEFAULT_ENDPOINT;

  return async (event: ModerationEvent) => {
    const { subject, text } = formatEvent(event);

    const response = await deps.fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + deps.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: deps.from,
        to: deps.to,
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      const preview = bodyText.slice(0, ERROR_BODY_PREVIEW_LENGTH);
      throw new Error(
        "moderation notify failed: status=" +
          response.status +
          (preview ? " body=" + preview : ""),
      );
    }
  };
}

function formatEvent(event: ModerationEvent): EmailContent {
  switch (event.type) {
    case "flagged":
      return {
        subject: "[coat-scriptorium] レシピが通報により非公開化されました",
        text:
          "recipeId: " +
          event.recipeId +
          "\n" +
          "reportCount: " +
          event.reportCount +
          "\n\n" +
          "現状の確認手段: wrangler d1でstatus確認（admin画面はS7で実装予定）。" +
          "承認制へ切り替える場合はsettings.moderation_mode='approval'を設定してください。",
      };
    case "circuitOpen":
      return {
        subject: "[coat-scriptorium] 投稿サーキットブレーカーが開放されました",
        text:
          "period: " +
          event.period +
          "\n" +
          "count: " +
          event.count +
          "\n\n" +
          "復旧手順: settings.circuit_breaker='closed'へ更新してください。",
      };
    default:
      return event satisfies never;
  }
}
