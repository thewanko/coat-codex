// components/home/RecipeCard.tsx — 折丁カード（デザイン仕様書§4「recipe（Home）」）
//
// 二重枠inset＋padding 9px、代表写真（overviewPhotoIds[0]）をresolvePhotoUrlで解決、
// タイトル中央・明朝、メタ=mono「更新・工程n」。未バックアップドットは表示スロットのみ
// 確保し、判定結線はT34（backedUpの実値供給）で行う（本タスクでは常にfalse/undefined）。
// メニュー（⋮）は「開く」「複製」「JSONエクスポート」「削除」（T33で複製・エクスポート結線）。
//
// JSONエクスポート: ExportPhotoChoiceDialogで写真あり/なしを選択→exportRecipeToBlobで
// Blob生成→downloadBlobでファイル保存→成功時にmeta.recipeExport:<recipeId>を更新（§3.5）。
// 複製: duplicateRecipe（reassignRecipeIds＋photos複製）で新しいレシピを作成し、
// 成功後onDuplicatedで親（RecipeCardGrid）に一覧再読み込みを依頼する。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolvePhotoUrl } from "../../db/photoStore";
import { recordRecipeExport } from "../../lib/storageHealth";
import { exportRecipeToBlob } from "../../lib/exporters/json";
import type { RecipeDoc } from "../../models/recipe";
import { useToast } from "../common/toastContext";
import { downloadBlob, sanitizeFilename } from "../common/downloadBlob";
import CroppedPhoto from "../common/CroppedPhoto";
import ExportPhotoChoiceDialog from "../common/ExportPhotoChoiceDialog";
import { duplicateRecipe } from "./duplicateRecipe";
import styles from "./RecipeCard.module.css";

interface RecipeCardProps {
  recipe: RecipeDoc;
  /** 未バックアップドットの表示要否（D-6: recipeExport:<id>が無い、またはupdatedAtより古い） */
  backedUp?: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** 複製成功時に親（RecipeCardGrid）へ通知し、一覧の再読み込みを促す */
  onDuplicated?: () => void;
  /** JSONエクスポート成功時に親（RecipeCardGrid）へ通知し、当該カードのドット再判定を促す（D-6） */
  onExported?: (recipeId: string) => void;
}

function countSteps(recipe: RecipeDoc): number {
  const partSteps = recipe.parts.reduce(
    (sum, part) => sum + part.steps.length,
    0,
  );
  return recipe.baseSteps.length + partSteps;
}

function RecipeCard({
  recipe,
  backedUp,
  onOpen,
  onDelete,
  onDuplicated,
  onExported,
}: RecipeCardProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const coverPhotoId = recipe.overviewPhotoIds[0];

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!coverPhotoId) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    void resolvePhotoUrl(coverPhotoId).then((url) => {
      if (!cancelled) {
        setPhotoUrl(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [coverPhotoId]);

  const updatedAtLabel = t("home.updatedAt", {
    date: new Date(recipe.updatedAt).toLocaleDateString(i18n.language),
  });
  const stepsLabel = t("home.stepsCount", { count: countSteps(recipe) });

  function handleOpen() {
    setMenuOpen(false);
    onOpen(recipe.id);
  }

  function handleDelete() {
    setMenuOpen(false);
    onDelete(recipe.id);
  }

  function handleRequestExport() {
    setMenuOpen(false);
    setExportChoiceOpen(true);
  }

  async function handleChooseExport(includePhotos: boolean) {
    setExportChoiceOpen(false);
    try {
      const blob = await exportRecipeToBlob(recipe.id, { includePhotos });
      downloadBlob(blob, `${sanitizeFilename(recipe.title)}.json`);
      // §3.5: エクスポート成功時にmeta.recipeExport:<recipeId>を更新
      await recordRecipeExport(recipe.id, new Date().toISOString());
      toast.success(t("export.jsonSuccess"));
      // D-6: 当該カードのドット再判定を親に促す
      onExported?.(recipe.id);
    } catch {
      toast.error(t("export.jsonFailed"));
    }
  }

  async function handleDuplicate() {
    setMenuOpen(false);
    try {
      const duplicated = await duplicateRecipe(recipe);
      toast.success(t("home.duplicateSuccess", { title: duplicated.title }));
      onDuplicated?.();
    } catch {
      toast.error(t("home.duplicateFailed"));
    }
  }

  return (
    <div className={styles.card} data-testid="recipe-card">
      <div className={styles.menuWrapper} ref={menuRef}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={t("home.cardMenu")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ⋮
        </button>
        {menuOpen && (
          <div className={styles.menu} role="menu">
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleOpen}
            >
              {t("home.open")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => void handleDuplicate()}
            >
              {t("home.duplicate")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleRequestExport}
            >
              {t("home.exportJson")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={handleDelete}
            >
              {t("home.delete")}
            </button>
          </div>
        )}
      </div>

      <button type="button" className={styles.thumbButton} onClick={handleOpen}>
        {photoUrl ? (
          <CroppedPhoto
            className={styles.thumb}
            src={photoUrl}
            crop={
              coverPhotoId ? (recipe.photoCrops[coverPhotoId] ?? null) : null
            }
            alt=""
          />
        ) : (
          <span className={styles.thumbPlaceholder} aria-hidden="true" />
        )}
      </button>

      <div className={styles.body}>
        <span
          className={styles.backupDot}
          data-visible={backedUp === false}
          aria-hidden="true"
        />
        <h3 className={styles.title}>{recipe.title}</h3>
      </div>
      <p className={styles.meta}>
        {updatedAtLabel} ・ {stepsLabel}
      </p>

      <ExportPhotoChoiceDialog
        open={exportChoiceOpen}
        onChoose={(includePhotos) => void handleChooseExport(includePhotos)}
        onCancel={() => setExportChoiceOpen(false)}
      />
    </div>
  );
}

export default RecipeCard;
