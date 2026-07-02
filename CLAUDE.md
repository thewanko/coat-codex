# Goal Loop ハーネス

このリポジトリは goal loop engineering で運用する。
役割分離: design / 裁定 = セッション、impl = Sonnet、selfcheck = Haiku、review = Opus。
セッションモデルは固定しない (ループ定義は `--model fable` でも `--model opus` でも同型で動く)。

## 役割分離 (CRITICAL)

- **セッション (あなた) = design と裁定のみ**。実装の本体を書き始めたら役割逸脱 — 停止して impl に委譲し直す
  - 例外: 裁定に必要な軽微な確認 (テスト再実行、1〜2 行の glue 修正) のみ可
- **impl (sonnet)** = 実装。atomic な 1 タスクのみ受ける
- **selfcheck (haiku)** = 機械的事前確認。事実の列挙のみで判断しない
- **review (opus)** = 静的レビュー。read-only
- **/goal evaluator (既定 haiku)** = ループ終了判定

## ループ標準形 (毎ループこの順序)

1. **入口**: `docs/state.md` と `.claude/loop/lessons.md` を Read し、適用できる既存ルールを列挙してから着手
2. **design**: タスクを atomic に分解し、/goal 条件を設計 (検証可能な形でのみ)
3. **impl** subagent に委譲 (1 委譲 = 1 atomic task)
4. **selfcheck** subagent で機械確認 → 異常があれば review に送らず impl に差し戻し
5. **review** subagent で静的レビュー → severity 付き verdict
6. **裁定**: selfcheck / review の結果を読んで採否と次手を決定。**design したターンと裁定のターンを分ける** (作って即裁定しない)
7. **出口**: `docs/state.md` を更新し、`.claude/loop/lessons.md` に good/bad entry を追記。追記内容を出力に表示する

## /goal 条件の規律

- transcript に証跡が現れる形でのみ書く: テストの exit code / ファイル存在 + 全文表示 / review verdict の表示 / 残件数 0
- 「production-ready」「十分に良い」等、機械判定できない表現は禁止
- 必ず `or stop after N turns` を付ける。新種のループは N=2 の calibration から始める

## token 規律

- ループ開始前に `/usage` で 5h 枠・週次枠を確認。収まらないなら開始しない
- 1 ループ完了ごとに `/clear` (goal も消えるので、複数ループを 1 goal に詰め込まない)
- effort は high 始まり。xhigh は「high で 2 回失敗した実装ループ」のみ
- selfcheck は review FAIL がほぼ出ないタスク種別では省略してよい

## 安全弁

- impl が同一報告を 3 ターン以上繰り返したら context loss とみなし停止・報告。1 タスク内で 2 回発動したら当該タスクのみセッション直実装に切替え、BAD entry として記録する
- `.claude/loop/lessons.md` で同一根本原因が 2 回目になったら、本ファイル (CLAUDE.md) の該当セクションへルールとして昇格する

## プロジェクト固有 (ここから下を自プロジェクトに合わせて編集)

- テスト: `python3 -m pytest -q`
- lint: `ruff check . && ruff format --check .`
- 触ってはいけないもの: `.env`、本番接続情報、(追記してください)
- 禁止パターン (selfcheck が Grep する): ハードコードされた API key / password、`print(` デバッグ残骸、(追記してください)
