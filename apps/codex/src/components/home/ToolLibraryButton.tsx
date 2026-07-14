// components/home/ToolLibraryButton.tsx — Homeアクション行のツールライブラリ導線
// （技術計画v2.9 §3.3 HomePage・§4.2 T65・デザイン仕様書§D「Homeアクション行の3ボタン化」）
//
// /toolsへ遷移する純粋なナビゲーション（storage.persist()要求なし）。
// NewRecipeButton（primary）・ImportJsonButton（secondary）と同格のsecondaryピルとして並置する。

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import styles from "./ToolLibraryButton.module.css";

function ToolLibraryButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function handleClick() {
    navigate("/tools");
  }

  return (
    <button type="button" className={styles.button} onClick={handleClick}>
      {t("nav.tools")}
    </button>
  );
}

export default ToolLibraryButton;
