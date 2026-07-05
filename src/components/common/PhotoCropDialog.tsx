// components/common/PhotoCropDialog.tsx — 非破壊クロップUI（実装計画B-2）
//
// 元写真は変更せず、クロップ矩形（0〜1正規化。models/recipe.ts CropRect）のみを
// 親へ返す制御された表示部品。永続化（doc.photoCropsへの反映）は親の責務。
//
// 矩形操作: ドラッグで移動・四隅ハンドルでリサイズ（Pointer Events + setPointerCapture。
// touch-action: noneでタッチ操作にも対応）。矢印キーでの移動（a11y最低線。ハンドルは
// ポインタ専用でよい仕様のためキーボードリサイズは提供しない）。
//
// 意匠はConfirmDialog/ImportErrorDialogに合わせる（backdrop --color-bg-backdrop、
// 本体 --color-bg / radius 10px / --shadow-3）。OverviewPhotoDialog（z-index 300）の
// 内側から開かれ得るため、それより前面のz-index 400とする。

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "./useFocusTrap";
import { resolvePhotoUrl } from "../../db/photoStore";
import type { CropRect } from "../../models/recipe";
import type { ResizeHandle } from "../../lib/cropGeometry";
import {
  ARROW_STEP,
  ARROW_STEP_LARGE,
  MIN_CROP_SIZE,
  moveCropRect,
  resizeCropRect,
  roundCropRect,
} from "../../lib/cropGeometry";
import styles from "./PhotoCropDialog.module.css";

interface PhotoCropDialogProps {
  open: boolean;
  photoId: string;
  initialCrop: CropRect | null;
  onSave: (crop: CropRect | null) => void;
  onClose: () => void;
}

const FULL_RECT: CropRect = { x: 0, y: 0, w: 1, h: 1 };

type DragState =
  | { kind: "move"; startX: number; startY: number; startRect: CropRect }
  | {
      kind: "resize";
      handle: ResizeHandle;
      startX: number;
      startY: number;
      startRect: CropRect;
    };

const HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

/**
 * ハンドルaria-labelキーの静的マップ。i18nキー到達可能性検査（i18n.test.ts）は
 * テンプレートリテラルキーを動的キーとして除外するため、`photoCrop.handle.${handle}`ではなく
 * この静的マップ経由でt()へ渡し、4キーとも静的抽出の対象にする。
 */
const HANDLE_LABEL_KEYS: Record<ResizeHandle, string> = {
  nw: "photoCrop.handle.nw",
  ne: "photoCrop.handle.ne",
  sw: "photoCrop.handle.sw",
  se: "photoCrop.handle.se",
};

function PhotoCropDialog({
  open,
  photoId,
  initialCrop,
  onSave,
  onClose,
}: PhotoCropDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [rect, setRect] = useState<CropRect>(initialCrop ?? FULL_RECT);

  useFocusTrap({
    containerRef: dialogRef,
    open,
    onClose,
    initialFocusRef: applyButtonRef,
  });

  // openになるたび（photoId/initialCrop変化を含む）初期矩形へリセットする
  useEffect(() => {
    if (open) {
      setRect(initialCrop ?? FULL_RECT);
    }
  }, [open, photoId, initialCrop]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void resolvePhotoUrl(photoId).then((resolved) => {
      if (!cancelled) {
        setUrl(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, photoId]);

  if (!open) {
    return null;
  }

  function getFrameDelta(clientX: number, clientY: number) {
    const frame = frameRef.current;
    if (!frame) {
      return { dx: 0, dy: 0 };
    }
    const rectBox = frame.getBoundingClientRect();
    return {
      dx: rectBox.width === 0 ? 0 : (clientX - rectBox.left) / rectBox.width,
      dy: rectBox.height === 0 ? 0 : (clientY - rectBox.top) / rectBox.height,
    };
  }

  function handleMoveStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = getFrameDelta(event.clientX, event.clientY);
    dragRef.current = {
      kind: "move",
      startX: origin.dx,
      startY: origin.dy,
      startRect: rect,
    };
  }

  function handleResizeStart(
    handle: ResizeHandle,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = getFrameDelta(event.clientX, event.clientY);
    dragRef.current = {
      kind: "resize",
      handle,
      startX: origin.dx,
      startY: origin.dy,
      startRect: rect,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const current = getFrameDelta(event.clientX, event.clientY);
    const dx = current.dx - drag.startX;
    const dy = current.dy - drag.startY;

    if (drag.kind === "move") {
      setRect(moveCropRect(drag.startRect, dx, dy));
    } else {
      setRect(
        resizeCropRect(drag.startRect, drag.handle, dx, dy, MIN_CROP_SIZE),
      );
    }
  }

  function handlePointerEnd() {
    dragRef.current = null;
  }

  function handleArrowKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? ARROW_STEP_LARGE : ARROW_STEP;
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case "ArrowLeft":
        dx = -step;
        break;
      case "ArrowRight":
        dx = step;
        break;
      case "ArrowUp":
        dy = -step;
        break;
      case "ArrowDown":
        dy = step;
        break;
      default:
        return;
    }
    event.preventDefault();
    setRect((prev) => moveCropRect(prev, dx, dy));
  }

  function handleApply() {
    onSave(roundCropRect(rect));
  }

  function handleReset() {
    onSave(null);
  }

  const rectStyle = {
    left: `${(rect.x * 100).toString()}%`,
    top: `${(rect.y * 100).toString()}%`,
    width: `${(rect.w * 100).toString()}%`,
    height: `${(rect.h * 100).toString()}%`,
  };

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      data-testid="photo-crop-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-crop-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="photo-crop-dialog-title" className={styles.title}>
          {t("photoCrop.title")}
        </h2>

        <div ref={frameRef} className={styles.frame}>
          {url ? (
            <img
              className={styles.image}
              src={url}
              alt={t("photoCrop.imageAlt")}
            />
          ) : (
            <span className={styles.placeholder} aria-hidden="true" />
          )}
          <div
            className={styles.cropRect}
            style={rectStyle}
            tabIndex={0}
            role="group"
            aria-label={t("photoCrop.rectLabel")}
            onPointerDown={handleMoveStart}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onKeyDown={handleArrowKey}
          >
            {HANDLES.map((handle) => (
              <div
                key={handle}
                className={`${styles.handle} ${styles[`handle-${handle}`]}`}
                aria-label={t(HANDLE_LABEL_KEYS[handle])}
                onPointerDown={(event) => handleResizeStart(handle, event)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
              />
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.reset} onClick={handleReset}>
            {t("photoCrop.reset")}
          </button>
          <button type="button" className={styles.cancel} onClick={onClose}>
            {t("photoCrop.cancel")}
          </button>
          <button
            ref={applyButtonRef}
            type="button"
            className={styles.apply}
            onClick={handleApply}
          >
            {t("photoCrop.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PhotoCropDialog;
