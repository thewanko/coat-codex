// components/common/TurnstileWidget.tsx — Cloudflare Turnstile ウィジェット
// （PublishDialog から利用。仕様の正: docs/coat-scriptorium_技術計画_v1.md §6-1
// 「Turnstile ウィジェット（サイトキー VITE_TURNSTILE_SITEKEY）」。explicit render 方式）
// スクリプト読込・型宣言は turnstileScript.ts へ分離
// （react-refresh/only-export-components対応: .tsxはコンポーネントのみexportする）

import { useEffect, useRef } from "react";
import { loadTurnstileScript } from "./turnstileScript";

export interface TurnstileWidgetProps {
  siteKey: string;
  /** 検証成功でtoken文字列、期限切れ/エラー/未検証でnullを通知 */
  onToken: (token: string | null) => void;
  className?: string;
}

export default function TurnstileWidget({
  siteKey,
  onToken,
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // onTokenの参照が変わるたびにwidgetを再生成しないよう、最新値をrefに保持する
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let mounted = true;
    let widgetId: string | null = null;

    void loadTurnstileScript().then(() => {
      if (!mounted || !containerRef.current || !window.turnstile) {
        return;
      }
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onTokenRef.current(token),
        "error-callback": () => onTokenRef.current(null),
        "expired-callback": () => onTokenRef.current(null),
        "timeout-callback": () => onTokenRef.current(null),
      });
    });

    return () => {
      mounted = false;
      if (widgetId) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [siteKey]);

  return <div ref={containerRef} className={className} />;
}
