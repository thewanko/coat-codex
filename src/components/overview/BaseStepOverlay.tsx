// components/overview/BaseStepOverlay.tsx — ベース工程サマリーオーバーレイ
// （技術計画v2.2 §3.3・§4.2 T28・デザイン仕様書§4「BaseStepOverlay」）
//
// 代表写真の下辺に墨帯（--color-overlay-ink）を敷き、BASE overline＋技法名チップ列＋
// 右端「編集 ›」を表示する。技法名はresolveTechniqueLabel（プリセット=i18n技法名／
// 自由入力=labelそのまま）で解決する（lib/techniques.ts）。
// タップ（帯全体）／「編集 ›」ボタンいずれも/recipe/:id/part/baseへnavigateする。
// ベース工程0件時は破線ピル「＋ ベース工程を追加」を帯の位置に表示する（写真の有無に
// かかわらず帯自体は常に表示 — デザイン仕様書§4「写真なしでも帯は表示」）。

import { useTranslation } from "react-i18next";
import { resolveTechniqueLabel } from "../../lib/techniques";
import type { Step } from "../../models/recipe";
import styles from "./BaseStepOverlay.module.css";

interface BaseStepOverlayProps {
  baseSteps: Step[];
  onEdit: () => void;
}

function BaseStepOverlay({ baseSteps, onEdit }: BaseStepOverlayProps) {
  const { t } = useTranslation();

  if (baseSteps.length === 0) {
    return (
      <div className={styles.emptyRoot}>
        <button
          type="button"
          className={styles.emptyPill}
          onClick={onEdit}
          data-testid="base-step-overlay-empty"
        >
          {t("overview.addBaseStep")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.root}
      onClick={onEdit}
      data-testid="base-step-overlay"
    >
      <span className={styles.overline}>{t("overview.baseOverline")}</span>
      <span className={styles.chips}>
        {baseSteps.map((step) => {
          const label = resolveTechniqueLabel(step.technique, t);
          if (!label) {
            return null;
          }
          return (
            <span key={step.id} className={styles.chip}>
              {label}
            </span>
          );
        })}
      </span>
      <span className={styles.edit}>{t("overview.editBaseSteps")}</span>
    </button>
  );
}

export default BaseStepOverlay;
