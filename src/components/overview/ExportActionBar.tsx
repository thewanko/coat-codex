// components/overview/ExportActionBar.tsx — 出力アクションバー
// （技術計画v2.3 §3.3 ExportActionBar行・T28。結線T33: JSON・素MD隣接配置＋note MD。
//   結線T40: 印刷（/recipe/:id/printへnavigate）／X・Bluesky（ShareDialog whole起点）。
//
// JSONエクスポート・素のMarkdownエクスポート（要件どおり隣接配置）・note MDをT33で結線する。
// 印刷は/recipe/:id/printへnavigate（保存手順案内はPrintToolbar側=T36仕様。PDFボタンは
// 印刷と挙動が同一だったため2026-07-03ユーザー決定で削除・「印刷」に統合）。
// X・BlueskyはShareDialog（context={mode:"whole", recipe}）を対応するtargetで開く（T40）。
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
import MarkdownCopyFallbackDialog from "../common/MarkdownCopyFallbackDialog";
import ShareDialog from "./ShareDialog";
import styles from "./ExportActionBar.module.css";
import { shouldCloseFromDrag } from "./exportSheetDrag";
import {
  useExportActions,
  type UseExportActionsResult,
} from "./useExportActions";

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
  onExported?: (recipeId: string) => void;
}

function ExportActions({ recipe, onExported }: ExportActionsProps) {
  const { t } = useTranslation();
  const {
    handleRequestJsonExport,
    exportChoiceOpen,
    handleChooseJsonExport,
    handleCancelJsonExport,
    handlePlainMdExport,
    handleNoteMdExport,
    noteMdCopied,
    noteMdFallbackOpen,
    noteMdFallbackMarkdown,
    handleCloseNoteMdFallback,
    handlePrint,
    handleShareX,
    handleShareBluesky,
    shareDialogOpen,
    shareDialogContext,
    shareDialogTarget,
    handleCloseShareDialog,
  } = useExportActions(recipe, onExported);

  return (
    <>
      <button
        type="button"
        className={styles.pill}
        disabled={recipe === null}
        onClick={handlePrint}
      >
        {t("overview.exportPrint")}
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <button
        type="button"
        className={styles.pill}
        disabled={recipe === null}
        onClick={handleShareX}
      >
        {t("overview.exportX")}
      </button>
      <button
        type="button"
        className={styles.pill}
        disabled={recipe === null}
        onClick={handleShareBluesky}
      >
        {t("overview.exportBluesky")}
      </button>
      <button
        type="button"
        className={styles.pill}
        disabled={recipe === null}
        onClick={handleNoteMdExport}
      >
        {noteMdCopied
          ? t("export.noteMdCopiedLabel")
          : t("overview.exportNoteMd")}
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

      {noteMdFallbackOpen && noteMdFallbackMarkdown !== null && (
        <MarkdownCopyFallbackDialog
          open={noteMdFallbackOpen}
          markdown={noteMdFallbackMarkdown}
          onClose={handleCloseNoteMdFallback}
        />
      )}

      {shareDialogOpen &&
        shareDialogContext !== null &&
        shareDialogTarget !== null && (
          <ShareDialog
            open={shareDialogOpen}
            onClose={handleCloseShareDialog}
            context={shareDialogContext}
            target={shareDialogTarget}
          />
        )}
    </>
  );
}

interface ExportSheetActionsProps {
  recipe: RecipeDoc | null;
  actions: UseExportActionsResult;
}

// ShareDialog・note MDフォールバックダイアログ関連の状態・ダイアログ本体はここではレンダー
// しない（ExportActionBarのmobile分岐側でExportSheetと兄弟としてリフトアップ済み。
// レビューRound1 Medium-1対応: .sheetはtransition: transform／ドラッグ中のstyle.transform／
// 開閉アニメーションを持ち、transformが非noneの間は子孫のposition: fixed要素の基準がbodyでなく
// .sheetになってしまうため、ShareDialog・MarkdownCopyFallbackDialog（いずれもbackdrop=
// position: fixed）を.sheetの子孫に置かない）。
function ExportSheetActions({ recipe, actions }: ExportSheetActionsProps) {
  const { t } = useTranslation();
  const {
    handleRequestJsonExport,
    exportChoiceOpen,
    handleChooseJsonExport,
    handleCancelJsonExport,
    handlePlainMdExport,
    handleNoteMdExport,
    noteMdCopied,
    handlePrint,
    handleShareX,
    handleShareBluesky,
  } = actions;

  return (
    <>
      <div className={styles.sheetGroup}>
        <button
          type="button"
          className={styles.sheetButton}
          disabled={recipe === null}
          onClick={handlePrint}
        >
          {t("overview.exportPrint")}
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
          onClick={handleShareX}
        >
          {t("overview.exportX")}
        </button>
        <button
          type="button"
          className={styles.sheetButton}
          disabled={recipe === null}
          onClick={handleShareBluesky}
        >
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
          {noteMdCopied
            ? t("export.noteMdCopiedLabel")
            : t("overview.exportNoteMd")}
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
  actions: UseExportActionsResult;
}

function ExportSheet({ open, onClose, recipe, actions }: ExportSheetProps) {
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
          <ExportSheetActions recipe={recipe} actions={actions} />
        </div>
      </div>
    </div>
  );
}

interface MobileExportRootProps {
  recipe: RecipeDoc | null;
  onExported?: (recipeId: string) => void;
}

// レビューRound1 Medium-1対応: mobile専用ルート。useExportActionsをここで1回だけ呼び、
// ShareDialogをExportSheetの外（兄弟）でレンダーする。ExportSheetは`open`がfalseのとき
// nullを返す（アンマウントされる）ため、ExportSheet配下でこのフックを呼ぶとシートを
// 閉じた瞬間にShareDialogの状態も失われてしまう。ここに置くことで、ユーザーが
// ShareDialogを開いたままシートを閉じてもShareDialogは独立して開いたまま残る
// （意図した挙動。ExportActionBar.test.tsxで固定）。
function MobileExportRoot({ recipe, onExported }: MobileExportRootProps) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const actions = useExportActions(recipe, onExported);

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
        actions={actions}
      />
      {actions.shareDialogOpen &&
        actions.shareDialogContext !== null &&
        actions.shareDialogTarget !== null && (
          <div className={styles.overlayRoot}>
            <ShareDialog
              open={actions.shareDialogOpen}
              onClose={actions.handleCloseShareDialog}
              context={actions.shareDialogContext}
              target={actions.shareDialogTarget}
            />
          </div>
        )}
      {actions.noteMdFallbackOpen &&
        actions.noteMdFallbackMarkdown !== null && (
          <div className={styles.overlayRoot}>
            <MarkdownCopyFallbackDialog
              open={actions.noteMdFallbackOpen}
              markdown={actions.noteMdFallbackMarkdown}
              onClose={actions.handleCloseNoteMdFallback}
            />
          </div>
        )}
    </div>
  );
}

interface ExportActionBarProps {
  /** JSONエクスポート・素MD・note MDの元になる編集中レシピ。未ロード時はnull（全ボタン無効） */
  recipe?: RecipeDoc | null;
  /** JSONエクスポート成功時に呼び出し側へ通知（D-6: 未バックアップドット・リマインダー帯の再判定用） */
  onExported?: (recipeId: string) => void;
}

function ExportActionBar({ recipe = null, onExported }: ExportActionBarProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileExportRoot recipe={recipe} onExported={onExported} />;
  }

  return (
    <div className={styles.root} data-testid="export-action-bar">
      <ExportActions recipe={recipe} onExported={onExported} />
    </div>
  );
}

export default ExportActionBar;
