#!/usr/bin/env bash
# goal_loop.sh — usage limit で停止した /goal を窓リセット後に自動再開する wrapper
#
# 使い方:
#   1. 対話セッションで /goal を仕掛けてからセッションを抜ける (active goal は --continue で復元される)
#   2. ./scripts/goal_loop.sh を user が手動起動する (cron / launchd 登録も可)
#
# 環境変数:
#   GOAL_LOOP_MODEL      使用モデル (既定: fable。プロモ終了後 = 2026-07-08 以降は opus 推奨)
#   GOAL_LOOP_MAX_RETRY  再試行上限 (既定: 12 = 15 分 x 12 で最大 3 時間待ち)
#   GOAL_LOOP_POLL       再試行間隔秒 (既定: 900)
#
# 注意: claude CLI に rate-limit 専用の exit code は無いため、
#       本 script はクラッシュと limit を区別できない。再試行上限は必ず維持し、
#       上限到達時は /usage でリセット時刻と週次枠を確認すること。
set -euo pipefail

MODEL="${GOAL_LOOP_MODEL:-fable}"
MAX_RETRY="${GOAL_LOOP_MAX_RETRY:-12}"
POLL="${GOAL_LOOP_POLL:-900}"

i=0
while [ "$i" -lt "$MAX_RETRY" ]; do
  if claude --model "$MODEL" --continue -p "アクティブな /goal を継続する。アクティブな goal が無ければ何もせず終了する"; then
    echo "[goal_loop] 正常終了"
    exit 0
  fi
  i=$((i + 1))
  echo "[goal_loop] 非 0 終了 (limit の可能性)。${POLL}s 後に再試行 (${i}/${MAX_RETRY})"
  sleep "$POLL"
done

echo "[goal_loop] 再試行上限到達。/usage を確認してください" >&2
exit 1
