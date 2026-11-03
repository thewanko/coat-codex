#!/bin/bash
# typecheck-gate.sh — impl の Stop (実行時は SubagentStop): この impl が編集した TS ファイルに型エラーがあれば終了を1回だけ差し戻す (exit 2)
# 並列で動く他の impl の編集途中ファイルのエラーでは止めない。判定対象は agent_transcript_path から拾った Edit/Write 先だけ
# Bash で書き換えたファイルと、型の変更が波及した未編集ファイルは見ない (セッションの裁定で npx tsc -b を再実行する)
command -v jq >/dev/null 2>&1 || exit 0
INPUT=$(cat)
# 差し戻しは1回だけ。2回目の終了は通す (自分の範囲で直せないエラーで抜けられなくなるのを防ぐ)
[ "$(jq -r '.stop_hook_active // false' <<<"$INPUT")" = true ] && exit 0
ROOT="${CLAUDE_PROJECT_DIR:-$(jq -r '.cwd // empty' <<<"$INPUT")}"
cd "$ROOT" || exit 0
TRANSCRIPT=$(jq -r '.agent_transcript_path // empty' <<<"$INPUT")
TRANSCRIPT="${TRANSCRIPT/#\~/$HOME}"
[ -f "$TRANSCRIPT" ] || exit 0

EDITED=$(jq -r 'select(.type == "assistant") | .message.content[]?
  | select(.type == "tool_use" and (.name == "Edit" or .name == "Write" or .name == "MultiEdit"))
  | .input.file_path // empty' "$TRANSCRIPT" 2>/dev/null |
  while IFS= read -r f; do
    f="${f#"$ROOT"/}"
    [[ "$f" == *.ts || "$f" == *.tsx ]] && printf '%s\n' "$f"
  done | sort -u)
[ -n "$EDITED" ] || exit 0

OUT=$(npx tsc -b --pretty false 2>&1) && exit 0
# tsc のエラー行は "path(line,col): error ..."。path の完全一致で、この impl が編集したファイルの行と、それに続く字下げの説明行を拾う
ERRS=$(awk -F'(' 'NR == FNR { edited[$0]; next } /^[^ ]/ { p = ($1 in edited) } p' <(printf '%s\n' "$EDITED") <(printf '%s\n' "$OUT"))
[ -n "$ERRS" ] || exit 0
{
  echo "npx tsc -b で、あなたが編集したファイルに型エラーがあります。直してから完了を報告してください。他のタスクの変更が原因で自分の範囲では直せない場合は、直さずにその旨を報告して終わってください:"
  head -40 <<<"$ERRS"
} >&2
exit 2
