// components/overview/ExportActionBar.tsx — 出力アクションバー（枠のみ）
// （技術計画v2.3 §3.3 ExportActionBar行・T28。結線はT33/T40）
//
// 印刷／PDFダウンロード／X共有／Bluesky共有／note.com向けMD／JSONエクスポート・
// 素のMarkdownエクスポート（要件どおり隣接配置）を配置のみ行う。全ボタンdisabled。
// 並び順・グルーピング（菱区切り＋JSON+素MDの結合ピル）はデザイン仕様書§4「ActionBar」。
//
// v2.3改善（ユーザーフィードバック「下部Post系がダサい」対応）:
// モバイル(<768px)は下部固定の横並びバーを廃止し「出力・共有」ボタン1つに集約→
// タップでボトムシート（デザイン仕様書§4「Dialog / Modal」: モバイルはボトムシート化可、
// 上角のみradius）を開く。PC幅(≥768px)は従来のピル群のまま変更しない。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./ExportActionBar.module.css";

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

function ExportActions() {
  const { t } = useTranslation();

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
      <button type="button" className={styles.pill} disabled>
        {t("overview.exportNoteMd")}
      </button>

      <span className={styles.divider} aria-hidden="true" />

      <span className={styles.combinedPill}>
        <button type="button" className={styles.combinedButton} disabled>
          {t("overview.exportJson")}
        </button>
        <span className={styles.combinedSeparator} aria-hidden="true" />
        <button type="button" className={styles.combinedButton} disabled>
          {t("overview.exportPlainMd")}
        </button>
      </span>
    </>
  );
}

function ExportSheetActions() {
  const { t } = useTranslation();

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
        <button type="button" className={styles.sheetButton} disabled>
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
        <button type="button" className={styles.sheetButton} disabled>
          {t("overview.exportJson")}
        </button>
        <button type="button" className={styles.sheetButton} disabled>
          {t("overview.exportPlainMd")}
        </button>
      </div>
    </>
  );
}

interface ExportSheetProps {
  open: boolean;
  onClose: () => void;
}

function ExportSheet({ open, onClose }: ExportSheetProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-sheet-title"
        onClick={(event) => event.stopPropagation()}
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
            aria-label={t("editor.closePanel")}
          >
            ✕
          </button>
        </div>
        <div className={styles.sheetBody}>
          <ExportSheetActions />
        </div>
      </div>
    </div>
  );
}

function ExportActionBar() {
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
        <ExportSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="export-action-bar">
      <ExportActions />
    </div>
  );
}

export default ExportActionBar;
