// components/home/StorageStatusBar.tsx — 永続化状態・使用量・最終エクスポート表示
// （技術計画v2.2 §3.5「StorageStatusBar」・デザイン仕様書§4「StorageStatusBar」・T34）
//
// 表示ロジック:
// - 保護状態バッジ: persisted=true→「データ保護: 有効」／false→「保護なし…」／
//   API非対応→バッジ非表示＋Safari警告文のみ（§3.5）。
// - Safari 7日消去の警告文言: persisted=falseのとき常に表示（非対応環境も含む）。
// - 使用量: estimate()が返せた場合のみ「使用中: x MB / 目安: y GB」（非対応環境は非表示）。
// - 最終エクスポート: 全レシピのrecipeExport:*の最大値（§3.5。1件もなければ「未実施」）。
//
// 判定ロジック自体（persisted/estimate取得・鮮度計算）はlib/storageHealth.ts（T15）を
// そのまま呼ぶだけで、ここでは再実装しない。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  checkPersisted,
  estimateUsage,
  readAllRecipeExports,
} from "../../lib/storageHealth";
import styles from "./StorageStatusBar.module.css";

/** バイト数を "12.3 MB" 等の概算表示へ変換する（見た目のみ。値は概算である旨をラベル側で注記） */
function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 MB";
  }
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(1)} GB`;
  }
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** 全レシピのrecipeExport:*の最大値（ISO文字列）を求める。1件もなければundefined（§3.5） */
function latestExportedAt(exports: Record<string, string>): string | undefined {
  const values = Object.values(exports);
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((latest, current) =>
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest,
  );
}

interface StorageStatusBarProps {
  /** レシピ件数（デザイン仕様「6 VOLUMES」表示用。任意 — 渡されない画面では省略） */
  volumeCount?: number;
}

function StorageStatusBar({ volumeCount }: StorageStatusBarProps) {
  const { t, i18n } = useTranslation();
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined);
  const [usage, setUsage] = useState<
    { usage: number; quota: number } | undefined
  >(undefined);
  const [lastExportedAt, setLastExportedAt] = useState<string | undefined>(
    undefined,
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [persistedResult, usageResult, exports] = await Promise.all([
        checkPersisted(),
        estimateUsage(),
        readAllRecipeExports(),
      ]);
      if (cancelled) {
        return;
      }
      setPersisted(persistedResult);
      setUsage(usageResult);
      setLastExportedAt(latestExportedAt(exports));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return null;
  }

  const showWarning = persisted !== true;
  const lastExportLabel =
    lastExportedAt !== undefined
      ? t("storageStatus.lastExport", {
          date: new Date(lastExportedAt).toLocaleDateString(i18n.language),
        })
      : t("storageStatus.lastExportNever");

  return (
    <div
      className={styles.root}
      data-variant={showWarning ? "warning" : "healthy"}
      data-testid="storage-status-bar"
    >
      <div className={styles.row}>
        {persisted !== undefined && (
          <span
            className={styles.dot}
            data-protected={persisted}
            aria-hidden="true"
          />
        )}
        {persisted !== undefined && (
          <span className={styles.label}>
            {persisted
              ? t("storageStatus.protectedLabel")
              : t("storageStatus.unprotectedLabel")}
          </span>
        )}
        <span className={styles.meta}>
          {usage !== undefined && (
            <>
              {t("storageStatus.usage", {
                used: formatBytes(usage.usage),
                quota: formatBytes(usage.quota),
              })}
              {" ・ "}
            </>
          )}
          {lastExportLabel}
          {volumeCount !== undefined && (
            <>
              {" ・ "}
              {t("storageStatus.volumesCount", { count: volumeCount })}
            </>
          )}
        </span>
      </div>
      {showWarning && (
        <p className={styles.warningText}>{t("storageStatus.safariWarning")}</p>
      )}
    </div>
  );
}

export default StorageStatusBar;
