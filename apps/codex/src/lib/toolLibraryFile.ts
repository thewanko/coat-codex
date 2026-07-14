// lib/toolLibraryFile.ts — ツールライブラリ専用エクスポート/インポート形式（技術計画v2.6 §2.8 T54）
//
// レシピの"recipe-export"（models/recipe.ts）とは別種別の"tool-library"ファイル形式。
// UserToolRecordのid/createdAt/updatedAtは含めない（インポート時に新規採番/現在時刻で登録し直す
// ため）。マージ規約はtoolNameKey一致（db/toolStore.ts）でタグをunionし、既存noteがnullのときのみ
// インポート側noteで補完する（§2.8マージ規約）。

import { z } from "zod";
import { normalizeTag } from "./toolTags";
import { toolNameKey } from "../db/toolStore";
import { db } from "../db/db";
import type { UserToolRecord } from "../db/db";

/** ツールライブラリエクスポートファイルの1ツール要素 */
export interface ToolLibraryExportEntry {
  name: string;
  note: string | null;
  tags: string[];
}

/** ツールライブラリ専用エクスポートファイル形式（§2.8） */
export interface ToolLibraryExportFile {
  app: "coat-codex";
  kind: "tool-library";
  version: 1;
  exportedAt: string; // ISO 8601 UTC
  tools: ToolLibraryExportEntry[];
}

const toolEntrySchema = z.object({
  name: z.string().min(1),
  note: z.string().nullable(),
  tags: z.array(z.string()),
});

const toolLibraryFileSchema = z.object({
  app: z.literal("coat-codex"),
  kind: z.literal("tool-library"),
  version: z.literal(1),
  exportedAt: z.string(),
  tools: z.array(toolEntrySchema),
});

/** 登録済みツールからエクスポートファイルを組み立てる（id/createdAt/updatedAtは落とす純関数） */
export function buildToolLibraryExport(
  tools: UserToolRecord[],
): ToolLibraryExportFile {
  return {
    app: "coat-codex",
    kind: "tool-library",
    version: 1,
    exportedAt: new Date().toISOString(),
    tools: tools.map((tool) => ({
      name: tool.name,
      note: tool.note,
      tags: tool.tags,
    })),
  };
}

export type ParseToolLibraryFileResult =
  | { ok: true; file: ToolLibraryExportFile }
  | {
      ok: false;
      error: "invalid-json" | "invalid-format" | "unsupported-version";
    };

/**
 * ツールライブラリエクスポートファイルのJSON文字列を検証・パースする。
 * JSON.parse失敗・zod形式不一致・version不一致をエラー種別ごとに区別する（throwしない）。
 */
export function parseToolLibraryFile(json: string): ParseToolLibraryFileResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "invalid-json" };
  }

  if (
    raw !== null &&
    typeof raw === "object" &&
    "version" in raw &&
    (raw as { version: unknown }).version !== 1
  ) {
    return { ok: false, error: "unsupported-version" };
  }

  const result = toolLibraryFileSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: "invalid-format" };
  }

  return { ok: true, file: result.data };
}

/** 新規追加として扱うツール（idなし・呼び出し元がregisterUserTool等で採番する） */
export interface MergeAddedTool {
  name: string;
  note: string | null;
  tags: string[];
}

/** 既存ツールへの更新（idあり。noteは補完対象のときのみ含める） */
export interface MergeUpdatedTool {
  id: string;
  tags: string[];
  note?: string;
}

export interface MergeImportedToolsResult {
  added: MergeAddedTool[];
  updates: MergeUpdatedTool[];
  addedCount: number;
  mergedCount: number;
}

/** タグ配列を正規化・大小無視dedupeしてunionする（順序は既存優先→新規追加順） */
function unionTags(existingTags: string[], incomingTags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const tag of [...existingTags, ...incomingTags]) {
    const normalized = normalizeTag(tag);
    if (normalized === "") {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

/**
 * 既存ツール一覧にインポートされたツールをマージする（純ロジック）。
 * toolNameKey一致 → 既存を更新対象（タグunion＋既存noteがnullのときのみnote補完）。
 * 不一致 → 新規追加。インポート内部の同名重複（NFC/trim/大小無視で一致）も1件に畳む。
 */
export function mergeImportedTools(
  existing: UserToolRecord[],
  imported: ToolLibraryExportFile["tools"],
): MergeImportedToolsResult {
  const added: MergeAddedTool[] = [];
  const updates: MergeUpdatedTool[] = [];

  // インポート内部の同名重複を先に1件へ畳む（後勝ちでタグ/noteをマージ）
  const dedupedByKey = new Map<string, MergeAddedTool>();
  for (const entry of imported) {
    const key = toolNameKey(entry.name);
    const trimmedName = entry.name.trim();
    const prior = dedupedByKey.get(key);
    if (!prior) {
      dedupedByKey.set(key, {
        name: trimmedName,
        note: entry.note,
        tags: unionTags([], entry.tags),
      });
      continue;
    }
    dedupedByKey.set(key, {
      name: prior.name,
      note: prior.note ?? entry.note,
      tags: unionTags(prior.tags, entry.tags),
    });
  }

  const existingByKey = new Map<string, UserToolRecord>();
  for (const tool of existing) {
    existingByKey.set(toolNameKey(tool.name), tool);
  }

  for (const [key, entry] of dedupedByKey) {
    const existingTool = existingByKey.get(key);
    if (!existingTool) {
      added.push({ name: entry.name, note: entry.note, tags: entry.tags });
      continue;
    }

    const mergedTags = unionTags(existingTool.tags, entry.tags);
    const shouldUpdateNote = existingTool.note === null && entry.note !== null;

    const update: MergeUpdatedTool = { id: existingTool.id, tags: mergedTags };
    if (shouldUpdateNote && entry.note !== null) {
      update.note = entry.note;
    }
    updates.push(update);
  }

  return {
    added,
    updates,
    addedCount: added.length,
    mergedCount: updates.length,
  };
}

/**
 * mergeImportedToolsの`updates`をDexieへ書き込む（tags＋noteの一括更新）。
 * db/toolStore.tsの`updateUserToolTags`はtagsのみを対象とし、既存noteがnullのときのみ
 * 補完するnote更新のAPIを持たないため、この適用関数（唯一のnote書込み箇所）に集約する。
 * `db`はdb/db.tsが公開する既存のDexieインスタンスをそのまま使う（db/配下ファイルの変更はしない）。
 */
export async function applyMergeUpdates(
  updates: MergeUpdatedTool[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const update of updates) {
    const patch: Partial<UserToolRecord> = {
      tags: update.tags,
      updatedAt: now,
    };
    if (update.note !== undefined) {
      patch.note = update.note;
    }
    await db.userTools.update(update.id, patch);
  }
}
