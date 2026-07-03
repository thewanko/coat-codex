// components/overview/useExportActions.ts — ExportActionBarのJSON/素MD/note MD/
// 印刷/X/Bluesky結線ロジック（技術計画v2.3 §3.3 ExportActionBar行・§3.4・§3.5・T33・T40）
//
// PC版（ExportActions）・mobile版（ExportSheetActions）の両方から共用するフック。
// react-refresh/only-export-components対応のためコンポーネントファイルから分離する
// （exportSheetDrag.tsと同じ方針）。
//
// JSON: ExportPhotoChoiceDialogで写真あり/なし選択→exportRecipeToBlob→downloadBlob→
//       成功時にmeta.recipeExport:<recipeId>を更新（§3.5）。
// 素MD・note MD: exportRecipeToMarkdown/exportRecipeToNoteMarkdown（buildMarkdownLabels/
//       buildNoteMarkdownLabelsでi18n注入）をnavigator.clipboard.writeTextでコピーし、
//       非対応・失敗時はファイルDLへフォールバックする。
// 印刷: /recipe/:id/printへnavigate（保存手順の案内はPrintViewPage側のPrintToolbarが担う。
//       T36仕様。PDFボタンは印刷と挙動が同一だったため2026-07-03ユーザー決定で削除）。
// X・Bluesky: ShareDialogをmode="whole"・対応するtargetで開く（T40・§3.4手順1）。

import { useState } from "react";
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
import { snsTargets, type SnsTarget } from "../../lib/sns/types";
import { downloadBlob, sanitizeFilename } from "../common/downloadBlob";
import { useToast } from "../common/toastContext";
import type { RecipeDoc } from "../../models/recipe";
import type { ShareDialogContext } from "./ShareDialog";

const X_TARGET = snsTargets.find((target) => target.key === "x");
const BLUESKY_TARGET = snsTargets.find((target) => target.key === "bluesky");

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
  /** 素MDエクスポートボタンのonClick */
  handlePlainMdExport: () => void;
  /** note MDエクスポートボタンのonClick */
  handleNoteMdExport: () => void;
  /** 印刷ボタンのonClick（/recipe/:id/printへnavigate） */
  handlePrint: () => void;
  /** Xボタンのonclick（ShareDialogをwholeコンテキスト・target=xで開く） */
  handleShareX: () => void;
  /** Blueskyボタンのonclick（ShareDialogをwholeコンテキスト・target=blueskyで開く） */
  handleShareBluesky: () => void;
  /** ShareDialogのopen状態 */
  shareDialogOpen: boolean;
  /** ShareDialogのcontext（openがfalseの間はnull。参照安定化は不要。理由はshareDialogContext定義部コメント参照） */
  shareDialogContext: ShareDialogContext | null;
  /** ShareDialogのtarget（openがfalseの間はnull） */
  shareDialogTarget: SnsTarget | null;
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
  const [shareTargetKey, setShareTargetKey] = useState<"x" | "bluesky" | null>(
    null,
  );

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
    void (async () => {
      const copied = await copyTextToClipboard(markdown);
      if (copied) {
        toast.success(t("export.markdownCopySuccess"));
        return;
      }
      try {
        downloadBlob(
          new Blob([markdown], { type: "text/markdown" }),
          `${sanitizeFilename(recipe.title)}.md`,
        );
        toast.success(t("export.markdownCopySuccess"));
      } catch {
        toast.error(t("export.markdownCopyFailed"));
      }
    })();
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
        return;
      }
      try {
        downloadBlob(
          new Blob([markdown], { type: "text/markdown" }),
          `${sanitizeFilename(recipe.title)}-note.md`,
        );
        toast.success(t("export.markdownCopySuccess"));
      } catch {
        toast.error(t("export.markdownCopyFailed"));
      }
    })();
  }

  function handlePrint() {
    if (!recipe) return;
    navigate(`/recipe/${recipe.id}/print`);
  }

  function handleShareX() {
    if (!recipe) return;
    setShareTargetKey("x");
  }

  function handleShareBluesky() {
    if (!recipe) return;
    setShareTargetKey("bluesky");
  }

  function handleCloseShareDialog() {
    setShareTargetKey(null);
  }

  // ShareDialogのeffectはopen/mode/recipe.id/partIdなど一次値にのみ依存し、
  // context自体の参照安定性には依存しない（ShareDialog.tsx側のrefパターン・
  // PartReviewDialogの結線と同趣旨）。そのため参照安定化のためのuseMemoは不要。
  const shareDialogContext: ShareDialogContext | null =
    !recipe || shareTargetKey === null ? null : { mode: "whole", recipe };

  const shareDialogTarget: SnsTarget | null =
    shareTargetKey === "x"
      ? (X_TARGET ?? null)
      : shareTargetKey === "bluesky"
        ? (BLUESKY_TARGET ?? null)
        : null;

  return {
    handleRequestJsonExport,
    exportChoiceOpen,
    handleChooseJsonExport,
    handleCancelJsonExport,
    handlePlainMdExport,
    handleNoteMdExport,
    handlePrint,
    handleShareX,
    handleShareBluesky,
    shareDialogOpen: shareTargetKey !== null,
    shareDialogContext,
    shareDialogTarget,
    handleCloseShareDialog,
  };
}
