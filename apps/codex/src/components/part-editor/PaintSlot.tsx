// components/part-editor/PaintSlot.tsx — 1スロット=1塗料行（技術計画v2.2 §4.2 T21）
//
// デザイン仕様書§4「PaintSlot（A〜E）＋ MixRatioInput」:
// PC=1行 `A(朱金ラベル) → Brand select → Color select → SwatchChip → %入力(48px) → ✕`
// mobile=薄枠グループで2行（選択行／スウォッチ+配合行）。
// 単色（paints.length<=1）では%入力欄を描画しない（技術計画v2.2 §2.3 値規約表）。

import { useEffect, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { PaletteColor } from "@coat-codex/recipe-core";
import PaintPicker from "../paint/PaintPicker";
import SwatchChip from "../common/SwatchChip";
import styles from "./PaintSlot.module.css";

const LETTERS = ["A", "B", "C", "D", "E"] as const;

function slotLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

interface PaintSlotProps {
  index: number;
  recipeId: string;
  color: PaletteColor | undefined;
  percent: number | null;
  showPercent: boolean;
  onCommitColor: (color: PaletteColor) => void;
  onCommitPercent: (value: number) => void;
  onRemove: () => void;
}

function PaintSlot({
  index,
  recipeId,
  color,
  percent,
  showPercent,
  onCommitColor,
  onCommitPercent,
  onRemove,
}: PaintSlotProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(percent ?? 0));

  useEffect(() => {
    setDraft(String(percent ?? 0));
  }, [percent]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setDraft(event.target.value);
  }

  function commit() {
    const parsed = Number(draft);
    if (Number.isNaN(parsed)) {
      setDraft(String(percent ?? 0));
      return;
    }
    onCommitPercent(parsed);
  }

  function handleBlur() {
    commit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  }

  const letter = slotLetter(index);

  return (
    <div className={styles.root} data-testid={`paint-slot-${index}`}>
      <span className={styles.letter} aria-hidden="true">
        {letter}
      </span>
      <div className={styles.pickerRow}>
        <PaintPicker
          recipeId={recipeId}
          value={color}
          onCommit={onCommitColor}
        />
      </div>
      <div className={styles.tailRow}>
        <SwatchChip
          variant={color?.hex ? "hex" : color?.chipPhotoId ? "photo" : "empty"}
          size="sm"
          hex={color?.hex ?? undefined}
          photoId={color?.chipPhotoId ?? undefined}
          name={color?.name}
        />
        {showPercent && (
          <input
            type="number"
            className={styles.percentInput}
            min={0}
            max={100}
            step={1}
            value={draft}
            aria-label={t("mix.label") + " " + letter}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
        )}
        <button
          type="button"
          className={styles.removeButton}
          aria-label={t("photo.delete") + " " + letter}
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default PaintSlot;
