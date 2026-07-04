// components/common/legacyCopy.ts — document.execCommand("copy")による旧方式コピー
// （2026-07-04 iOS Safari navigator.clipboard.writeTextハング対策）
//
// iOS Safariではnavigator.clipboard.writeTextのPromiseが解決も拒否もせず
// ハングすることが実機で確認された（useExportActions.tsのタイムアウト処理と併用）。
// フォールバックとしてexecCommand("copy")方式を使う。この方式は新しいuser activation
// （直近のクリック/タップ）の間に同期的に呼び出す必要がある。
//
// 2箇所から共用する:
// - useExportActions.ts: 画面外の一時textareaを生成してコピーする（copyTextLegacy）
// - MarkdownCopyFallbackDialog.tsx: ダイアログ内の既存textarea要素を対象にコピーする
//   （copyTextareaLegacy）。どちらも最終的にselectTextareaAndExecCopyへ委譲する。

/**
 * 指定のtextarea要素の全文を選択したうえでdocument.execCommand("copy")を試みる。
 * 呼び出し元がtextarea要素の生成/後始末の責務を持つ（ライフサイクルに関与しない純関数）。
 */
function selectTextareaAndExecCopy(textarea: HTMLTextAreaElement): boolean {
  textarea.focus();
  textarea.setSelectionRange(0, textarea.value.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

/**
 * 既存のtextarea要素（画面に表示されているもの）を対象にコピーする。
 * MarkdownCopyFallbackDialogの「全文をコピー」ボタンなど、ユーザーの新しいタップに
 * よって呼ばれる文脈で使う（transient activationが確実に残っている）。
 */
export function copyTextareaLegacy(textarea: HTMLTextAreaElement): boolean {
  return selectTextareaAndExecCopy(textarea);
}

/**
 * 画面外に一時的なtextareaを生成し、渡された文字列をexecCommand("copy")でコピーする。
 * iOSでズームが発生しないようfont-sizeを16px以上に設定する。
 */
export function copyTextLegacy(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.fontSize = "16px";
  document.body.appendChild(textarea);
  try {
    return selectTextareaAndExecCopy(textarea);
  } finally {
    document.body.removeChild(textarea);
  }
}
