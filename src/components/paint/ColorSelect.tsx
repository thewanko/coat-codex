// components/paint/ColorSelect.tsx — 検索可能コンボボックス（技術計画v2.2 §4.2 T19）
//
// テキスト入力で部分一致絞り込み（lib/paintPresets.searchColors）＋候補リスト表示。
// 候補行はSwatchChip(sm)＋名前（nameJaがあれば併記）。選択で確定しonSelectへ渡す。
// デザイン仕様書§4「Input」: 検索可能コンボは入力と同皮（--color-bg-sunken）。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchColors, type PaintPresetColor } from "../../lib/paintPresets";
import SwatchChip from "../common/SwatchChip";
import styles from "./ColorSelect.module.css";

interface ColorSelectProps {
  brandId: string;
  /** 選択中カラーの表示用ラベル（未選択はnull） */
  value: PaintPresetColor | null;
  onSelect: (color: PaintPresetColor) => void;
}

function displayName(color: PaintPresetColor): string {
  return color.nameJa ? `${color.name}（${color.nameJa}）` : color.name;
}

function ColorSelect({ brandId, value, onSelect }: ColorSelectProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(() => (value ? displayName(value) : ""));
  const [results, setResults] = useState<PaintPresetColor[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value ? displayName(value) : "");
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    void searchColors(brandId, open ? query : "").then((found) => {
      if (!cancelled) {
        setResults(found);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, query, open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(color: PaintPresetColor) {
    onSelect(color);
    setQuery(displayName(color));
    setOpen(false);
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <input
        type="text"
        className={styles.input}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={t("paint.colorLabel")}
        placeholder={t("paint.searchPlaceholder")}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <ul className={styles.list} role="listbox">
          {results.length === 0 && (
            <li className={styles.empty}>{t("paint.searchPlaceholder")}</li>
          )}
          {results.map((color) => (
            <li key={color.id}>
              <button
                type="button"
                className={styles.option}
                role="option"
                aria-selected={value?.id === color.id}
                onClick={() => handleSelect(color)}
              >
                <SwatchChip
                  variant={color.hex ? "hex" : "empty"}
                  size="sm"
                  hex={color.hex ?? undefined}
                />
                <span className={styles.optionName}>{displayName(color)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ColorSelect;
