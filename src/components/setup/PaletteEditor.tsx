// components/setup/PaletteEditor.tsx — 使用カラー先行登録（技術計画v2.2 §4.2 T23・D-7・§2.6）
//
// 各行: SwatchChip＋ブランドmono＋使用数バッジ＋削除✕
// （デザイン仕様書§4「PaletteEditor / ToolListEditor行」）。
// 使用数はlib/recipeRefs.ts countColorUsageで算出（§2.6の一次防衛線）。使用数>0の
// エントリは「N工程で使用中」バッジ＋削除ボタン無効化＋「↳ 工程で使用中のため削除
// できません…」を表示する。使用数0のエントリは「未使用」バッジ（faint枠）＋削除✕活性
// （=palette孤児エントリの整理UI。M4必須事項③）。
//
// 参照同一性（M4必須事項②）: 追加はスプレッド追加、削除はfilterのみを用い、
// 変更のないpalette要素オブジェクト自体は再生成しない（map全再生成は行わない）。
// PaintPicker再同期（value prop）が参照比較のため、この規律を崩すと編集中の下書きが
// 意図せず巻き戻る（M3レビュー申し送り）。

import { useTranslation } from "react-i18next";
import type { PaletteColor, RecipeDoc } from "../../models/recipe";
import { countColorUsage } from "../../lib/recipeRefs";
import PaintPicker from "../paint/PaintPicker";
import SwatchChip from "../common/SwatchChip";
import styles from "./EditorRow.module.css";
import sectionStyles from "./SetupSection.module.css";

interface PaletteEditorProps {
  recipeId: string;
  doc: RecipeDoc;
  onUpdate: (updater: (doc: RecipeDoc) => RecipeDoc) => void;
}

function PaletteEditor({ recipeId, doc, onUpdate }: PaletteEditorProps) {
  const { t } = useTranslation();

  function handleAddColor(color: PaletteColor) {
    onUpdate((current) => ({
      ...current,
      palette: [...current.palette, color],
    }));
  }

  function handleRemoveColor(colorId: string) {
    onUpdate((current) => ({
      ...current,
      palette: current.palette.filter((c) => c.id !== colorId),
    }));
  }

  return (
    <section className={sectionStyles.section}>
      <h2 className={sectionStyles.heading}>{t("setup.paletteLabel")}</h2>

      <ul className={styles.list}>
        {doc.palette.map((color) => {
          const usageCount = countColorUsage(doc, color.id);
          const inUse = usageCount > 0;
          return (
            <li key={color.id} className={styles.row}>
              <SwatchChip
                variant={
                  color.chipPhotoId ? "photo" : color.hex ? "hex" : "empty"
                }
                size="md"
                hex={color.hex ?? undefined}
                photoId={color.chipPhotoId ?? undefined}
                name={color.name}
                brand={color.brand ?? undefined}
              />
              {inUse ? (
                <span
                  className={styles.count}
                  data-testid="palette-usage-count"
                >
                  {t("setup.usedInSteps", { count: usageCount })}
                </span>
              ) : (
                <span
                  className={styles.unusedBadge}
                  data-testid="palette-usage-count"
                >
                  {t("setup.unused")}
                </span>
              )}
              <button
                type="button"
                className={styles.removeButton}
                aria-label={`${t("photo.delete")} ${color.name}`}
                disabled={inUse}
                onClick={() => handleRemoveColor(color.id)}
              >
                ✕
              </button>
              {inUse && (
                <p className={styles.inUseNote}>{t("setup.inUseNote")}</p>
              )}
            </li>
          );
        })}
      </ul>

      <div className={styles.addRow}>
        <span className={styles.addLabel}>{t("setup.addColor")}</span>
        <PaintPicker
          key={doc.palette.length}
          recipeId={recipeId}
          onCommit={handleAddColor}
        />
      </div>
    </section>
  );
}

export default PaletteEditor;
