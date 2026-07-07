// components/paint/PaintPicker.tsx — 塗料選択（技術計画v2.2 §4.2 T19）
//
// BrandSelect（プリセット4ブランド＋自由入力）→ColorSelect（ブランドで候補絞り込み）で
// palette要素（§2.1）を確定する。自由入力モード（customBrand選択時 or プリセットに
// 無い場合）はブランド名（任意）＋カラー名（必須）＋HEX手入力／カラーチップ写真添付
// （どちらか片方でよい・排他ではない）。SwatchChipで常時プレビューする。
//
// 出力形状は§2.1 palette要素＋不変条件14（source='preset' ⇔ presetId非null）に準拠。
// チップ写真の保存にはT14 savePhotoが必要でrecipeIdを要求するため、propsにrecipeIdを追加
// （技術計画のprops記載value/onCommitに対する必要最小限の拡張。カラーチップ写真を
// 使わない呼び出し側はrecipeIdを渡すだけでよい）。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PaletteColor } from "@coat-codex/recipe-core";
import type { PaintPresetColor } from "../../lib/paintPresets";
import { savePhoto } from "../../db/photoStore";
import {
  loadBrandIndex,
  loadBrandColors,
  getAvailableRanges,
  type PaintBrandMeta,
} from "../../lib/paintPresets";
import { useToast } from "../common/toastContext";
import { SwatchChip } from "@coat-codex/recipe-ui";
import BrandSelect from "./BrandSelect";
import ColorSelect from "./ColorSelect";
import RangeFilter from "./RangeFilter";
import styles from "./PaintPicker.module.css";

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

interface PaintPickerProps {
  recipeId: string;
  value?: PaletteColor;
  onCommit: (color: PaletteColor) => void;
}

interface HasMessageKey {
  messageKey: string;
}

function hasMessageKey(err: unknown): err is HasMessageKey {
  return (
    typeof err === "object" &&
    err !== null &&
    "messageKey" in err &&
    typeof (err as { messageKey?: unknown }).messageKey === "string"
  );
}

/** valueから内部stateの初期値/再同期先を導出する（brandId/selectedColor/custom*系の単一情報源） */
function deriveStateFromValue(value: PaletteColor | undefined) {
  const brandId =
    value && value.source === "preset" && value.presetId
      ? (value.presetId.split(":")[0] ?? null)
      : null;
  const selectedColor: PaintPresetColor | null =
    value && value.source === "preset" && value.presetId
      ? {
          id: value.presetId,
          name: value.name,
          hex: value.hex,
        }
      : null;
  const customBrandName =
    value && value.source === "custom" ? (value.brand ?? "") : "";
  const customColorName = value && value.source === "custom" ? value.name : "";
  const customHex = value && value.source === "custom" ? (value.hex ?? "") : "";
  const customChipPhotoId =
    value && value.source === "custom" ? value.chipPhotoId : null;

  return {
    brandId,
    selectedColor,
    customBrandName,
    customColorName,
    customHex,
    customChipPhotoId,
  };
}

