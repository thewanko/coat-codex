// components/overview/useExportActions.ts — ExportActionBarのJSON/素MD/note MD/
// 印刷/X/Bluesky結線ロジック（技術計画v2.3 §3.3 ExportActionBar行・§3.4・§3.5・T33・T40）
//
// PC版（ExportActions）・mobile版（ExportSheetActions）の両方から共用するフック。
// react-refresh/only-export-components対応のためコンポーネントファイルから分離する
// （exportSheetDrag.tsと同じ方針）。
//
// JSON: ExportPhotoChoiceDialogで写真あり/なし選択→exportRecipeToBlob→downloadBlob→
//       成功時にmeta.recipeExport:<recipeId>を更新（§3.5）。
// 素MD: exportRecipeToMarkdown（buildMarkdownLabelsでi18n注入）を直接downloadBlobで
//       .mdファイルとしてDLする（2026-07-04 FB-F: iPhone実機で「クリップボードコピーが
//       動作していないように見える」フィードバックを受け、クリップボード経路を廃止）。
// note MD: exportRecipeToNoteMarkdown（buildNoteMarkdownLabelsでi18n注入）を
//       navigator.clipboard.writeTextでコピーする一本化（DLフォールバックは廃止。2026-07-04
//       FB-E）。成功時はnoteMdCopied状態を約2秒立てフィードバック用に返す。非対応・失敗時は
//       fallbackMarkdown/fallbackDialogOpenを立て、呼び出し側が手動コピー用ダイアログを開く。
// 印刷: /recipe/:id/printへnavigate（保存手順の案内はPrintViewPage側のPrintToolbarが担う。
//       T36仕様。PDFボタンは印刷と挙動が同一だったため2026-07-03ユーザー決定で削除）。
// SNS共有: ShareDialogをmode="whole"で開く（T40・§3.4手順1。2026-07-04 FB-A: X/Bluesky
//       2ボタンを「SNSに投稿」1ボタンへ統合し、target選択の責務はShareDialog内部へ移した）。

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { exportRecipeToBlob } from "../../lib/exporters/json";
import {
  buildMarkdownLabels,
  exportRecipeToMarkdown,
} from "../../lib/exporters/markdown";
import {
  buildNoteMarkdownLabels,
  exportRecipeToNoteMarkdown,
} from "../../lib/exporters/noteMarkdown";
import { recordRecipeExport } from "../../lib/storageHealth";
import { downloadBlob, sanitizeFilename } from "../common/downloadBlob";
import { useToast } from "../common/toastContext";
import type { RecipeDoc } from "../../models/recipe";
import type { ShareDialogContext } from "./ShareDialog";

/** noteMdCopiedのフィードバック表示時間（ms）。約2秒でリセットする */
const NOTE_MD_COPIED_RESET_MS = 2000;

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface UseExportActionsResult {
  /** JSONエクスポートボタンのonClick。写真あり/なし選択ダイアログを開く */
  handleRequestJsonExport: () => void;
  /** ExportPhotoChoiceDialogのprops（recipeがnullのときはopenされない） */
  exportChoiceOpen: boolean;
  handleChooseJsonExport: (includePhotos: boolean) => void;
  handleCancelJsonExport: () => void;
  /** 素MDエクスポートボタンのonClick（.mdファイルへ直接DL） */
  handlePlainMdExport: () => void;
  /** note MDエクスポートボタンのonClick（クリップボードコピー） */
  handleNoteMdExport: () => void;
  /** note MDコピー成功直後 約2秒間true（ボタンラベルの「コピーしました ✓」切替用） */
  noteMdCopied: boolean;
  /** クリップボードコピー不能時の手動コピーフォールバックダイアログのopen状態 */
  noteMdFallbackOpen: boolean;
  /** フォールバックダイアログに表示するnote MD全文（openがfalseの間はnull） */
  noteMdFallbackMarkdown: string | null;
  /** フォールバックダイアログを閉じる */
  handleCloseNoteMdFallback: () => void;
  /** 印刷ボタンのonClick（/recipe/:id/printへnavigate） */
  handlePrint: () => void;
  /** 「SNSに投稿」ボタンのonClick（ShareDialogをwholeコンテキストで開く。X/Bluesky選択は
   * ShareDialog内部のタブに委ねる。2026-07-04 FB-A: 旧handleShareX/handleShareBlueskyを統合） */
  handleShareSns: () => void;
  /** ShareDialogのopen状態 */
  shareDialogOpen: boolean;
  /** ShareDialogのcontext（openがfalseの間はnull。参照安定化は不要。理由はshareDialogContext定義部コメント参照） */
  shareDialogContext: ShareDialogContext | null;
  handleCloseShareDialog: () => void;
}

