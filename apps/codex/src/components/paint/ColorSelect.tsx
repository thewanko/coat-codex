// components/paint/ColorSelect.tsx — 検索可能コンボボックス（技術計画v2.2 §4.2 T19）
//
// テキスト入力で部分一致絞り込み（lib/paintPresets.searchColors）＋候補リスト表示。
// 候補行はSwatchChip(sm)＋名前（nameJaがあれば併記）＋range（同名色のレンジ区別、
// 例: Citadel="base"/Vallejo="Model Color"）を控えめに後置。選択で確定しonSelectへ渡す。
// デザイン仕様書§4「Input」: 検索可能コンボは入力と同皮（--color-bg-sunken）。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchColors, type PaintPresetColor } from "../../lib/paintPresets";
import { SwatchChip } from "@coat-codex/recipe-ui";
import styles from "./ColorSelect.module.css";

interface ColorSelectProps {
  brandId: string;
  /** 選択中カラーの表示用ラベル（未選択はnull） */
  value: PaintPresetColor | null;
  onSelect: (color: PaintPresetColor) => void;
  /** 指定時はこのrangeに完全一致するカラーのみへ候補を絞り込む（未指定/undefinedは絞り込みなし） */
  rangeFilter?: string;
}

function displayName(color: PaintPresetColor): string {
  return color.nameJa ? `${color.name}（${color.nameJa}）` : color.name;
}

/** 入力欄に確定表示する文字列。rangeがあれば末尾に「— range」で付記する
 *  （例: "Mephiston Red — base" / "Khaki — Model Color"） */
function displayNameWithRange(color: PaintPresetColor): string {
  const base = displayName(color);
  return color.range ? `${base} — ${color.range}` : base;
}

function ColorSelect({
  brandId,
  value,
  onSelect,
  rangeFilter,
}: ColorSelectProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(() =>
    value ? displayNameWithRange(value) : "",
  );
  const [results, setResults] = useState<PaintPresetColor[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value ? displayNameWithRange(value) : "");
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    void searchColors(brandId, open ? query : "", rangeFilter).then((found) => {
      if (!cancelled) {
        setResults(found);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, query, open, rangeFilter]);

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
    setQuery(displayNameWithRange(color));
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
            <li className={styles.empty}>{t("paint.noResults")}</li>
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
                {color.range && (
                  <span className={styles.optionRange}>{color.range}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ColorSelect;
