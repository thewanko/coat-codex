// lib/useImportDeepLink.ts — `?import=` ディープリンクのReact結線（技術計画v1.3 §6-2/§7 ST-23）
//
// mount時に一度だけ`?import=`クエリを読み、allowlist検証→詳細fetch→cover取得＋重複検出→
// ready状態を組み立てる。confirm()で実際のインポート（runScriptoriumImport）を実行する。
// UIコンポーネント（ImportFromScriptoriumDialog・Wave B）はこのフックのstateを表示するだけ。

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ImportIssue, RecipeDoc } from "@coat-codex/recipe-core";
import {
  fetchCoverAsDataUrl,
  fetchPublishedDetail,
  findRecipeByScriptoriumId,
  parseImportUrl,
  runScriptoriumImport,
  type CoverFetchResult,
  type ScriptoriumDetail,
} from "./importFromScriptorium";
import { ensurePersistRequested } from "./storageHealth";
import { useToast } from "../components/common/toastContext";

export type ImportDeepLinkPhase =
  | { phase: "idle" }
  | { phase: "invalidUrl" }
  | { phase: "loading" }
  | { phase: "fetchError"; code: "notFound" | "network" | "invalidData" }
  | {
      phase: "ready";
      scriptoriumId: string;
      detail: ScriptoriumDetail;
      cover: CoverFetchResult | null;
      duplicate: RecipeDoc | null;
    }
  | {
      phase: "importing";
      scriptoriumId: string;
      detail: ScriptoriumDetail;
      cover: CoverFetchResult | null;
      duplicate: RecipeDoc | null;
    };

export interface UseImportDeepLinkDeps {
  parseImportUrl?: typeof parseImportUrl;
  fetchPublishedDetail?: typeof fetchPublishedDetail;
  fetchCoverAsDataUrl?: typeof fetchCoverAsDataUrl;
  findRecipeByScriptoriumId?: typeof findRecipeByScriptoriumId;
  runScriptoriumImport?: typeof runScriptoriumImport;
  ensurePersistRequested?: typeof ensurePersistRequested;
}

export interface UseImportDeepLinkResult {
  state: ImportDeepLinkPhase;
  /** ready時のみ有効。それ以外は無視される */
  confirm: (includeImage: boolean) => void;
  /** ダイアログを閉じる（idleへ） */
  dismiss: () => void;
  /** ImportErrorDialog表示用の直近の失敗内容。nullなら非表示 */
  importError: { message: string; issues: ImportIssue[] } | null;
  dismissImportError: () => void;
}

export function useImportDeepLink(
  deps?: UseImportDeepLinkDeps,
): UseImportDeepLinkResult {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [state, setState] = useState<ImportDeepLinkPhase>({ phase: "idle" });
  const [importError, setImportError] = useState<{
    message: string;
    issues: ImportIssue[];
  } | null>(null);

  // StrictMode二重実行ガード（mount時effectを1回だけ処理する）
  const startedRef = useRef(false);
  // dismiss後にfetch完了時の結果を破棄するための世代トークン
  const generationRef = useRef(0);

  const doParseImportUrl = deps?.parseImportUrl ?? parseImportUrl;
  const doFetchPublishedDetail =
    deps?.fetchPublishedDetail ?? fetchPublishedDetail;
  const doFetchCoverAsDataUrl =
    deps?.fetchCoverAsDataUrl ?? fetchCoverAsDataUrl;
  const doFindRecipeByScriptoriumId =
    deps?.findRecipeByScriptoriumId ?? findRecipeByScriptoriumId;
  const doRunScriptoriumImport =
    deps?.runScriptoriumImport ?? runScriptoriumImport;
  const doEnsurePersistRequested =
    deps?.ensurePersistRequested ?? ensurePersistRequested;

  // mount時effectはStrictMode二重実行ガード（startedRef）で1回だけ処理する。
  // effectが参照する値は毎レンダー更新されるrefに積み、effect自体の依存配列は
  // 空にする（react-hooks/exhaustive-deps警告を「mount時1回だけ」の意図と
  // 矛盾させない設計。無効化コメントは使わない）。
  const runRef = useRef({
    searchParams,
    setSearchParams,
    doParseImportUrl,
    doFetchPublishedDetail,
    doFetchCoverAsDataUrl,
    doFindRecipeByScriptoriumId,
  });
  runRef.current = {
    searchParams,
    setSearchParams,
    doParseImportUrl,
    doFetchPublishedDetail,
    doFetchCoverAsDataUrl,
    doFindRecipeByScriptoriumId,
  };

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    const raw = runRef.current.searchParams.get("import");
    if (raw === null) {
      return;
    }

    // 読んだら即除去する（リロード/戻るで再発火させない）
    runRef.current.setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("import");
        return next;
      },
      { replace: true },
    );

    const parsed = runRef.current.doParseImportUrl(raw);
    if (!parsed) {
      setState({ phase: "invalidUrl" });
      return;
    }

    const generation = generationRef.current;
    setState({ phase: "loading" });

    void (async () => {
      const result = await runRef.current.doFetchPublishedDetail(
        parsed.scriptoriumId,
      );
      if (generation !== generationRef.current) {
        return; // dismiss済み: 結果を破棄
      }

      if (!result.ok) {
        setState({ phase: "fetchError", code: result.code });
        return;
      }

      const { detail } = result;
      const [cover, duplicate] = await Promise.all([
        detail.coverUrl
          ? runRef.current.doFetchCoverAsDataUrl(detail.coverUrl)
          : null,
        runRef.current.doFindRecipeByScriptoriumId(parsed.scriptoriumId),
      ]);
      if (generation !== generationRef.current) {
        return; // dismiss済み: 結果を破棄
      }

      setState({
        phase: "ready",
        scriptoriumId: parsed.scriptoriumId,
        detail,
        cover,
        duplicate,
      });
    })();
  }, []);

  const dismiss = useCallback(() => {
    generationRef.current += 1;
    setState({ phase: "idle" });
  }, []);

  const dismissImportError = useCallback(() => {
    setImportError(null);
  }, []);

  const confirm = useCallback(
    (includeImage: boolean) => {
      if (state.phase !== "ready") {
        return;
      }
      const { scriptoriumId, detail, cover, duplicate } = state;

      setState({ phase: "importing", scriptoriumId, detail, cover, duplicate });

      // §3.5発火点②相当: ユーザー操作直下で要求する（awaitでブロックしない）
      void doEnsurePersistRequested();

      void (async () => {
        const result = await doRunScriptoriumImport({
          detail,
          scriptoriumId,
          coverDataUrl: includeImage && cover ? cover.dataUrl : undefined,
        });

        if (result.ok) {
          toast.success(
            t("importError.success", { title: result.recipe.title }),
          );
          navigate(`/recipe/${result.recipe.id}`);
          setState({ phase: "idle" });
          return;
        }

        toast.error(t("importError.toastSummary"));
        setImportError({ message: result.message, issues: result.issues });
        setState({ phase: "idle" });
      })();
    },
    [
      state,
      doEnsurePersistRequested,
      doRunScriptoriumImport,
      navigate,
      t,
      toast,
    ],
  );

  return { state, confirm, dismiss, importError, dismissImportError };
}
