// lib/importFromScriptorium.ts — Scriptoriumからのインポート処理（技術計画v1.3 §6-2/§7 ST-23）
//
// `?import=<url>` ディープリンク（useImportDeepLink.ts）が呼ぶコアロジック。
// allowlist厳格検証（parseImportUrl）→詳細fetch（fetchPublishedDetail）→cover
// dataURL化（fetchCoverAsDataUrl）→重複検出（findRecipeByScriptoriumId）→
// publishedToExportFile経由で既存importRecipe()を呼ぶ（runScriptoriumImport）までの
// テスト可能なコア関数群（UIはuseImportDeepLink.ts/ImportFromScriptoriumDialogで実装）。

import { z } from "zod";
import {
  publishedRecipeSchema,
  publishedToExportFile,
  type PublishedRecipe,
} from "@coat-codex/recipe-core";
import type { RecipeDoc } from "@coat-codex/recipe-core";
import { db } from "../db/db";
import { importRecipe, type ImportResult } from "./importRecipe";

/** Scriptorium公開APIのcanonical origin（インポートリンク・出典リンクの両方が指す先） */
export const SCRIPTORIUM_ORIGIN = "https://scriptorium.coat-codex.com";

// devはvite proxy（vite.config.tsのserver.proxy）経由（同一origin）・本番はcanonical origin。
// 本番CORSはAccess-Control-Allow-Origin: https://coat-codex.com固定のため、
// localhost（devサーバー）からscriptorium本番APIへ直接fetchはCORSで拒否される。
const DEFAULT_API_BASE = import.meta.env.DEV
  ? "/__scriptorium"
  : SCRIPTORIUM_ORIGIN;

// ---------------------------------------------------------------------------
// parseImportUrl — allowlist厳格検証（任意URL fetchの拒否。§6-2）
// ---------------------------------------------------------------------------

const RECIPE_PATH_PATTERN = /^\/api\/recipes\/([A-Za-z0-9_-]{1,64})$/;

export interface ParsedImportUrl {
  scriptoriumId: string;
}

/**
 * `?import=`で渡されたURL文字列を厳格なallowlistで検証する（§6-2）。
 * protocol=https・host完全一致（別ホスト・後方一致トリック・port付きは拒否）・
 * userinfoなし・pathnameが/api/recipes/<id>形式に完全一致・queryとhashが空、
 * のすべてを満たす場合のみ scriptoriumId を返す。1つでも外れたらnull。
 * 以後のfetchはこの関数の戻り値（scriptoriumId）からURLを再構築し、rawを直接使わない。
 */
export function parseImportUrl(raw: string): ParsedImportUrl | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.host !== "scriptorium.coat-codex.com") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;

  const match = RECIPE_PATH_PATTERN.exec(url.pathname);
  if (!match) return null;

  return { scriptoriumId: match[1] };
}

/** ST-24出典リンク・重複表示用の閲覧ページURLを組み立てる */
export function buildScriptoriumPageUrl(scriptoriumId: string): string {
  return `${SCRIPTORIUM_ORIGIN}/r/${scriptoriumId}`;
}

// ---------------------------------------------------------------------------
// fetchPublishedDetail — GET /api/recipes/:id
// ---------------------------------------------------------------------------

const detailEnvelopeSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  handle: z.string().min(1),
  publishedAt: z.string(),
  coverUrl: z
    .string()
    .regex(/^\/img\/[A-Za-z0-9/_.-]+$/)
    .refine((v) => !v.includes("..") && !v.includes("//"))
    .nullable(),
  recipe: publishedRecipeSchema,
});

export interface ScriptoriumDetail {
  id: string;
  handle: string;
  publishedAt: string;
  coverUrl: string | null;
  recipe: PublishedRecipe;
}

export type FetchDetailResult =
  | { ok: true; detail: ScriptoriumDetail }
  | {
      ok: false;
      code: "notFound" | "network" | "invalidData";
      message: string;
    };

export interface FetchDetailDeps {
  fetch?: typeof fetch;
  apiBase?: string;
}

/**
 * GET ${apiBase}/api/recipes/${scriptoriumId} を取得し、envelope zodスキーマで検証する（§6-2）。
 * カスタムヘッダは付けない（CORS simple requestを維持しpreflightを発生させない）。
 */
