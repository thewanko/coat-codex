// components/overview/ExportActionBar.tsx — 出力アクションバー
// （技術計画v2.3 §3.3 ExportActionBar行・T28。結線T33: JSON・素MD隣接配置＋note MD）
//
// 印刷／PDFダウンロード／X共有／Bluesky共有はT36/T39/T40で結線するためdisabledのまま。
// JSONエクスポート・素のMarkdownエクスポート（要件どおり隣接配置）・note MDをT33で結線する。
// 並び順・グルーピング（菱区切り＋JSON+素MDの結合ピル）はデザイン仕様書§4「ActionBar」。
// 結線ロジックはuseExportActions（react-refresh対応で分離）に委譲する。
//
// v2.3改善（ユーザーフィードバック「下部Post系がダサい」対応）:
// モバイル(<768px)は下部固定の横並びバーを廃止し「出力・共有」ボタン1つに集約→
// タップでボトムシート（デザイン仕様書§4「Dialog / Modal」: モバイルはボトムシート化可、
// 上角のみradius）を開く。PC幅(≥768px)は従来のピル群のまま変更しない。

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { RecipeDoc } from "../../models/recipe";
import ExportPhotoChoiceDialog from "../common/ExportPhotoChoiceDialog";
import styles from "./ExportActionBar.module.css";
import { shouldCloseFromDrag } from "./exportSheetDrag";
import { useExportActions } from "./useExportActions";

const MOBILE_QUERY = "(max-width: 767px)";

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia(MOBILE_QUERY);
    const handleChange = () => setIsMobile(mql.matches);
    handleChange();

    if (mql.addEventListener) {
      mql.addEventListener("change", handleChange);
      return () => mql.removeEventListener("change", handleChange);
    }
    // 旧Safari互換
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  return isMobile;
}

interface ExportActionsProps {
  recipe: RecipeDoc | null;
}

function ExportActions({ recipe }: ExportActionsProps) {
  const { t } = useTranslation();
  const {
    handleRequestJsonExport,
    exportChoiceOpen,
    handleChooseJsonExport,
    handleCancelJsonExport,
    handlePlainMdExport,
    handleNoteMdExport,
  } = useExportActions(recipe);

  return (
    <>
      <button type="button" className={styles.pill} disabled>
        {t("overview.exportPrint")}
      </button>
      <button type="button" className={styles.pill} disabled>
        {t("overview.exportPdf")}
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <button type="button" className={styles.pill} disabled>
        {t("overview.exportX")}
      </button>
      <button type="button" className={styles.pill} disabled>
        {t("overview.exportBluesky")}
      </button>
      <button
        type="button"
        className={styles.pill}
        disabled={recipe === null}
        onClick={handleNoteMdExport}
      >
        {t("overview.exportNoteMd")}
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <span className={styles.combinedPill}>
        <button
          type="button"
          className={styles.combinedButton}
          disabled={recipe === null}
          onClick={handleRequestJsonExport}
        >
          {t("overview.exportJson")}
        </button>
        <span className={styles.combinedSeparator} aria-hidden="true" />
        <button
          type="button"
          className={styles.combinedButton}
          disabled={recipe === null}
          onClick={handlePlainMdExport}
        >
          {t("overview.exportPlainMd")}
        </button>
      </span>

      <ExportPhotoChoiceDialog
        open={exportChoiceOpen}
        onChoose={handleChooseJsonExport}
        onCancel={handleCancelJsonExport}
      />
    </>
  );
}

interface ExportSheetActionsProps {
  recipe: RecipeDoc | null;
}

