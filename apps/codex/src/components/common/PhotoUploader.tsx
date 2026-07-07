// components/common/PhotoUploader.tsx — 複数枚写真アップローダ
// （デザイン仕様書§4「PhotoUploader / 写真」§8-A: 112pxタイル、先頭COVERタグ、
// 各タイル✕、末尾「＋ 追加」破線タイル。並び替え=代表変更。
// dnd-kit不使用（V-5）— 上下移動ボタン＋「先頭へ（代表にする）」ボタンのみ）
//
// <input type="file" accept="image/*" multiple> → T14 savePhoto（内部でT13正規化）→
// photoId配列をprops value/onChangeで親と同期。アップロード中はSkeleton(photo)＋photo.uploading。
// 削除は各タイル✕→ConfirmDialog確認→onChange（photosテーブルからの削除も実施）。
// StorageQuotaError/UnsupportedImageFormatErrorはuseToastのerrorでmessageKeyを表示。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { savePhoto, resolvePhotoUrl, deletePhoto } from "../../db/photoStore";
import { useToast } from "./toastContext";
import ConfirmDialog from "./ConfirmDialog";
import CroppedPhoto from "./CroppedPhoto";
import PhotoCropDialog from "./PhotoCropDialog";
import Skeleton from "./Skeleton";
import type { CropRect } from "@coat-codex/recipe-core";
import styles from "./PhotoUploader.module.css";

interface PhotoUploaderProps {
  recipeId: string;
  value: string[];
  onChange: (photoIds: string[]) => void;
  /** 指定時のみクロップ導線（トリミングアクション・単発アップロード後の自動オープン）を有効化する */
  crops?: Record<string, CropRect>;
  onCropChange?: (photoId: string, crop: CropRect | null) => void;
}

/** トリミングアクションのアイコン（定番crop形状: L字2本の重なり） */
export function CropIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 1v9a2 2 0 0 0 2 2h9M1 4h9a2 2 0 0 1 2 2v9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

function PhotoTile({
  photoId,
  isCover,
  crop,
}: {
  photoId: string;
  isCover: boolean;
  crop: CropRect | null;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolvePhotoUrl(photoId).then((resolved) => {
      if (!cancelled) {
        setUrl(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  return (
    <div className={styles.thumb}>
      {isCover && <span className={styles.coverTag}>{t("photo.cover")}</span>}
      {url ? (
        <CroppedPhoto
          className={styles.thumbImg}
          src={url}
          crop={crop}
          alt=""
        />
      ) : (
        <span className={styles.thumbPlaceholder} aria-hidden="true" />
      )}
    </div>
  );
}

function PhotoUploader({
  recipeId,
  value,
  onChange,
  crops,
  onCropChange,
}: PhotoUploaderProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);

  const cropEnabled = onCropChange !== undefined;

  function handleAddClick() {
    inputRef.current?.click();
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    setUploading(true);
    try {
      const newIds: string[] = [];
      for (const file of Array.from(files)) {
        try {
          const id = await savePhoto(file, recipeId);
          newIds.push(id);
        } catch (err) {
          if (hasMessageKey(err)) {
            toast.error(t(err.messageKey));
          } else {
            throw err;
          }
        }
      }
      if (newIds.length > 0) {
        onChange([...value, ...newIds]);
        // 単発アップロード完了直後のみ自動でクロップダイアログを開く（複数一括時は開かない）。
        // 既にダイアログ表示中（cropTargetId !== null）の場合は差し替えない
        // （連続アップロードで表示中の対象photoIdが黙って切り替わる事故を防ぐ）
        if (cropEnabled && newIds.length === 1 && cropTargetId === null) {
          setCropTargetId(newIds[0]);
        }
      }
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function requestCrop(photoId: string) {
    setCropTargetId(photoId);
  }

  function handleCropSave(crop: CropRect | null) {
    if (cropTargetId && onCropChange) {
      onCropChange(cropTargetId, crop);
    }
    setCropTargetId(null);
  }

  function closeCropDialog() {
    setCropTargetId(null);
  }

  function moveUp(index: number) {
    if (index <= 0) {
      return;
    }
    const next = [...value];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function moveDown(index: number) {
    if (index >= value.length - 1) {
      return;
    }
    const next = [...value];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  function makeCover(index: number) {
    if (index <= 0) {
      return;
    }
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    onChange(next);
  }

  function requestDelete(photoId: string) {
    setPendingDeleteId(photoId);
  }

  async function confirmDelete() {
    const photoId = pendingDeleteId;
    setPendingDeleteId(null);
    if (!photoId) {
      return;
    }
    await deletePhoto(photoId);
    onChange(value.filter((id) => id !== photoId));
  }

  function cancelDelete() {
    setPendingDeleteId(null);
  }

  return (
    <div className={styles.root}>
      <div className={styles.grid}>
        {value.map((photoId, index) => (
          <div key={photoId} className={styles.tileWrapper}>
            <PhotoTile
              photoId={photoId}
              isCover={index === 0}
              crop={crops?.[photoId] ?? null}
            />
            <button
              type="button"
              className={styles.removeButton}
              aria-label={t("photo.delete")}
              onClick={() => requestDelete(photoId)}
            >
              ✕
            </button>
            <div className={styles.tileControls}>
              <button
                type="button"
                className={styles.controlButton}
                aria-label={t("photo.moveUp")}
                disabled={index === 0}
                onClick={() => moveUp(index)}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.controlButton}
                aria-label={t("photo.moveDown")}
                disabled={index === value.length - 1}
                onClick={() => moveDown(index)}
              >
                ↓
              </button>
              {index !== 0 && (
                <button
                  type="button"
                  className={styles.controlButtonWide}
                  onClick={() => makeCover(index)}
                >
                  {t("photo.makeCover")}
                </button>
              )}
            </div>
            {cropEnabled && (
              <button
                type="button"
                className={styles.trimButton}
                aria-label={t("photo.trim")}
                onClick={() => requestCrop(photoId)}
              >
                <CropIcon />
              </button>
            )}
          </div>
        ))}

        {uploading && (
          <div className={styles.tileWrapper}>
            <Skeleton variant="photo" aria-label={t("photo.uploading")} />
          </div>
        )}

        <button
          type="button"
          className={styles.addTile}
          onClick={handleAddClick}
        >
          {t("photo.add")}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className={styles.hiddenInput}
        onChange={(event) => void handleFilesSelected(event.target.files)}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t("photo.delete")}
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />

      {cropEnabled && cropTargetId && (
        <PhotoCropDialog
          open={cropTargetId !== null}
          photoId={cropTargetId}
          initialCrop={crops?.[cropTargetId] ?? null}
          onSave={handleCropSave}
          onClose={closeCropDialog}
        />
      )}
    </div>
  );
}

export default PhotoUploader;
