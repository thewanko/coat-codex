// components/common/downloadBlob.ts — BlobをファイルとしてDLさせる共通ヘルパー（T33）
//
// JSONエクスポート（RecipeCardメニュー・ExportActionBar）・素Markdownのファイル保存で共用する。
// objectURLは生成直後にクリックし、即座にrevokeして解放する。

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** レシピタイトルをファイル名として安全な形に整形する（パス区切り等を除去） */
export function sanitizeFilename(title: string): string {
  const trimmed = title.trim();
  const safe = trimmed.replace(/[\\/:*?"<>|]/g, "_");
  return safe.length > 0 ? safe : "recipe";
}
