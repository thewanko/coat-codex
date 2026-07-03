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

## 委譲・レビューの規律 (lessons.md昇格 2026-07-02)

- 成果物ファイルが重ならないタスクは並列委譲してよい。その際、**互いの成果物ファイル名を明示して不可侵を指示**する
- review委譲時は観点をマイルストーンの性質に合わせて具体化する（ロジック層=境界値・写経テスト検出／データ層=非同期・リソース管理・トランザクション／UI層=デザイン仕様との突き合わせ・a11y）
- impl委譲プロンプトには「仕様の正の§番号」「完了条件のコマンド列とexit code報告義務」「スコープ外ファイルの明示」を必ず含める
- impl委譲が報告なしに終了（切断・上限）したら: `git status`＋全ゲート実行で残骸の完成度を判定 → ①ほぼ完成なら欠落のみセッションglue補完 ②成果物ゼロなら同一プロンプトで再委譲。中途半端な残骸の上への再委譲は禁止 (lessons.md昇格 2026-07-03)

## /goal 条件の規律

- transcript に証跡が現れる形でのみ書く: テストの exit code / ファイル存在 + 全文表示 / review verdict の表示 / 残件数 0
- 「production-ready」「十分に良い」等、機械判定できない表現は禁止
- 必ず `or stop after N turns` を付ける。新種のループは N=2 の calibration から始める

## token 規律

- ループ開始前に `/usage` で 5h 枠・週次枠を確認。収まらないなら開始しない
- 1 ループ完了ごとに `/clear` (goal も消えるので、複数ループを 1 goal に詰め込まない)
- effort は high 始まり。xhigh は「high で 2 回失敗した実装ループ」のみ
- selfcheck は review FAIL がほぼ出ないタスク種別では省略してよい

## 実機検証の規律 (lessons.md昇格 2026-07-03)

根本原因「検証が実利用を代表していない」の再発防止:

- 操作系UIは `document.elementFromPoint(中心座標)` のヒットテストを必ず併用する（`el.click()`直呼びはヒットテストを素通りする）
- 検証シナリオには**機能の分岐を変えるデータバリエーション**（写真あり/なし・0件/複数件）を必ず含める
- アニメーション付きオーバーレイUIは座標検証前に `el.getAnimations().forEach(a => a.finish())`（非表示タブはCSSアニメーションが currentTime=0 で停止する）
- レビューで危険パターンを1箇所指摘したら、同一パターンを Grep で横断適用する（指摘箇所だけ直して他を見ない、は禁止）
- 依存注入でスタブする外部APIには「実装と同じ非同期タイミング（マクロタスク遅延）」のスタブを最低1ケース入れる（Dexie tx罠は即時resolveスタブでは検出できない）

## 安全弁

- impl が同一報告を 3 ターン以上繰り返したら context loss とみなし停止・報告。1 タスク内で 2 回発動したら当該タスクのみセッション直実装に切替え、BAD entry として記録する
- `.claude/loop/lessons.md` で同一根本原因が 2 回目になったら、本ファイル (CLAUDE.md) の該当セクションへルールとして昇格する

## プロジェクト固有 (coat-codex: Vite + React 19 + TypeScript SPA)

- 仕様の正: `docs/coat-codex_技術計画_v2.md`（v2.2）。ビジュアルの正: `docs/design/coat-codex_デザイン仕様書.md`＋`docs/design/handoff/coat-codex 決定デザイン.dc.html`
- テスト: `npm test`（vitest run）
- lint: `npm run lint`（ESLint）。フォーマット確認: `npx prettier --check src`
- ビルド: `npm run build`（tsc -b && vite build）
- 触ってはいけないもの: `docs/coat-codex_要件定義.md`（原典・編集禁止）、`package-lock.json`の手編集、`public/_redirects`と`404.html`は**作成禁止**（§5.2 SPAフォールバック仕様）
- 禁止パターン (selfcheck が Grep する): ハードコードされた API key / password、`console.log(` デバッグ残骸（`console.error`/`console.warn`は可）、`react-router-dom`からのimport（v7は`react-router`単体）、`@ts-ignore`・`eslint-disable`の新規追加
