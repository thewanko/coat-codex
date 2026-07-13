// db/toolStore.ts — ツールライブラリ（UserToolRecord）CRUD（技術計画v2.6 §2.8）
//
// Dexieレコード自体にzodスキーマは設けない（packages/recipe-coreの無変更を構造的に
// 保証するため。外部入力を伴うエクスポート/インポートファイルのみzod検証を持つ＝T54）。
//
// tagsの正規化（normalizeTag等）はここでは行わない（タグ正規化はlib/toolTags.tsの
// スコープ＝T53。registerUserToolは渡されたtagsをそのまま保存する）。

import { db } from "./db";
import type { UserToolRecord } from "./db";

/**
 * ツール名の重複判定キー（§2.8正規化規約）。
 * NFC正規化 → trim → 小文字化。登録・自動登録・インポートのマージすべてで本キーを使う。
 */
export function toolNameKey(name: string): string {
  return name.normalize("NFC").trim().toLowerCase();
}

/** 登録済みツールの一覧（name昇順） */
export async function listUserTools(): Promise<UserToolRecord[]> {
  const tools = await db.userTools.toArray();
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

/** toolNameKey一致で既存ツールを検索する */
export async function findUserToolByName(
  name: string,
): Promise<UserToolRecord | undefined> {
  const key = toolNameKey(name);
  const tools = await db.userTools.toArray();
  return tools.find((tool) => toolNameKey(tool.name) === key);
}

/**
 * ツールを登録する。toolNameKey一致の既存があれば新規作成せず既存を返す
 * （`created: false`）。nameはtrimして空文字はthrowする。
 */
export async function registerUserTool(input: {
  name: string;
  note?: string | null;
  tags?: string[];
}): Promise<{ tool: UserToolRecord; created: boolean }> {
  const trimmedName = input.name.trim();
  if (trimmedName === "") {
    throw new Error("ツール名は空にできません");
  }

  const existing = await findUserToolByName(trimmedName);
  if (existing) {
    return { tool: existing, created: false };
  }

  const now = new Date().toISOString();
  const tool: UserToolRecord = {
    id: `utool_${crypto.randomUUID()}`,
    name: trimmedName,
    note: input.note ?? null,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await db.userTools.add(tool);
  return { tool, created: true };
}

/**
 * tagsを置換しupdatedAtを更新する。
 * idが存在しない場合はDexieの`update`が0を返すため無視する（呼び出し元UIは
 * 再度listUserTools()した結果で表示を更新する運用のため、ここで例外にはしない）。
 */
export async function updateUserToolTags(
  id: string,
  tags: string[],
): Promise<void> {
  await db.userTools.update(id, {
    tags,
    updatedAt: new Date().toISOString(),
  });
}

/** ツールを削除する（doc.tools・既存レシピには一切影響しない。§2.8） */
export async function deleteUserTool(id: string): Promise<void> {
  await db.userTools.delete(id);
}
