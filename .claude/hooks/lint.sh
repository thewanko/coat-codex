#!/bin/bash
# lint.sh — PostToolUse Write|Edit: 編集 file に言語別 lint を即時実行 (hint 用、常に exit 0)
# 禁止系 hook は最初から作らない。同種の事故が lessons.md で 2 回目になった時に初めて足す。
command -v jq >/dev/null 2>&1 || exit 0
FILE=$(jq -r '.tool_input.file_path // empty' < /dev/stdin 2>/dev/null)
[ -z "$FILE" ] && exit 0
case "$FILE" in
  *.py)
    if command -v ruff >/dev/null 2>&1; then
      ruff format "$FILE" 2>&1
      ruff check --fix "$FILE" 2>&1 | head -20
    fi
    ;;
  *.sh)
    command -v shellcheck >/dev/null 2>&1 && shellcheck "$FILE" 2>&1 | head -10
    ;;
esac
exit 0
