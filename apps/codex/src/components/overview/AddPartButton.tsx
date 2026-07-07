// components/overview/AddPartButton.tsx — パーツ追加ボタン（技術計画v2.2 §3.3・§4.2 T28）
//
// 新規パーツはpartSchemaに適合する初期値（name=i18n既定名、steps=空配列）で生成する。
// id採番はAddStepButton（stp_プレフィックス）等の既存規約に倣い`part_`を用いる
// （INV-17: parts[].id予約語"base"の禁止は接頭辞により自動的に回避される）。
// stateは持たず、生成したPartをonAddへ渡すだけの薄いコンポーネント（配列操作は
// 呼び出し側=PartCardList/RecipeOverviewPageの責務）。

import { useTranslation } from "react-i18next";
import type { RecipeDoc } from "@coat-codex/recipe-core";
import styles from "./AddPartButton.module.css";

export type RecipePart = RecipeDoc["parts"][number];

/** partSchemaに適合する新規Partの初期値を生成する */
function createEmptyPart(name: string): RecipePart {
  return {
    id: `part_${crypto.randomUUID()}`,
    name,
    steps: [],
  };
}

interface AddPartButtonProps {
  onAdd: (part: RecipePart) => void;
}

function AddPartButton({ onAdd }: AddPartButtonProps) {
  const { t } = useTranslation();

  function handleClick() {
    onAdd(createEmptyPart(t("overview.newPartName")));
  }

  return (
    <button type="button" className={styles.button} onClick={handleClick}>
      {t("overview.addPart")}
    </button>
  );
}

export default AddPartButton;
