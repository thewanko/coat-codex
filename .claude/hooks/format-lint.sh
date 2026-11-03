#!/bin/bash
# format-lint.sh — PostToolUse Edit|Write: 編集したファイルを prettier で整形し、TS は ESLint の指摘を Claude に渡す
# ブロックはしない (常に exit 0)。編集途中の指摘 (import を先に足した直後の未使用変数など) で作業を止めないため
command -v jq >/dev/null 2>&1 || exit 0
FILE=$(jq -r '.tool_input.file_path // empty')
[ -f "$FILE" ] || exit 0
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
REL="${FILE#"$ROOT"/}"
[ "$REL" = "$FILE" ] && exit 0
cd "$ROOT" || exit 0

# 整形の対象は prettier ゲートと同じ範囲 (apps/ packages/ とルート直下の js/ts/json)
case "$REL" in
  apps/* | packages/*) ;;
  */*) exit 0 ;;
  *.js | *.ts | *.json) ;;
  *) exit 0 ;;
esac
npx prettier --write --ignore-unknown --log-level warn "$REL" >/dev/null 2>&1

case "$REL" in
  *.ts | *.tsx)
    if ! LINT=$(npx eslint --no-warn-ignored "$REL" 2>&1); then
      jq -n --arg ctx "ESLint ($REL):
$LINT" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
    fi
    ;;
esac
exit 0
