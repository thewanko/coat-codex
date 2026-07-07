// components/home/ExportReminderBanner.tsx — エクスポート促しリマインダー
// （技術計画v2.2 §3.5「ExportReminderBanner」・デザイン仕様書§4「Banner」reminder-full /
//  reminder-compact・T34）
//
// 2形態をpropsで切替:
// - variant="full"（Home全幅バナー）: リマインダー対象レシピ一覧を受け取り、1件以上あれば表示。
//   「今すぐエクスポート」は対象レシピのうち最も古くバックアップされた1件（＝先頭要素。
//   呼び出し側が最終エクスポート日時の昇順でソートして渡す設計とする）をワンタップでエクスポート。
//   他の対象レシピが残っていれば呼び出し側の再判定でバナーは表示継続する。
// - variant="compact"（Overviewコンパクト帯）: 単一レシピ（当該レシピ）を受け取り、
//   未バックアップかどうかは呼び出し側がshouldShowExportReminder等で判定済みの前提で
//   open propsとして渡す。
//
// ワンタップエクスポートは「ワンタップ」の趣旨（選択ダイアログを挟まない）に従い、
// 写真あり/なし選択を出さず、データ保全の安全側に倒して常に写真を含めてエクスポートする
// （exportRecipeToBlobをincludePhotos:trueで直接呼ぶ。写真あり/なしを選びたい場合は
// 既存のRecipeCardメニュー／ExportActionBarのJSONエクスポートを使う）。
// 「あとで」は7日スヌーズをmeta.reminderSnoozedUntilへ記録する（storageHealthの純関数に
// 従い、呼び出し側のリマインダー判定が次回以降falseを返すようになる）。

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { exportRecipeToBlob } from "../../lib/exporters/json";
import { recordRecipeExport, snoozeReminder } from "../../lib/storageHealth";
import { useToast } from "../common/toastContext";
import { downloadBlob, sanitizeFilename } from "../common/downloadBlob";
import type { RecipeDoc } from "@coat-codex/recipe-core";
import styles from "./ExportReminderBanner.module.css";

const SNOOZE_DAYS = 7;

function snoozeUntil(now: Date): string {
  const until = new Date(now.getTime() + SNOOZE_DAYS * 24 * 60 * 60 * 1000);
  return until.toISOString();
}

interface ExportReminderBannerProps {
  variant: "full" | "compact";
  /** ワンタップエクスポートの対象レシピ（full=対象レシピのうち先頭の1件／compact=当該レシピ） */
  targetRecipe: RecipeDoc;
  /** スヌーズ操作後に呼び出し側へ通知（再判定・再フェッチ用） */
  onSnoozed?: () => void;
  /** エクスポート成功後に呼び出し側へ通知（対象レシピの再判定用） */
  onExported?: (recipeId: string) => void;
}

function ExportReminderBanner({
  variant,
  targetRecipe,
  onSnoozed,
  onExported,
}: ExportReminderBannerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [isExporting, setIsExporting] = useState(false);

  async function handleExportNow() {
    setIsExporting(true);
    try {
      const blob = await exportRecipeToBlob(targetRecipe.id, {
        includePhotos: true,
      });
      downloadBlob(blob, `${sanitizeFilename(targetRecipe.title)}.json`);
      await recordRecipeExport(targetRecipe.id, new Date().toISOString());
      toast.success(t("export.jsonSuccess"));
      onExported?.(targetRecipe.id);
    } catch {
      toast.error(t("export.jsonFailed"));
    } finally {
      setIsExporting(false);
    }
  }

  async function handleSnooze() {
    await snoozeReminder(snoozeUntil(new Date()));
    onSnoozed?.();
  }

  const message =
    variant === "full"
      ? t("exportReminder.homeMessage")
      : t("exportReminder.overviewMessage");

  return (
    <div
      className={styles.root}
      data-variant={variant}
      data-testid="export-reminder-banner"
      role="status"
    >
      <span className={styles.icon} aria-hidden="true">
        !
      </span>
      <span className={styles.message}>{message}</span>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.exportButton}
          disabled={isExporting}
          onClick={() => void handleExportNow()}
        >
          {t("exportReminder.exportNow")}
        </button>
        <button
          type="button"
          className={styles.laterButton}
          onClick={() => void handleSnooze()}
        >
          {t("exportReminder.later")}
        </button>
      </div>
    </div>
  );
}

export default ExportReminderBanner;
