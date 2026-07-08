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
- **新規/変更した`.ts`/`.tsx`を含むimpl委譲の完了条件には`npm run build`(tsc型検査)を必ず入れる。かつセッションは裁定で`npm run build`と`npm run lint`を独立再実行し、implのexit-code報告を鵜呑みにしない**（vitestはesbuild/isolatedModulesで型を検査せず「テスト緑」がtsc緑を代表しない。tsc増分キャッシュ〔tsBuildInfo〕や楽観報告で「build exit 0」が偽になり得る）。テストで`vi.fn`の呼び出し引数を`.mock.calls`検証する場合、変数へ関数型注釈を付けず`vi.fn<(a: A, b: B) => R>()`のジェネリック形で型付けする（注釈はMock型を消す・`_`接頭辞の未使用引数はこのリポジトリのeslintで非許容） (lessons.md昇格 2026-07-08: ST-18〔完了条件にtsc未課〕・ST-21〔tsc課すもimpl報告が不正確〕で同根2回目)
- impl委譲が報告なしに終了（切断・上限）したら: `git status`＋全ゲート実行で残骸の完成度を判定 → ①ほぼ完成なら欠落のみセッションglue補完 ②成果物ゼロなら同一プロンプトで再委譲。中途半端な残骸の上への再委譲は禁止 (lessons.md昇格 2026-07-03)
- レビュー指摘・タスク前提の事実（原因箇所・修正案の前提・再利用部品の能力）は、impl委譲前にセッションがRead/Grep/実機再現で1次確認する。前提と実態が食い違ったら（例: 「未実装」とされた対策が実装済み）委譲せず真因を確定してからdesignし直す (lessons.md昇格 2026-07-05)
- レビュー指摘の修正バッチ後は必ず同一レビュアーでRound N+1判定を取り、「修正同士の複合作用・修正が導入した新規問題」を明示観点に含める。修正がUI状態管理（key・effect・確定タイミング）やオーバーレイUIのDOM位置（リフトアップ・portal化・レンダー先変更・ネストルート化等のマウント構造変更）に触れる場合は、「修正が無効化した暗黙の前提」（z-index序列・スタッキング文脈・イベント伝播経路）を観点に明示し、出口実機検証のヒットテストで全インタラクティブ要素を再確認する (lessons.md昇格 2026-07-03)

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
- 検証シナリオには**機能の分岐を変えるデータバリエーション**（写真あり/なし・0件/複数件・**旧schemaVersion文書の混在**〔スキーマ昇格タスクでは必須。fixture全新版のユニットテストではDB読み出し経路のマイグレーション欠落を検出できない〕）を必ず含める (2026-07-05追記)
- アニメーション付きオーバーレイUIは座標検証前に `el.getAnimations().forEach(a => a.finish())`（非表示タブはCSSアニメーションが currentTime=0 で停止する）
- レビューで危険パターンを1箇所指摘したら、同一パターンを Grep で横断適用する（指摘箇所だけ直して他を見ない、は禁止）
- 依存注入でスタブする外部APIには「実装と同じ非同期タイミング（マクロタスク遅延）」のスタブを最低1ケース入れる（Dexie tx罠は即時resolveスタブでは検出できない）
- ブレークポイントでレイアウトが分岐するUI（パネル/フルページ切替等）の検証は、**全ブレークポイント幅**で「遷移後に視認している画面」への elementFromPoint ヒットテストを行う。URL遷移の成立だけで合格にしない（目的のUIが画面外・背面で操作不能なことがある） (lessons.md昇格 2026-07-04)
- **実機入力・OS権限に依存する挙動**（clipboard・Web Share・通知・実タッチのスクロール競合/touch-action・user activation）は**previewの合成イベント/権限モデルでは代表できない**。①設計段階で「結果分岐に依存しない多段防御」（タイムアウト付きフォールバック・bodyロック等、どの経路でも意図した結果へ到達する形）を要求仕様に含め、②preview検証の限界を出口レポートに明示し「ユーザー実機確認が必須の項目」として引き渡す (lessons.md昇格 2026-07-05)
- **出力フォーマット/コーデックを指定するWeb API**（canvas.toBlob/toDataURL・MediaRecorder mimeType等）は**ベストエフォート仕様＝非対応形式でもエラーにならず別形式へ静かに縮退**する（例: SafariはcanvasのWebPエンコード非対応→PNGフォールバック）＝**previewのChromiumが実機Safariのコーデック対応を代表しない**。①指定形式の全対象ブラウザ対応（特にWebKit）を設計段階でcaniuse等で1次確認し、可能なら全ブラウザ共通形式（写真=JPEG）へ寄せて分岐自体を消す ②送信メタデータ（File type/拡張子）は宣言ハードコードでなく実blob.typeから導出する ③バイナリを受けるAPI境界はcontent-type宣言でなく実バイトのマジックバイトで検証する (lessons.md昇格 2026-07-08: 2026-07-05の環境ギャップfamily 2回目=コーデック相)
- **デプロイ構成（Pagesのビルド設定・Functions/_worker.js検出・SPAフォールバック・リダイレクト）はローカル`wrangler pages dev`が本番Gitビルドを代表しない**（例: pages devはwrangler.toml隣接のfunctions/を拾うが、本番はRoot directory相対でしか探さない）。デプロイ構成に触れる変更は、マージ後の**本番/プレビューURLで「追加機能の正常応答」と「非APIルートのHTML 200＋root要素実在」の両方**を確認するまで完了としない。結合検証の否定アサーション（grep -c 0等）は必ず正例アサーションと対にする (lessons.md昇格 2026-07-07) 

