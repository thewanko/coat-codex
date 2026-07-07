// lib/generateDeletePassword.ts — Scriptorium投稿用の削除PW自動生成サジェスト
// （技術計画v1.3 §6-1「handle入力・削除PW入力（自動生成サジェスト付き）」）
//
// crypto.getRandomValues由来の乱数を英数字（大小英字＋数字の62種）へモジュラス写像する。
// 呼び出しごとに毎回異なる文字列を返す（同一実行内で衝突しないことは保証しないが、
// 十分なエントロピーの乱数源のため実用上問題ない）。

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 既定の生成長（文字数） */
const DEFAULT_LENGTH = 16;

/**
 * 削除PWの自動生成サジェストを返す。crypto.getRandomValues(Uint8Array(length))の
 * 各バイトをALPHABET.length（62）でモジュラス演算し、英数字1文字へ写像する。
 */
export function generateDeletePassword(
  length: number = DEFAULT_LENGTH,
): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
}
