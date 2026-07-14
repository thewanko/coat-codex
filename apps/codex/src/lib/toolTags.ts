// lib/toolTags.ts — ツールライブラリのタグ正規化ロジック（技術計画v2.6 §2.8）
//
// UserToolRecord.tags は正規化済み（先頭 # なし・trim・大小無視dedupe）で保持する。
// 表示時のみ TagChipEditor 等が先頭に `#` を付与して描画する。

/**
 * タグ文字列を正規化する（§2.8）。
 * NFC正規化 → trim → 先頭の半角/全角ハッシュ記号を除去 → 再trim。
 * 除去後に空文字になった場合はそのまま空文字を返す（呼び出し元で無視する）。
 */
export function normalizeTag(tag: string): string {
  return tag
    .normalize("NFC")
    .trim()
    .replace(/^[#＃]/, "")
    .trim();
}

/**
 * 正規化後のタグをtagsへ追加する。空文字（正規化後）は不変、既存と大小無視で
 * 重複する場合も不変。それ以外は末尾に追加した新しい配列を返す（非破壊）。
 */
export function addTag(tags: string[], input: string): string[] {
  const normalized = normalizeTag(input);
  if (normalized === "") {
    return tags;
  }
  const lower = normalized.toLowerCase();
  const exists = tags.some((tag) => tag.toLowerCase() === lower);
  if (exists) {
    return tags;
  }
  return [...tags, normalized];
}

/**
 * 複数ツールの全タグを大小無視でdedupeし、昇順（localeCompare）で返す。
 * M11のタグ絞り込み候補生成に使う純関数。
 */
export function collectAllTags(tools: Array<{ tags: string[] }>): string[] {
  const seen = new Map<string, string>();
  for (const tool of tools) {
    for (const tag of tool.tags) {
      const lower = tag.toLowerCase();
      if (!seen.has(lower)) {
        seen.set(lower, tag);
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
