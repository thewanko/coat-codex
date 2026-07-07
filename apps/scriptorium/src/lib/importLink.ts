// lib/importLink.ts — codex への「インポートリンク」組み立て（技術計画v1 §6-2）
//
// `coat-codex.com/?import=<scriptorium詳細APIのURL>` の形式で、codex側の
// allowlistパターン `https://scriptorium.coat-codex.com/api/recipes/<id>` と
// 逐語一致するURLを組み立てる純関数。

const CODEX_ORIGIN = "https://coat-codex.com";
const SCRIPTORIUM_API_ORIGIN = "https://scriptorium.coat-codex.com";

/**
 * 詳細レシピID から、codex allowlist パターンと逐語一致する
 * scriptorium詳細APIのURL（`https://scriptorium.coat-codex.com/api/recipes/<id>`）を組み立てる。
 */
export function buildScriptoriumRecipeApiUrl(recipeId: string): string {
  return `${SCRIPTORIUM_API_ORIGIN}/api/recipes/${recipeId}`;
}

/**
 * codexの `?import=` ディープリンクURLを組み立てる（§6-2）。
 * `https://coat-codex.com/?import=` + encodeURIComponent(詳細APIのURL)。
 */
export function buildImportLink(recipeId: string): string {
  const apiUrl = buildScriptoriumRecipeApiUrl(recipeId);
  return `${CODEX_ORIGIN}/?import=${encodeURIComponent(apiUrl)}`;
}