export function useExportActions(
  recipe: RecipeDoc | null,
  onExported?: (recipeId: string) => void,
): UseExportActionsResult {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [noteMdCopied, setNoteMdCopied] = useState(false);
  const [noteMdFallbackMarkdown, setNoteMdFallbackMarkdown] = useState<
    string | null
  >(null);
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // アンマウント時にタイマーを確実にクリアする（cleanup管理）
  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current !== null) {
        clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, []);

  function handleRequestJsonExport() {
    if (!recipe) return;
    setExportChoiceOpen(true);
  }

  function handleCancelJsonExport() {
    setExportChoiceOpen(false);
  }

  function handleChooseJsonExport(includePhotos: boolean) {
    setExportChoiceOpen(false);
    if (!recipe) return;
    void (async () => {
      try {
        const blob = await exportRecipeToBlob(recipe.id, { includePhotos });
        downloadBlob(blob, `${sanitizeFilename(recipe.title)}.json`);
        // §3.5: エクスポート成功時にmeta.recipeExport:<recipeId>を更新
        await recordRecipeExport(recipe.id, new Date().toISOString());
        toast.success(t("export.jsonSuccess"));
        // D-6: 当該レシピの未バックアップドット・リマインダー帯の再判定を親に促す
        onExported?.(recipe.id);
      } catch {
        toast.error(t("export.jsonFailed"));
      }
    })();
  }

  function handlePlainMdExport() {
    if (!recipe) return;
    const markdown = exportRecipeToMarkdown(recipe, buildMarkdownLabels(t));
    try {
      downloadBlob(
        new Blob([markdown], { type: "text/markdown" }),
        `${sanitizeFilename(recipe.title)}.md`,
      );
      toast.success(t("export.markdownDownloadSuccess"));
    } catch {
      toast.error(t("export.markdownDownloadFailed"));
    }
  }

  function handleNoteMdExport() {
    if (!recipe) return;
    const markdown = exportRecipeToNoteMarkdown(
      recipe,
      buildNoteMarkdownLabels(t),
    );
    void (async () => {
      const copied = await copyTextToClipboard(markdown);
      if (copied) {
        toast.success(t("export.markdownCopySuccess"));
        setNoteMdCopied(true);
        if (copiedResetTimerRef.current !== null) {
          clearTimeout(copiedResetTimerRef.current);
        }
        copiedResetTimerRef.current = setTimeout(() => {
          setNoteMdCopied(false);
          copiedResetTimerRef.current = null;
        }, NOTE_MD_COPIED_RESET_MS);
        return;
      }
      // 失敗フィードバックはフォールバックダイアログ自身が担う。エラートーストを併発すると
      // 二重通知になる上、手動✕まで残存するトースト(z:1000)がモバイルで下のUIのタップを塞ぐ
      setNoteMdFallbackMarkdown(markdown);
    })();
  }

  function handleCloseNoteMdFallback() {
    setNoteMdFallbackMarkdown(null);
  }

  function handlePrint() {
    if (!recipe) return;
    navigate(`/recipe/${recipe.id}/print`);
  }

  function handleShareSns() {
    if (!recipe) return;
    setShareOpen(true);
  }

  function handleCloseShareDialog() {
    setShareOpen(false);
  }

  // ShareDialogのeffectはopen/mode/recipe.id/partIdなど一次値にのみ依存し、
  // context自体の参照安定性には依存しない（ShareDialog.tsx側のrefパターン・
  // PartReviewDialogの結線と同趣旨）。そのため参照安定化のためのuseMemoは不要。
  const shareDialogContext: ShareDialogContext | null =
    !recipe || !shareOpen ? null : { mode: "whole", recipe };

  return {
    handleRequestJsonExport,
    exportChoiceOpen,
    handleChooseJsonExport,
    handleCancelJsonExport,
    handlePlainMdExport,
    handleNoteMdExport,
    noteMdCopied,
    noteMdFallbackOpen: noteMdFallbackMarkdown !== null,
    noteMdFallbackMarkdown,
    handleCloseNoteMdFallback,
    handlePrint,
    handleShareSns,
    shareDialogOpen: shareOpen,
    shareDialogContext,
    handleCloseShareDialog,
  };
}
