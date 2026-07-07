// packages/recipe-ui/src/MixBadge.tsx — 混合バッジ表示アトム（coat-scriptorium 技術計画v1 §5.2）
//
// formatMixBadge/isMixTotalValid（@coat-codex/recipe-core）で導出したバッジ文字列と
// 合計≠100の警告バッジを表示する読み取り専用アトム。PartReviewDialog.module.cssの
// .mixBadge/.mixErrorBadge（読み取り専用表示の基準スタイル）を逐語移動している。

import { useTranslation } from "react-i18next";
import {
  formatMixBadge,
  isMixTotalValid,
  type Step,
} from "@coat-codex/recipe-core";
import styles from "./MixBadge.module.css";

interface MixBadgeProps {
  paints: Step["paints"];
  mix: Step["mix"];
  className?: string;
  /** ホスト側の載る面に合わせる背景バリアント。"raised"は--color-bg-raised面（card等）向け */
  surface?: "default" | "raised";
}

function MixBadge({
  paints,
  mix,
  className,
  surface = "default",
}: MixBadgeProps) {
  const { t } = useTranslation();
  const badgeText = formatMixBadge(paints, mix);
  const showTotalWarning = !isMixTotalValid(paints, mix);
  const totalPercent = mix ? mix.reduce((sum, value) => sum + value, 0) : 0;

  if (!badgeText && !showTotalWarning) {
    return null;
  }

  return (
    <>
      {badgeText && (
        <span
          className={[styles.mixBadge, className].filter(Boolean).join(" ")}
          data-surface={surface}
        >
          {badgeText}
        </span>
      )}
      {showTotalWarning && (
        <span className={styles.mixErrorBadge}>
          {t("mix.badgeWarning", { value: totalPercent })}
        </span>
      )}
    </>
  );
}

export default MixBadge;
