// components/paint/RangeFilter.tsx — レンジ絞り込みチップ列（デザイン仕様書§4「Badge/Chip」
// ピル調・LanguageSwitcherと同じ2セグメント以上のピル群パターンを踏襲）
//
// ブランド選択済み かつ そのブランドの色にrangeが存在する場合のみPaintPicker側で表示される。
// 「すべて」（絞り込みなし・既定値）＋ロード済みカラーから動的導出したrange一覧をチップで並べる。

import { useTranslation } from "react-i18next";
import styles from "./RangeFilter.module.css";

interface RangeFilterProps {
  ranges: string[];
  /** 選択中range。「すべて」はnull */
  value: string | null;
  onChange: (range: string | null) => void;
}

function RangeFilter({ ranges, value, onChange }: RangeFilterProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.filter} role="group">
      <button
        type="button"
        className={
          value === null ? `${styles.chip} ${styles.chipActive}` : styles.chip
        }
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        {t("paint.rangeAll")}
      </button>
      {ranges.map((range) => {
        const active = value === range;
        return (
          <button
            key={range}
            type="button"
            className={
              active ? `${styles.chip} ${styles.chipActive}` : styles.chip
            }
            aria-pressed={active}
            onClick={() => onChange(range)}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}

export default RangeFilter;