## 安全弁

- impl が同一報告を 3 ターン以上繰り返したら context loss とみなし停止・報告。1 タスク内で 2 回発動したら当該タスクのみセッション直実装に切替え、BAD entry として記録する
- `.claude/loop/lessons.md` で同一根本原因が 2 回目になったら、本ファイル (CLAUDE.md) の該当セクションへルールとして昇格する

## プロジェクト固有 (coat-codex: npm workspaces monorepo / Vite + React 19 + TypeScript SPA)

- 構成: monorepo（S0移行済み 2026-07-07）。アプリ本体 = `apps/codex/`・`apps/scriptorium/`（S3基盤済み 2026-07-07: SPA scaffold＋D1/R2＋Hono GET閲覧API＋Feed/Detail/法務ページ＋OGP。**サーバーは`dist/_worker.js`方式（advanced mode）のみ**=src/server/worker.tsをesbuildでバンドル。`functions/`ディレクトリはRoot=`/`構成の本番Gitビルドで検出されず【ローカルpages devでは検出できる=環境差】、catch-allは静的アセット遮蔽のため、いずれも禁止）、共有パッケージ = `packages/recipe-core`（S1切り出し済み 2026-07-07: schema/logic/exchange/convert）・`packages/recipe-ui`（S2切り出し済み 2026-07-07: SwatchChip注入化・CroppedPhoto・theme.css・MixBadge/TechniqueChip/StepListView・PhotoSourceProvider/usePhotoUrl・REQUIRED_I18N_KEYS。codexはApp.tsxでresolvePhotoUrlを注入）。ルートは設定と委譲スクリプトのみ
- 仕様の正: codex = `docs/coat-codex_技術計画_v2.md`（v2.4）／Scriptorium = `docs/coat-scriptorium_技術計画_v1.md`（v1.3）。ビジュアルの正: `docs/design/coat-codex_デザイン仕様書.md`＋`docs/design/handoff/coat-codex 決定デザイン.dc.html`
- scriptoriumローカル実機: `npm run dev:pages -w apps/scriptorium`（wrangler pages dev・要事前build。ローカルD1/R2は`.wrangler/state`共有・シードは`node scripts/seed.mjs`）
- テスト: `npm test`（ルート・vitest projects経由で全workspace）
- lint: `npm run lint`（ESLint）。フォーマット確認: `npx prettier --check apps packages "./*.{js,ts,json}"`
- ビルド: `npm run build`（ルート・--workspaces委譲）
- 触ってはいけないもの: `docs/coat-codex_要件定義.md`（原典・編集禁止）、`package-lock.json`の手編集、`apps/codex/public/_redirects`と`404.html`は**作成禁止**（§5.2 SPAフォールバック仕様）
- 禁止パターン (selfcheck が Grep する): ハードコードされた API key / password、`console.log(` デバッグ残骸（`console.error`/`console.warn`は可）、`react-router-dom`からのimport（v7は`react-router`単体）、`@ts-ignore`・`eslint-disable`の新規追加
