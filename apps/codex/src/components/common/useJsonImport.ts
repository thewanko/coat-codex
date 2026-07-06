// components/common/useJsonImport.ts — JSONインポート共通処理フック（技術計画v2.2 §3.3・T33）
//
// ImportJsonButton（Home）とImportJsonSection（Setup）から共用する（画面構成§3.3
// 「処理・エラー表示はHomeと共通: useJsonImport＋ImportErrorDialog」）。
// ファイル選択確定のユーザー操作直下でstorage.persist()を要求（§3.5発火点②③）→
// ファイル読み込み→importRecipe（3段検証・正規化・Dexie書き込み）→
// 成功: 当該レシピのOverviewへ遷移／失敗: ImportErrorDialog表示用のstateを保持する。

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { importRecipe } from "../../lib/importRecipe";
import type { ImportIssue } from "@coat-codex/recipe-core";
import {
  checkPersisted,
  readPersistRecord,
  recordPersistResult,
  requestPersist,
  shouldRequestPersist,
} from "../../lib/storageHealth";
import { useToast } from "./toastContext";

/** §3.5発火条件: meta.persist未記録（または未許可のまま）の場合のみ要求し、結果を記録する */
async function ensurePersistRequested(): Promise<void> {
  const [record, persisted] = await Promise.all([
    readPersistRecord(),
    checkPersisted(),
  ]);
  if (!shouldRequestPersist(record, persisted)) {
    return;
  }
  const granted = await requestPersist();
  if (granted === undefined) {
    return;
  }
  await recordPersistResult(granted, new Date().toISOString());
}

/** File→テキスト読み込み（FileReaderのPromiseラッパー） */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("readFileAsText: 読み込み結果が文字列ではありません"));
      }
    };
    reader.onerror = () => {
      reject(
        reader.error ?? new Error("readFileAsText: 読み込みに失敗しました"),
      );
    };
    reader.readAsText(file);
  });
}

export interface JsonImportErrorState {
  message: string;
  issues: ImportIssue[];
}

export interface UseJsonImportResult {
  /** インポート処理中かどうか（連打防止・disabled制御に使う） */
  isImporting: boolean;
  /** ImportErrorDialog表示用の直近の失敗内容。nullなら非表示 */
  errorState: JsonImportErrorState | null;
  /** ImportErrorDialogのonCloseから呼ぶ */
  dismissError: () => void;
  /** <input type="file">のonChangeにそのまま渡すハンドラ */
  handleFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function useJsonImport(): UseJsonImportResult {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [isImporting, setIsImporting] = useState(false);
  const [errorState, setErrorState] = useState<JsonImportErrorState | null>(
    null,
  );

  const dismissError = useCallback(() => setErrorState(null), []);

  const handleFileSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // 同じファイルを連続選択してもonChangeが発火するようにinputをリセットする
      event.target.value = "";
      if (!file) {
        return;
      }

      // §3.5発火点②③: ファイル選択確定のユーザー操作直下で要求する（awaitでブロックしない）
      void ensurePersistRequested();

      setIsImporting(true);
      void (async () => {
        try {
          const jsonText = await readFileAsText(file);
          const result = await importRecipe(jsonText);
          if (result.ok) {
            toast.success(
              t("importError.success", { title: result.recipe.title }),
            );
            navigate(`/recipe/${result.recipe.id}`);
            return;
          }

          // トーストは要約のみ（D-4）。詳細はImportErrorDialogで表示する
          toast.error(t("importError.toastSummary"));
          setErrorState({ message: result.message, issues: result.issues });
        } catch (err) {
          toast.error(t("importError.toastSummary"));
          setErrorState({
            message:
              err instanceof Error
                ? err.message
                : t("importError.unknownFailure"),
            issues: [],
          });
        } finally {
          setIsImporting(false);
        }
      })();
    },
    [navigate, t, toast],
  );

  return { isImporting, errorState, dismissError, handleFileSelected };
}
