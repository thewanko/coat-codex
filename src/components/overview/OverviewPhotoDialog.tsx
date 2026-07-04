// components/overview/OverviewPhotoDialog.tsx — 全体写真の後日変更ダイアログ
// （技術計画v2.2 §3.2・§3.3 FB-C 2026-07-04）
//
// Overview画面から「全体写真を変更/追加」ボタンで開き、既存PhotoUploader
// （T18・setup/OverviewPhotoUploaderが薄いラッパーとして使用中と同じコンポーネント）を
// そのまま再利用してdoc.overviewPhotoIdsを編集する。反映はonChange経由で親
// （RecipeOverviewPage）がuseRecipeStoreのupdateRecipe（autosave debounce 500ms）を
// 呼ぶ。保存ボタンは持たない（autosaveで反映済み・閉じるボタンのみ）。
//
// 意匠・構造はMarkdownCopyFallbackDialog.tsx/ConfirmDialog.tsxに倣い、共通の
// useFocusTrapを適用する。backdropのz-indexは300（MarkdownCopyFallbackDialog.module.css
// のコメント参照: モバイルのExportSheet(200)より前面に出す必要があるため）。
//
// マウント形態: 呼び出し元（RecipeOverviewPage）で`{open && <OverviewPhotoDialog />}`の
// 条件付きマウントを想定する（lessons 2026-07-04: useFocusTrap適用先のマウント形態代表性）。

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../common/useFocusTrap";
import PhotoUploader from "../common/PhotoUploader";
import styles from "./OverviewPhotoDialog.module.css";

interface OverviewPhotoDialogProps {
  open: boolean;
  recipeId: string;
  value: string[];
  onChange: (photoIds: string[]) => void;
  onClose: () => void;
}

function OverviewPhotoDialog({
  open,
  recipeId,
  value,
  onChange,
  onClose,
}: OverviewPhotoDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useFocusTrap({
    containerRef: dialogRef,
    open,
    onClose,
    // 初期フォーカスは閉じるボタン（ConfirmDialog等の既存ダイアログと同方針。
    // 先頭のPhotoUploader内file inputへ落とすより誤操作が少ない）
    initialFocusRef: closeButtonRef,
  });

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      data-testid="overview-photo-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="overview-photo-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="overview-photo-dialog-title" className={styles.title}>
          {t("overview.photoDialogTitle")}
        </h2>
        <PhotoUploader recipeId={recipeId} value={value} onChange={onChange} />
        <div className={styles.actions}>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.close}
            onClick={onClose}
          >
            {t("overview.photoDialogClose")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OverviewPhotoDialog;
