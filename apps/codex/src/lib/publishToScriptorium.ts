// lib/publishToScriptorium.ts — Scriptoriumへの投稿処理（技術計画v1.3 §6-1/§4.2/§2.4）
//
// PublishDialog（別タスク）の送信部が呼ぶコアロジック。RecipeDoc→PublishedRecipe変換
// （toPublishedRecipe）→strict検証（publishedRecipeStrictSchema）→multipart POST /api/recipes
// （payload/cover/thumb）→成功時にdb.metaへscriptoriumPost:<recipeId>を記録する（削除PWは
// 保存しない）までを1関数にまとめる（ST-21のテスト可能なコア。UIはPublishDialog側で実装）。

import {
  toPublishedRecipe,
  publishedRecipeStrictSchema,
  type RecipeDoc,
} from "@coat-codex/recipe-core";
import { db } from "../db/db";

export interface PublishInput {
  doc: RecipeDoc;
  handle: string;
  lang: "en" | "ja" | null;
  deletePassword: string;
  turnstileToken: string;
  cover?: Blob;
  thumb?: Blob;
}

export interface PublishResult {
  id: string;
  url: string;
  status: string;
}

export type PublishErrorCode =
  | "validation"
  | "turnstile"
  | "rateLimit"
  | "circuit"
  | "tooLarge"
  | "network"
  | "unknown";

/** POST /api/recipes（§4.2）の失敗応答ステータスをPublishErrorCodeへ写像する */
function mapStatusToErrorCode(status: number): PublishErrorCode {
  switch (status) {
    case 400:
      return "validation";
    case 403:
      return "turnstile";
    case 413:
      return "tooLarge";
    case 429:
      return "rateLimit";
    case 503:
      return "circuit";
    default:
      return "unknown";
  }
}

export class PublishError extends Error {
  code: PublishErrorCode;
  status?: number;

  constructor(code: PublishErrorCode, message: string, status?: number) {
    super(message);
    this.name = "PublishError";
    this.code = code;
    this.status = status;
  }
}

/** meta記録に使うレコード形状（scriptoriumPost:<recipeId>のvalue。deletePasswordは含めない） */
export interface ScriptoriumPostRecord {
  scriptoriumId: string;
  url: string;
  postedAt: string;
}

export interface PublishDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  baseUrl?: string;
  recordMeta?: (
    recipeId: string,
    record: ScriptoriumPostRecord,
  ) => Promise<void>;
}

const DEFAULT_BASE_URL = "https://scriptorium.coat-codex.com";

/** meta.scriptoriumPost:<recipeId>へ投稿結果を記録する既定実装（db.tsのmeta KVストア§2.7） */
async function defaultRecordMeta(
  recipeId: string,
  record: ScriptoriumPostRecord,
): Promise<void> {
  await db.meta.put({
    key: `scriptoriumPost:${recipeId}`,
    value: JSON.stringify(record),
  });
}

/**
 * RecipeDocをScriptoriumへ投稿する（§6-1）。
 * strict検証に失敗した場合はfetchを呼ばずにPublishError("validation")をthrowする。
 */
export async function publishToScriptorium(
  input: PublishInput,
  deps?: PublishDeps,
): Promise<PublishResult> {
  const published = toPublishedRecipe(input.doc);
  const parsed = publishedRecipeStrictSchema.safeParse(published);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const rawMessage = firstIssue?.message ?? "投稿内容の検証に失敗しました";
    // 内部タグ [STRICT-TEXT] 等を除去してユーザー向けに整える
    const cleanMessage = rawMessage.replace(/^\[STRICT-[A-Z]+\]\s*/, "");
    const path = firstIssue?.path?.join(".") ?? "";
    const detail = path ? `${cleanMessage}（該当箇所: ${path}）` : cleanMessage;
    throw new PublishError("validation", detail);
  }

  const fd = new FormData();
  fd.append(
    "payload",
    JSON.stringify({
      handle: input.handle,
      lang: input.lang,
      recipe: published,
      deletePassword: input.deletePassword,
      turnstileToken: input.turnstileToken,
    }),
  );
  if (input.cover) {
    fd.append(
      "cover",
      new File([input.cover], "cover.webp", { type: "image/webp" }),
    );
  }
  if (input.thumb) {
    fd.append(
      "thumb",
      new File([input.thumb], "thumb.webp", { type: "image/webp" }),
    );
  }

  const baseUrl = deps?.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = deps?.fetch ?? fetch;

  let res: Response;
  try {
    res = await doFetch(`${baseUrl}/api/recipes`, {
      method: "POST",
      body: fd,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new PublishError("network", `投稿通信に失敗しました: ${message}`);
  }

  if (res.status !== 201) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    const code = mapStatusToErrorCode(res.status);
    const message =
      body?.message ??
      body?.error ??
      `投稿に失敗しました (status: ${res.status})`;
    throw new PublishError(code, message, res.status);
  }

  const body = (await res.json()) as PublishResult;

  const now = deps?.now ?? (() => new Date());
  const record: ScriptoriumPostRecord = {
    scriptoriumId: body.id,
    url: body.url,
    postedAt: now().toISOString(),
  };
  const recordMeta = deps?.recordMeta ?? defaultRecordMeta;
  await recordMeta(input.doc.id, record);

  return { id: body.id, url: body.url, status: body.status };
}
