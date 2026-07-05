// components/part-editor/StepPhotoTile.tsx — 工程写真1枚タイル（技術計画v2.2 §4.2 T25）
//
// デザイン決定稿§8-A「step-photo(工程写真)」: 84px（mobile76pxはCSS側で対応）タイル1枚。
// filled = `STEP n` タグ＋✕ボタンで解除／empty = 破線＋「＋ 写真 1枚」。
// 空→ファイル選択→savePhoto（内部でT13 normalizePhoto経由の§2.6 4段規則）→onChange(photoId)。
// あり→resolvePhotoUrlでサムネ表示。✕はPhotoUploaderと同じ流儀（ConfirmDialog確認→
// photoStore.deletePhotoでBlobも削除）。工程写真はStep 1件のみが参照する1:1関係で、他の
// palette/overviewPhotoIdsのような共有参照が存在しないため、解除時点でBlobを参照する場所は
// 文書内から消える。§2.6の「発生源を2層で潰す」方針（インポート/エクスポート時のdangling除去）
// を補完する形で、通常操作時点でもBlobを孤児化させずdeletePhotoで即時削除するのが正しい。
// 読込中・アップロード中はSkeleton(photo)。StorageQuotaError/UnsupportedImageFormatErrorは
// useToastのerrorでmessageKeyを表示（PhotoUploaderのエラーハンドリング流儀を踏襲）。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { savePhoto, resolvePhotoUrl, deletePhoto } from "../../db/photoStore";
import { useToast } from "../common/toastContext";
import ConfirmDialog from "../common/ConfirmDialog";
import PhotoCropDialog from "../common/PhotoCropDialog";
import Skeleton from "../common/Skeleton";
import type { CropRect } from "../../models/recipe";
import styles from "./StepPhotoTile.module.css";

interface StepPhotoTileProps {
  photoId: string | null;
  stepIndex: number;
  recipeId: string;
  onChange: (photoId: string | null) => void;
  /** 指定時のみクロップ導線（トリミングアクション・アップロード完了直後の自動オープン）を有効化する */
  crop?: CropRect | null;
  onCropChange?: (crop: CropRect | null) => void;
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

function StepPhotoTile({
  photoId,
  stepIndex,
  recipeId,
  onChange,
  crop,
  onCropChange,
}: StepPhotoTileProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);

  const cropEnabled = onCropChange !== undefined;

  useEffect(() => {
    if (!photoId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void resolvePhotoUrl(photoId)
      .then((resolved) => {
        if (!cancelled) {
          setUrl(resolved);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  function handleAddClick() {
    inputRef.current?.click();
  }

  async function handleFileSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }

    setUploading(true);
    try {
      const id = await savePhoto(file, recipeId);
      onChange(id);
      // 工程写真は常に単発アップロードのため、完了直後に自動でクロップダイアログを開く
      if (cropEnabled) {
        setCropDialogOpen(true);
      }
    } catch (err) {
      if (hasMessageKey(err)) {
        toast.error(t(err.messageKey));
      } else {
        throw err;
      }
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function requestDelete() {
    setPendingDelete(true);
  }

  function requestCrop() {
    setCropDialogOpen(true);
  }

  function handleCropSave(next: CropRect | null) {
    onCropChange?.(next);
    setCropDialogOpen(false);
  }

  function closeCropDialog() {
    setCropDialogOpen(false);
  }

  async function confirmDelete() {
    setPendingDelete(false);
    if (!photoId) {
      return;
    }
    await deletePhoto(photoId);
    onChange(null);
  }

  function cancelDelete() {
    setPendingDelete(false);
  }

  const stepTag = t("photo.stepTag", { n: stepIndex + 1 });

  if (uploading || loading) {
    return (
      <div className={styles.root}>
        <Skeleton variant="photo" aria-label={t("photo.uploading")} />
      </div>
    );
  }

  if (!photoId) {
    return (
      <div className={styles.root}>
        <button
          type="button"
          className={styles.emptyTile}
          onClick={handleAddClick}
        >
          {t("photo.stepAdd")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          onChange={(event) => void handleFileSelected(event.target.files)}
        />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.thumb}>
        <span className={styles.stepTag}>{stepTag}</span>
        {url ? (
          <img className={styles.thumbImg} src={url} alt="" />
        ) : (
          <span className={styles.thumbPlaceholder} aria-hidden="true" />
        )}
        <button
          type="button"
          className={styles.removeButton}
          aria-label={t("photo.delete")}
          onClick={requestDelete}
        >
          ✕
        </button>
      </div>

      {cropEnabled && (
        <button
          type="button"
          className={styles.trimButton}
          onClick={requestCrop}
        >
          {t("photo.trim")}
        </button>
      )}

      <ConfirmDialog
        open={pendingDelete}
        title={t("photo.delete")}
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />

      {cropEnabled && photoId && (
        <PhotoCropDialog
          open={cropDialogOpen}
          photoId={photoId}
          initialCrop={crop ?? null}
          onSave={handleCropSave}
          onClose={closeCropDialog}
        />
      )}
    </div>
  );
}

export default StepPhotoTile;
