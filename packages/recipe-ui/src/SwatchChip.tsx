// packages/recipe-ui/src/SwatchChip.tsx — 色見本チップ（デザイン仕様書§4「SwatchChip」）
//
// テーマ変更の影響を受けない中立領域。白台紙（--color-swatch-frame）＋テーマ色に依存しない
// 枠・市松のみを使用する。variant=hex/photo/emptyの3種、size=sm16/md24/lg40/xl44。
// md以上は名前併記、lg以上は「ブランド ・ #hex」（mono）併記。
// variant=photoはchip写真をusePhotoUrl（ホストアプリが注入するresolvePhotoUrl経由。
// coat-scriptorium 技術計画v1 §5.2）で解決し非加工でそのまま表示する。

import { useTranslation } from "react-i18next";
import { usePhotoUrl } from "./photoSourceContext";
import styles from "./SwatchChip.module.css";

export type SwatchChipSize = "sm" | "md" | "lg" | "xl";
export type SwatchChipVariant = "hex" | "photo" | "empty";

interface SwatchChipProps {
  variant: SwatchChipVariant;
  size: SwatchChipSize;
  /** variant=hexで塗る面色（例 "#7A2E1F"） */
  hex?: string;
  /** variant=photoで表示するチップ写真のphotoId */
  photoId?: string;
  /** md以上で併記する色名 */
  name?: string;
  /** lg以上で併記するブランド名（"ブランド ・ #hex"の形式で使用） */
  brand?: string;
}

const SIZE_CLASS: Record<SwatchChipSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
  xl: styles.sizeXl,
};

function SwatchChip({
  variant,
  size,
  hex,
  photoId,
  name,
  brand,
}: SwatchChipProps) {
  const { t } = useTranslation();
  const photoUrl = usePhotoUrl(variant === "photo" ? photoId : undefined);

  const showName = size === "md" || size === "lg" || size === "xl";
  const showBrandHex = size === "lg" || size === "xl";

  const chipStyle =
    variant === "hex" && hex ? { backgroundColor: hex } : undefined;

  return (
    <span className={styles.root} data-variant={variant} data-size={size}>
      <span
        className={`${styles.frame} ${SIZE_CLASS[size]}`}
        data-testid="swatch-chip-frame"
      >
        {variant === "hex" && (
          <span className={styles.chip} style={chipStyle} />
        )}
        {variant === "photo" &&
          (photoUrl ? (
            <img className={styles.chipPhoto} src={photoUrl} alt={name ?? ""} />
          ) : (
            <span className={styles.chip} />
          ))}
        {variant === "empty" && (
          <span className={styles.chip} data-testid="swatch-chip-checker" />
        )}
      </span>
      {(showName || showBrandHex) && (
        <span className={styles.label}>
          {showName && (
            <span className={styles.name}>
              {variant === "empty" ? t("paint.hexUnset") : (name ?? "")}
            </span>
          )}
          {showBrandHex && variant !== "empty" && (brand || hex) && (
            <span className={styles.meta}>
              {brand ? `${brand} ・ ` : ""}
              {hex ?? ""}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export default SwatchChip;
