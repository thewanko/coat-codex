// components/part-editor/PaintSlotList.tsx — PaintSlotの一覧本体（技術計画v2.2 §4.2 T21）
//
// state.paints/mixをスロット順に描画し、addPaintSlot/removePaintSlot/commitPercentInput
// （lib/mixRatio.ts）経由でMixStateを更新する。単色（paints.length<=1）では%入力欄非表示
// （§2.3 値規約表）。5件到達で追加disabled、未到達は残数を併記（デザイン仕様書§4）。
// リスト末尾にMixRatioInput（T20）を配置する。
//
// colorId重複防止: PaintPicker自体は選択のたびに新規idを発行するが、下記の
// palette再利用ロジックにより既存colorIdが再確定されるケースがあるため、
// INV-7（paints内colorId重複禁止）を守る防御的ガードとして、
// 「選択確定時に他スロットで使用中のcolorIdなら反映を拒否しトースト警告」を実装する
// （候補除外ではなく選択後ガード — 実装の単純さを優先。挙動はタスク報告に明記）。
// このガードは既存idの再利用パス経由で実際に到達しうる（防御的コードではない）。
// 警告文言のi18nキーは`mix.duplicateColor`（locales定義済み）。
//
// 確定色と同一の既存palette色（preset: presetId一致／custom: brand+name+hex+
// chipPhotoId一致）があればその既存idを再利用し、onAddColorは新規追加時のみ呼ぶ
// （palette肥大化防止）。chipPhotoIdも一致条件に含めるのは、「カラー名確定→後から
// チップ写真添付」の2段階確定でchip無しの既存エントリに吸収されるとchipPhotoIdが
// 親stateに載らずBlobが孤児化するため（chip追加時は新paletteエントリとして扱う）。
// 再利用したidが他スロットで使用中なら上記の重複ガード（toast）に掛かる。
//
// pendingスロット（未確定の一時プレースホルダcolorId）の判定はlib/pendingPaints.tsの
// PENDING_COLOR_PREFIXを単一情報源とする。autosave手前でのstrip適用はM4の結線タスクの責務。

import { useTranslation } from "react-i18next";
import type { PaletteColor } from "../../models/recipe";
import {
  addPaintSlot,
  commitPercentInput,
  removePaintSlot,
  type MixState,
} from "../../lib/mixRatio";
import { PENDING_COLOR_PREFIX } from "../../lib/pendingPaints";
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
    const placeholderId = `${PENDING_COLOR_PREFIX}${crypto.randomUUID()}`;
    onChange(addPaintSlot(state, placeholderId));
  }

  function handleRemoveSlot(index: number) {
    onChange(removePaintSlot(state, index));
  }

  function handleCommitPercent(index: number, value: number) {
    onChange(commitPercentInput(state, index, value));
  }

  /** 確定色と同一の既存palette色を探す（preset: presetId一致／custom: brand+name+hex一致） */
  function findExistingPaletteColor(
    color: PaletteColor,
  ): PaletteColor | undefined {
    if (color.source === "preset") {
      return palette.find(
        (existing) =>
          existing.source === "preset" && existing.presetId === color.presetId,
      );
    }
    return palette.find(
      (existing) =>
        existing.source === "custom" &&
        existing.brand === color.brand &&
        existing.name === color.name &&
        existing.hex === color.hex &&
        existing.chipPhotoId === color.chipPhotoId,
    );
  }

  function handleCommitColor(index: number, color: PaletteColor) {
    const existing = findExistingPaletteColor(color);
    const resolvedId = existing?.id ?? color.id;

    const usedElsewhere = state.paints.some(
      (paint, i) => i !== index && paint.colorId === resolvedId,
    );
    if (usedElsewhere) {
      toast.error(t("mix.duplicateColor"));
      return;
    }

    if (!existing) {
      onAddColor(color);
    }
    const nextPaints = state.paints.map((paint, i) =>
      i === index ? { colorId: resolvedId } : paint,
    );
    onChange({ paints: nextPaints, mix: state.mix });
  }

  return (
    <div className={styles.root}>
      <div className={styles.slots}>
        {state.paints.map((paint, index) => (
          <PaintSlot
            key={paint.colorId}
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
