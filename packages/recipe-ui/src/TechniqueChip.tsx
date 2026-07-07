// packages/recipe-ui/src/TechniqueChip.tsx — 技法チップ表示アトム（coat-scriptorium 技術計画v1 §5.2）
//
// resolveTechniqueLabel（@coat-codex/recipe-core）が空文字を返す場合は非描画。
// PartReviewDialog.module.cssの.techniqueChip（読み取り専用表示の基準スタイル）を逐語移動している。

import { useTranslation } from "react-i18next";
import { resolveTechniqueLabel, type Step } from "@coat-codex/recipe-core";
import styles from "./TechniqueChip.module.css";

interface TechniqueChipProps {
  technique: Step["technique"];
  className?: string;
}

function TechniqueChip({ technique, className }: TechniqueChipProps) {
  const { t } = useTranslation();
  const label = resolveTechniqueLabel(technique, t);

  if (!label) {
    return null;
  }

  return (
    <span
      className={[styles.techniqueChip, className].filter(Boolean).join(" ")}
    >
      {label}
    </span>
  );
}

export default TechniqueChip;