export async function fetchPublishedDetail(
  scriptoriumId: string,
  deps?: FetchDetailDeps,
): Promise<FetchDetailResult> {
  const doFetch = deps?.fetch ?? fetch;
  const apiBase = deps?.apiBase ?? DEFAULT_API_BASE;

  let res: Response;
  try {
    res = await doFetch(`${apiBase}/api/recipes/${scriptoriumId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "network", message };
  }

  if (res.status === 404) {
    return { ok: false, code: "notFound", message: "not found" };
  }
  if (!res.ok) {
    return {
      ok: false,
      code: "network",
      message: `unexpected status: ${res.status}`,
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: "invalidData", message: "invalid JSON" };
  }

  const parsed = detailEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalidData",
      message: parsed.error.issues[0]?.message ?? "invalid response shape",
    };
  }

  return {
    ok: true,
    detail: {
      id: parsed.data.id,
      handle: parsed.data.handle,
      publishedAt: parsed.data.publishedAt,
      coverUrl: parsed.data.coverUrl,
      recipe: parsed.data.recipe,
    },
  };
}

// ---------------------------------------------------------------------------
// fetchCoverAsDataUrl — GET ${apiBase}${coverUrl} → dataURL化
// ---------------------------------------------------------------------------

export interface CoverFetchResult {
  dataUrl: string;
  bytes: number;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("blobToDataUrl: 読み込み結果が文字列ではありません"));
      }
    };
    reader.onerror = () => {
      reject(
        reader.error ?? new Error("blobToDataUrl: 読み込みに失敗しました"),
      );
    };
    reader.readAsDataURL(blob);
  });
}

/** cover画像を取得しdataURL化する。取得失敗（非2xx・throw）はnullを返す（呼び出し側で画像なし扱い） */
export async function fetchCoverAsDataUrl(
  coverUrl: string,
  deps?: FetchDetailDeps,
): Promise<CoverFetchResult | null> {
  const doFetch = deps?.fetch ?? fetch;
  const apiBase = deps?.apiBase ?? DEFAULT_API_BASE;

  let res: Response;
  try {
    res = await doFetch(`${apiBase}${coverUrl}`);
  } catch {
    return null;
  }
  if (!res.ok) {
    return null;
  }

  const blob = await res.blob();
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, bytes: blob.size };
}

// ---------------------------------------------------------------------------
// findRecipeByScriptoriumId — 重複検出（§6-2「source.scriptoriumId一致で再インポート確認」）
// ---------------------------------------------------------------------------

export interface FindDuplicateDeps {
  listRecipes?: () => Promise<RecipeDoc[]>;
}

/**
 * db.recipes（既定）からsource.scriptoriumIdが一致する最初の1件を探す。
 * 旧schemaVersion文書はsourceフィールド自体を持たない場合があるためoptional chainで扱う。
 */
export async function findRecipeByScriptoriumId(
  scriptoriumId: string,
  deps?: FindDuplicateDeps,
): Promise<RecipeDoc | null> {
  const listRecipes = deps?.listRecipes ?? (() => db.recipes.toArray());
  const docs = await listRecipes();
  const found = docs.find((doc) => doc.source?.scriptoriumId === scriptoriumId);
  return found ?? null;
}

// ---------------------------------------------------------------------------
// runScriptoriumImport — publishedToExportFile → 既存importRecipe()
// ---------------------------------------------------------------------------

export interface RunScriptoriumImportArgs {
  detail: ScriptoriumDetail;
  scriptoriumId: string;
  coverDataUrl?: string;
}

export interface RunScriptoriumImportDeps {
  importRecipe?: typeof importRecipe;
  now?: () => Date;
}

/**
 * PublishedRecipeをRecipeExportFileへ変換し、既存importRecipe()（3段検証・ID再採番・
 * Dexie tx書込）をそのまま呼ぶ（§6-2）。metaのscriptoriumIdはリクエストした
 * scriptoriumId（args.scriptoriumId）を使う。envelope本体のdetail.idではない。
 */
export async function runScriptoriumImport(
  args: RunScriptoriumImportArgs,
  deps?: RunScriptoriumImportDeps,
): Promise<ImportResult> {
  const now = deps?.now ?? (() => new Date());
  const doImportRecipe = deps?.importRecipe ?? importRecipe;

  const exportFile = publishedToExportFile(
    args.detail.recipe,
    {
      scriptoriumId: args.scriptoriumId,
      author: args.detail.handle,
      importedAt: now().toISOString(),
    },
    args.coverDataUrl,
  );

  const jsonText = JSON.stringify(exportFile);
  return doImportRecipe(jsonText);
}