function ExportSheetActions({ recipe }: ExportSheetActionsProps) {
  const { t } = useTranslation();
  const {
    handleRequestJsonExport,
    exportChoiceOpen,
    handleChooseJsonExport,
    handleCancelJsonExport,
    handlePlainMdExport,
    handleNoteMdExport,
  } = useExportActions(recipe);

  return (
    <>
      <div className={styles.sheetGroup}>
        <button type="button" className={styles.sheetButton} disabled>
          {t("overview.exportPrint")}
        </button>
        <button type="button" className={styles.sheetButton} disabled>
          {t("overview.exportPdf")}
        </button>
      </div>

      <span className={styles.sheetDividerRow} aria-hidden="true">
        <span className={styles.sheetDividerLine} />
        <span className={styles.sheetDividerDiamond} />
        <span className={styles.sheetDividerLine} />
      </span>

      <div className={styles.sheetGroup}>
        <button type="button" className={styles.sheetButton} disabled>
          {t("overview.exportX")}
        </button>
        <button type="button" className={styles.sheetButton} disabled>
          {t("overview.exportBluesky")}
        </button>
      </div>

      <span className={styles.sheetDividerRow} aria-hidden="true">
        <span className={styles.sheetDividerLine} />
        <span className={styles.sheetDividerDiamond} />
        <span className={styles.sheetDividerLine} />
      </span>

      <div className={styles.sheetGroup}>
        <button
          type="button"
          className={styles.sheetButton}
          disabled={recipe === null}
          onClick={handleNoteMdExport}
        >
          {t("overview.exportNoteMd")}
        </button>
      </div>

      <span className={styles.sheetDividerRow} aria-hidden="true">
        <span className={styles.sheetDividerLine} />
        <span className={styles.sheetDividerDiamond} />
        <span className={styles.sheetDividerLine} />
      </span>

      {/* JSON・素MDは要件どおり隣接配置（結合ピルで視覚化。デザイン仕様書§4「ActionBar」） */}
      <div className={`${styles.sheetGroup} ${styles.sheetCombinedGroup}`}>
        <button
          type="button"
          className={styles.sheetButton}
          disabled={recipe === null}
          onClick={handleRequestJsonExport}
        >
          {t("overview.exportJson")}
        </button>
        <button
          type="button"
          className={styles.sheetButton}
          disabled={recipe === null}
          onClick={handlePlainMdExport}
        >
          {t("overview.exportPlainMd")}
        </button>
      </div>

      <ExportPhotoChoiceDialog
        open={exportChoiceOpen}
        onChoose={handleChooseJsonExport}
        onCancel={handleCancelJsonExport}
      />
    </>
  );
}

interface ExportSheetProps {
  open: boolean;
  onClose: () => void;
  recipe: RecipeDoc | null;
}

function ExportSheet({ open, onClose, recipe }: ExportSheetProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // ドラッグ状態（再レンダー不要なのでrefで保持。dyのみ描画用にstate化）
  const dragStateRef = useRef<{ pointerId: number; startY: number } | null>(
    null,
  );
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // シートが開き直すたびにドラッグ状態をリセット
  useEffect(() => {
    if (!open) {
      dragStateRef.current = null;
      setDragY(0);
      setIsDragging(false);
    }
  }, [open]);

  function handleDragPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleDragPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const dy = Math.max(0, event.clientY - dragState.startY);
    setDragY(dy);
  }

  function handleDragPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const dy = Math.max(0, event.clientY - dragState.startY);
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? 0;

    dragStateRef.current = null;
    setIsDragging(false);

    if (shouldCloseFromDrag(dy, sheetHeight)) {
      setDragY(0);
      onClose();
      return;
    }
    // しきい値未満はスナップバック
    setDragY(0);
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.sheetBackdrop}
      onClick={onClose}
      data-testid="export-sheet-backdrop"
    >
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-sheet-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? "none" : undefined,
        }}
      >
        <div
          className={styles.sheetDragZone}
          data-testid="export-sheet-drag-zone"
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
          onPointerCancel={handleDragPointerUp}
        >
          <span className={styles.sheetHandle} aria-hidden="true" />
          <div className={styles.sheetHeader}>
            <h2 id="export-sheet-title" className={styles.sheetTitle}>
              {t("export.menuButton")}
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.sheetClose}
              onClick={onClose}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={t("editor.closePanel")}
            >
              ✕
            </button>
          </div>
        </div>
        <div className={styles.sheetBody}>
          <ExportSheetActions recipe={recipe} />
        </div>
      </div>
    </div>
  );
}

interface ExportActionBarProps {
  /** JSONエクスポート・素MD・note MDの元になる編集中レシピ。未ロード時はnull（全ボタン無効） */
  recipe?: RecipeDoc | null;
}

function ExportActionBar({ recipe = null }: ExportActionBarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isMobile) {
    return (
      <div className={styles.mobileRoot} data-testid="export-action-bar">
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => setSheetOpen(true)}
        >
          {t("export.menuButton")}
        </button>
        <ExportSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          recipe={recipe}
        />
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="export-action-bar">
      <ExportActions recipe={recipe} />
    </div>
  );
}

export default ExportActionBar;
