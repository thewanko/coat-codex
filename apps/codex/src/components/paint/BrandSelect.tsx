// components/paint/BrandSelect.tsx — ブランド選択（技術計画v2.2 §4.2 T19）
//
// プリセット4ブランド（loadBrandIndexから取得）＋「その他（自由入力）」を
// ネイティブ<select>で提示する（デザイン仕様書§4「Input」: selectは右端▼）。
// 選択されたブランドIDをonChangeで返す。自由入力時はnullを返す。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadBrandIndex, type PaintBrandMeta } from "../../lib/paintPresets";
import styles from "./BrandSelect.module.css";

export const CUSTOM_BRAND_VALUE = "__custom__";

interface BrandSelectProps {
  /** 選択中のブランドID。自由入力モードはnull */
  value: string | null;
  /** 選択ブランドID（自由入力時はnull）を返す */
  onChange: (brandId: string | null) => void;
}

function BrandSelect({ value, onChange }: BrandSelectProps) {
  const { t } = useTranslation();
  const [brands, setBrands] = useState<PaintBrandMeta[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadBrandIndex().then((loaded) => {
      if (!cancelled) {
        setBrands(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    onChange(next === CUSTOM_BRAND_VALUE ? null : next);
  }

  return (
    <select
      className={styles.select}
      aria-label={t("paint.brandLabel")}
      value={value ?? CUSTOM_BRAND_VALUE}
      onChange={handleChange}
    >
      {brands.map((brand) => (
        <option key={brand.id} value={brand.id}>
          {brand.label}
        </option>
      ))}
      <option value={CUSTOM_BRAND_VALUE}>{t("paint.customBrand")}</option>
    </select>
  );
}

export default BrandSelect;
