// components/setup/MakeCodexButton.tsx — Overviewへの純粋なナビゲーション（技術計画v2.2 §4.2 T23）
//
// `/recipe/:id` へnavigateするのみ。navigator.storage.persist()要求はここでは行わない
// （§3.5の発火点は新規作成T22・インポート確定T33）。編集は既にautosave済みのため
// 「保存」動作は不要（v1踏襲）。

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import styles from "./MakeCodexButton.module.css";

interface MakeCodexButtonProps {
  recipeId: string;
}

function MakeCodexButton({ recipeId }: MakeCodexButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function handleClick() {
    navigate(`/recipe/${recipeId}`);
  }

  return (
    <button type="button" className={styles.button} onClick={handleClick}>
      {t("setup.makeCodex")}
    </button>
  );
}

export default MakeCodexButton;
