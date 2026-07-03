// lib/exporters/markdownSanitize.ts — Markdownエクスポータ用の最小サニタイズ（M5レビューRound1修正3、Round2修正）
//
// markdown.ts/noteMarkdown.tsが挿入する自由入力文字列（recipe.title・step.memo・色名/ツール名等）は
// 無エスケープで挿入されていた。title の行頭 `#` で見出し崩れ、memo 内改行で
// リスト構造破壊（改行後の行が独立したMarkdown行として解釈される）が起こり得る。
//
// 方針（過剰な全記号エスケープはしない。人間可読出力が目的）:
//   1. 改行（\r\n・\r・\n）は空白1個へ畳み込む。これにより挿入文字列が複数のMarkdown行へ
//      分裂すること自体を防ぐ（リスト構造破壊・偽の見出し行挿入の根本対策）。
//   2. 畳み込み後、文字列の先頭がMarkdown構文として作用し得る記号（見出し#・箇条書き記号・
//      引用>・数字リスト等）で始まる場合のみ、その先頭に半角スペース1個を挿入して無害化する
//      （行頭スペース1個は多くのMarkdownパーサで段落扱いのまま見出し・箇条書き解釈を外す
//      枯れた方法。ゼロ幅スペース〈U+200B〉と異なり、note.com等へのコピペで不可視文字が
//      残留する副作用がない。レビューRound2で指摘を受けこの方式へ変更）。

const LEADING_MARKDOWN_MARKER_RE = /^(\s*)([#>*+-]|\d+[.)])/;

/**
 * Markdownエクスポータへ挿入する自由入力文字列を最小サニタイズする。
 * - 改行はすべて空白1個へ畳み込む（挿入文字列が複数行に分裂しないようにする）
 * - 畳み込み後、行頭がMarkdown構文記号（#見出し・箇条書き記号・引用>・数字リスト）の場合、
 *   その前に半角スペース1個を挿入して構文としての解釈を無害化する
 */
export function sanitizeMarkdownText(value: string): string {
  const collapsed = value.replace(/\r\n|\r|\n/g, " ");
  const match = LEADING_MARKDOWN_MARKER_RE.exec(collapsed);
  if (!match) return collapsed;

  const [, leadingSpace, marker] = match;
  return " " + leadingSpace + marker + collapsed.slice(match[0].length);
}
