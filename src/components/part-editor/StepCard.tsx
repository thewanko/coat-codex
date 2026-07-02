// components/part-editor/StepCard.tsx — 工程カード組み立て（技術計画v2.2 §4.2 T25）
//
// TechniqueSelect＋PaintSlotList（内部にMixRatioInputを含む）＋ToolSelect＋
// 下段にStepPhotoTile＋MemoFieldのペア＋工程削除ボタン、を1つのStep（models/recipe.ts）に
// 対する制御コンポーネントとして組み立てる。state保持は行わず、部分更新はすべて
// onChange(next: Step)で呼び出し側（StepList/PartEditorPage、T26/T27）へ委譲する。
//
// PaintSlotList/PaintSlot/MixRatioInputは変更禁止（M3レビュー確定物）。palette要素の再利用・
// pending塗料（col_pending_*）の扱いはPaintSlotList側の責務であり、StepCardはPaintSlotListが
// 返すMixState（paints/mix。pendingスロットを含み得る）をそのままStep.paints/mixへ書き戻す。
// pending stripはautosave/エクスポート手前（ストア層・T16）の責務であり、StepCard側では行わない
// （技術計画v2.2 §4.2 M4冒頭 必須事項①）。
//
// 工程削除は既存ConfirmDialogの流儀（PhotoUploader/StepPhotoTileと同様、確定はここで行い、
// onDeleteは削除確定後にのみ呼ぶ）を踏襲する。
//
// PaintSlot（PaintSlotList内部）はkey={colorId}でblur確定時に1回だけクリックが吸われる既知UX事項
// （M3レビューRound3 Low）があるため、StepCard側ではstate.paints/mixの参照や配列順を不要に
// 作り変えず、PaintSlotListへ渡すstateはStep.paints/mixから素直に導出するだけに留める
// （余計なkey付け替え・再マウントを誘発しない）。

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Step, PaletteColor } from "../../models/recipe";
import type { MixState } from "../../lib/mixRatio";
import TechniqueSelect from "./TechniqueSelect";
import PaintSlotList from "./PaintSlotList";
import ToolSelect from "./ToolSelect";
import MemoField from "./MemoField";
import StepPhotoTile from "./StepPhotoTile";
import ConfirmDialog from "../common/ConfirmDialog";
import styles from "./StepCard.module.css";

interface StepCardProps {
  step: Step;
  index: number;
  recipeId: string;
  palette: PaletteColor[];
  onChange: (next: Step) => void;
  onAddColor: (color: PaletteColor) => void;
  onDelete: () => void;
}

function StepCard({
  step,
  index,
  recipeId,
  palette,
  onChange,
  onAddColor,
  onDelete,
}: StepCardProps) {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] = useState(false);

  const mixState: MixState = { paints: step.paints, mix: step.mix };

  function handleMixChange(next: MixState) {
    onChange({ ...step, paints: next.paints, mix: next.mix });
  }

  function requestDelete() {
    setPendingDelete(true);
  }

  function confirmDelete() {
    setPendingDelete(false);
    onDelete();
  }

  function cancelDelete() {
    setPendingDelete(false);
  }

  return (
    <div
      id={`step-card-${index}`}
      className={styles.root}
      data-testid={`step-card-${index}`}
    >
      <div className={styles.header}>
        <span className={styles.stepTag}>
          {t("editor.stepLabel", { n: index + 1 })}
        </span>
        <button
          type="button"
          className={styles.deleteButton}
          aria-label={t("editor.deleteStep")}
          onClick={requestDelete}
        >
          {t("editor.deleteStep")}
        </button>
      </div>

      <TechniqueSelect
        value={step.technique}
        onChange={(technique) => onChange({ ...step, technique })}
      />

      <PaintSlotList
        state={mixState}
        palette={palette}
        recipeId={recipeId}
        onChange={handleMixChange}
        onAddColor={onAddColor}
      />

      <ToolSelect
        value={step.toolIds}
        onChange={(toolIds) => onChange({ ...step, toolIds })}
      />

      <div className={styles.bottomRow}>
        <StepPhotoTile
          photoId={step.photoId}
          stepIndex={index}
          recipeId={recipeId}
          onChange={(photoId) => onChange({ ...step, photoId })}
        />
        <div className={styles.memoWrap}>
          <MemoField
            value={step.memo}
            onChange={(memo) => onChange({ ...step, memo })}
          />
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete}
        title={t("editor.deleteStepTitle")}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}

export default StepCard;
