// components/overview/useExportActions.ts — ExportActionBarのJSON/素MD/note MD結線ロジック
// （技術計画v2.2 §3.3 ExportActionBar行・§3.5・T33）
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

import { useState } from "react";
import { useTranslation } from "react-i18next";
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
}

export function useExportActions(
  recipe: RecipeDoc | null,
): UseExportActionsResult {
  const { t } = useTranslation();
  const toast = useToast();
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false);

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

  return {
    handleRequestJsonExport,
    exportChoiceOpen,
    handleChooseJsonExport,
    handleCancelJsonExport,
    handlePlainMdExport,
    handleNoteMdExport,
  };
}