function PaintPicker({ recipeId, value, onCommit }: PaintPickerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [brands, setBrands] = useState<PaintBrandMeta[]>([]);

  const initialState = deriveStateFromValue(value);

  const [brandId, setBrandId] = useState<string | null>(initialState.brandId);
  const [selectedColor, setSelectedColor] = useState<PaintPresetColor | null>(
    initialState.selectedColor,
  );
  const [availableRanges, setAvailableRanges] = useState<string[]>([]);
  const [rangeFilter, setRangeFilter] = useState<string | null>(null);

  // 自由入力モードの下書き
  const [customBrandName, setCustomBrandName] = useState(
    initialState.customBrandName,
  );
  const [customColorName, setCustomColorName] = useState(
    initialState.customColorName,
  );
  const [customHex, setCustomHex] = useState(initialState.customHex);
  const [customChipPhotoId, setCustomChipPhotoId] = useState<string | null>(
    initialState.customChipPhotoId,
  );
  const [uploadingChip, setUploadingChip] = useState(false);

  // propsのvalueが変更されたら内部stateを再同期する（初期化子は初回マウント時のみ
  // 評価されるため、外部から確定色が変わった場合に反映されない問題への対応）
  useEffect(() => {
    const next = deriveStateFromValue(value);
    setBrandId(next.brandId);
    setSelectedColor(next.selectedColor);
    setCustomBrandName(next.customBrandName);
    setCustomColorName(next.customColorName);
    setCustomHex(next.customHex);
    setCustomChipPhotoId(next.customChipPhotoId);
  }, [value]);

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

  // brandIdが変わるたびに、そのブランドの全色からレンジ一覧を導出する
  // （レンジ一覧はロード済みカラーから動的導出。ハードコード禁止）
  useEffect(() => {
    if (!brandId) {
      setAvailableRanges([]);
      return;
    }
    let cancelled = false;
    void loadBrandColors(brandId).then((colors) => {
      if (!cancelled) {
        setAvailableRanges(getAvailableRanges(colors));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const isCustomMode = brandId === null;
  const brandMeta = brands.find((b) => b.id === brandId);

  function handleBrandChange(nextBrandId: string | null) {
    setBrandId(nextBrandId);
    setSelectedColor(null);
    setRangeFilter(null);
  }

  function handlePresetColorSelect(color: PaintPresetColor) {
    setSelectedColor(color);
    if (!brandId) return;
    const meta = brands.find((b) => b.id === brandId);
    const paletteColor: PaletteColor = {
      id: `col_${crypto.randomUUID()}`,
      source: "preset",
      brand: meta?.label ?? brandId,
      name: color.name,
      presetId: color.id,
      hex: color.hex,
      chipPhotoId: null,
    };
    onCommit(paletteColor);
  }

  function commitCustom(overrides?: {
    hex?: string;
    chipPhotoId?: string | null;
  }) {
    const trimmedName = customColorName.trim();
    if (trimmedName === "") return;

    const hexCandidate = overrides?.hex ?? customHex;
    const hexValid =
      hexCandidate.trim() === "" || HEX_PATTERN.test(hexCandidate.trim());
    if (!hexValid) return;

    const paletteColor: PaletteColor = {
      id: `col_${crypto.randomUUID()}`,
      source: "custom",
      brand: customBrandName.trim() === "" ? null : customBrandName.trim(),
      name: trimmedName,
      presetId: null,
      hex: hexCandidate.trim() === "" ? null : hexCandidate.trim(),
      chipPhotoId:
        overrides && "chipPhotoId" in overrides
          ? (overrides.chipPhotoId ?? null)
          : customChipPhotoId,
    };
    onCommit(paletteColor);
  }

  function handleCustomColorNameBlur() {
    commitCustom();
  }

  function handleHexChange(event: React.ChangeEvent<HTMLInputElement>) {
    setCustomHex(event.target.value);
  }

  function handleHexBlur() {
    commitCustom();
  }

  function handleColorPickerChange(event: React.ChangeEvent<HTMLInputElement>) {
    // <input type="color">はドラッグ中に連続発火するため、ここではプレビュー用の
    // stateのみ更新する。確定（commitCustom）はonBlurで1回だけ行う
    // （連続commitはcolorId変化によるkey={colorId}再マウントでピッカー操作自体を
    // 破壊するため）。
    setCustomHex(event.target.value);
  }

  function handleColorPickerBlur() {
    commitCustom();
  }

  async function handleChipFileSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setUploadingChip(true);
    try {
      const photoId = await savePhoto(file, recipeId);
      setCustomChipPhotoId(photoId);
      commitCustom({ chipPhotoId: photoId });
    } catch (err) {
      if (hasMessageKey(err)) {
        toast.error(t(err.messageKey));
      } else {
        throw err;
      }
    } finally {
      setUploadingChip(false);
    }
  }

  const hexTrimmed = customHex.trim();
  const hexError = hexTrimmed !== "" && !HEX_PATTERN.test(hexTrimmed);

  const previewProps = isCustomMode
    ? customChipPhotoId
      ? { variant: "photo" as const, photoId: customChipPhotoId }
      : hexTrimmed !== "" && !hexError
        ? { variant: "hex" as const, hex: hexTrimmed }
        : { variant: "empty" as const }
    : selectedColor?.hex
      ? { variant: "hex" as const, hex: selectedColor.hex }
      : selectedColor
        ? { variant: "empty" as const }
        : { variant: "empty" as const };

  const previewName = isCustomMode
    ? customColorName || undefined
    : (selectedColor?.name ?? value?.name);

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <div className={styles.brandCell}>
          <BrandSelect value={brandId} onChange={handleBrandChange} />
        </div>

        {!isCustomMode && brandId && availableRanges.length > 0 && (
          <div className={styles.rangeCell}>
            <RangeFilter
              ranges={availableRanges}
              value={rangeFilter}
              onChange={setRangeFilter}
            />
          </div>
        )}

        {!isCustomMode && brandId && (
          <div className={styles.colorCell}>
            <ColorSelect
              brandId={brandId}
              value={selectedColor}
              onSelect={handlePresetColorSelect}
              rangeFilter={rangeFilter ?? undefined}
            />
          </div>
        )}

        <div className={styles.swatchCell}>
          <SwatchChip
            variant={previewProps.variant}
            size="md"
            hex={"hex" in previewProps ? previewProps.hex : undefined}
            photoId={
              "photoId" in previewProps ? previewProps.photoId : undefined
            }
            name={previewName}
            brand={brandMeta?.label}
          />
        </div>
      </div>

      {isCustomMode && (
        <div className={styles.customPanel}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              {t("paint.customBrandName")}
            </span>
            <input
              type="text"
              className={styles.textInput}
              value={customBrandName}
              onChange={(event) => setCustomBrandName(event.target.value)}
              onBlur={handleCustomColorNameBlur}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              {t("paint.customColorName")}
            </span>
            <input
              type="text"
              className={styles.textInput}
              value={customColorName}
              onChange={(event) => setCustomColorName(event.target.value)}
              onBlur={handleCustomColorNameBlur}
              required
            />
          </label>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("paint.pickHex")}</span>
            <div className={styles.hexRow}>
              <input
                type="color"
                className={styles.colorPicker}
                value={HEX_PATTERN.test(hexTrimmed) ? hexTrimmed : "#000000"}
                onChange={handleColorPickerChange}
                onBlur={handleColorPickerBlur}
                aria-label={t("paint.pickHex")}
              />
              <input
                type="text"
                className={`${styles.hexInput} ${hexError ? styles.hexInputError : ""}`}
                value={customHex}
                placeholder="#RRGGBB"
                onChange={handleHexChange}
                onBlur={handleHexBlur}
                aria-invalid={hexError}
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("paint.attachChip")}</span>
            <label className={styles.chipUploadButton}>
              {uploadingChip ? "..." : t("paint.attachChip")}
              <input
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={(event) =>
                  void handleChipFileSelected(event.target.files)
                }
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export default PaintPicker;
