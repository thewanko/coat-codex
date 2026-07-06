// components/part-editor/AddStepButton.tsx — 工程追加ボタン（技術計画v2.2 §4.2 T26）
//
// 新規Stepはmodels/recipe.tsのstepSchemaに適合する初期値（technique両null・paints空・
// mix null・toolIds空・photoId null・memo空）で生成する。id採番はdb/recipeStore.ts /
// db/photoStore.ts等の既存規約（`<prefix>_${crypto.randomUUID()}`）に倣い`stp_`を用いる。
// stateは持たず、生成したStepをonAddへ渡すだけの薄いコンポーネント（追加後の配列操作は
// 呼び出し側=StepList/PartEditorPageの責務）。

import { useTranslation } from "react-i18next";
import type { Step } from "../../models/recipe";
import styles from "./AddStepButton.module.css";

/** stepSchemaに適合する新規Stepの初期値を生成する */
function createEmptyStep(): Step {
  return {
    id: `stp_${crypto.randomUUID()}`,
    technique: { presetKey: null, label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
  };
}

interface AddStepButtonProps {
  onAdd: (step: Step) => void;
}

function AddStepButton({ onAdd }: AddStepButtonProps) {
  const { t } = useTranslation();

  function handleClick() {
    onAdd(createEmptyStep());
  }

  return (
    <button type="button" className={styles.button} onClick={handleClick}>
      {t("editor.addStep")}
    </button>
  );
}

export default AddStepButton;
