// components/part-editor/PaintSlotList.tsx — PaintSlotの一覧本体（技術計画v2.2 §4.2 T21）
//
// state.paints/mixをスロット順に描画し、addPaintSlot/removePaintSlot/commitPercentInput
// （lib/mixRatio.ts）経由でMixStateを更新する。単色（paints.length<=1）では%入力欄非表示
// （§2.3 値規約表）。5件到達で追加disabled、未到達は残数を併記（デザイン仕様書§4）。
// リスト末尾にMixRatioInput（T20）を配置する。
//
// colorId重複防止: PaintPicker自体は選択のたびに新規idを発行するため同一colorIdの
// 衝突は現状発生し得ないが、INV-7（paints内colorId重複禁止）を守る防御的ガードとして、
// 「選択確定時に他スロットで使用中のcolorIdなら反映を拒否しトースト警告」を実装する
// （候補除外ではなく選択後ガード — 実装の単純さを優先。挙動はタスク報告に明記）。
// 警告文言のi18nキー`mix.duplicateColor`は未追加（不足キーとしてタスク報告に明記。
// locales編集は本タスクの範囲外のため追加しない。t()は未定義キーをキー名のまま返す）。

import { useTranslation } from "react-i18next";
import type { PaletteColor } from "../../models/recipe";
import {
  addPaintSlot,
  commitPercentInput,
  removePaintSlot,
  type MixState,
} from "../../lib/mixRatio";
import { useToast } from "../common/toastContext";
import PaintSlot from "./PaintSlot";
import MixRatioInput from "../paint/MixRatioInput";
import styles from "./PaintSlotList.module.css";

const MAX_PAINTS = 5;

interface PaintSlotListProps {
  state: MixState;
  palette: PaletteColor[];
  recipeId: string;
  onChange: (next: MixState) => void;
  onAddColor: (color: PaletteColor) => void;
}

function PaintSlotList({
  state,
  palette,
  recipeId,
  onChange,
  onAddColor,
}: PaintSlotListProps) {
  const { t } = useTranslation();
  const toast = useToast();

  const paletteById = new Map(palette.map((color) => [color.id, color]));
  const showPercent = state.paints.length > 1;
  const atMax = state.paints.length >= MAX_PAINTS;
  const remaining = MAX_PAINTS - state.paints.length;

  function handleAddSlot() {
    if (atMax) return;
    // 未選択の新スロットには一時的なプレースホルダcolorIdを割り当てず、
    // ユーザーがPaintPickerで色を確定した時点でcolorIdを持つ。
    // addPaintSlotはcolorIdを要求するため、確定前は一意な仮IDを発行する。
    const placeholderId = `col_pending_${crypto.randomUUID()}`;
    onChange(addPaintSlot(state, placeholderId));
  }

  function handleRemoveSlot(index: number) {
    onChange(removePaintSlot(state, index));
  }

  function handleCommitPercent(index: number, value: number) {
    onChange(commitPercentInput(state, index, value));
  }

  function handleCommitColor(index: number, color: PaletteColor) {
    const usedElsewhere = state.paints.some(
      (paint, i) => i !== index && paint.colorId === color.id,
    );
    if (usedElsewhere) {
      toast.error(t("mix.duplicateColor"));
      return;
    }

    onAddColor(color);
    const nextPaints = state.paints.map((paint, i) =>
      i === index ? { colorId: color.id } : paint,
    );
    onChange({ paints: nextPaints, mix: state.mix });
  }

  return (
    <div className={styles.root}>
      <div className={styles.slots}>
        {state.paints.map((paint, index) => (
          <PaintSlot
            key={index}
            index={index}
            recipeId={recipeId}
            color={paletteById.get(paint.colorId)}
            percent={state.mix ? (state.mix[index] ?? null) : null}
            showPercent={showPercent}
            onCommitColor={(color) => handleCommitColor(index, color)}
            onCommitPercent={(value) => handleCommitPercent(index, value)}
            onRemove={() => handleRemoveSlot(index)}
          />
        ))}
      </div>

      <div className={styles.addRow}>
        <button
          type="button"
          className={styles.addButton}
          disabled={atMax}
          onClick={handleAddSlot}
        >
          {t("mix.addPaint")}
        </button>
        {atMax ? (
          <span className={styles.hint}>{t("mix.maxPaints")}</span>
        ) : (
          <span className={styles.hint}>
            {t("mix.remaining", { count: remaining })}
          </span>
        )}
      </div>

      <MixRatioInput state={state} onChange={onChange} />
    </div>
  );
}

export default PaintSlotList;
