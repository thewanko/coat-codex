# coat-codex

npm workspaces の monorepo。アプリは `apps/codex`（Vite + React 19 の SPA、データはブラウザの IndexedDB）と `apps/scriptorium`（Cloudflare Pages + Hono の worker、D1/R2）。共有パッケージは `packages/recipe-core`（schema・logic・exchange・convert）と `packages/recipe-ui`（両アプリ共用の UI 部品）。両アプリとも本番リリース済み。

## コマンド

- テストは Node 20 で実行する。各シェルで先に `eval "$(fnm env)" && fnm use`。このマシンの既定の Node 25 では jsdom の localStorage が非互換で、i18n を使うテストが収集段階で全滅する。
- テスト: `npm test`（全ワークスペース）。1ファイルだけなら `npx vitest run <path>`
- 型検査: `npx tsc -b`（ルートの references で全ワークスペース、約5秒）。vitest は型を検査しないので、テストが緑でも型が通るとは限らない。
- lint: `npm run lint`。整形の確認: `npx prettier --check apps packages "./*.{js,ts,json}"`
- ビルド: `npm run build`
- scriptorium のローカル実機: `npm run dev:pages -w apps/scriptorium`（事前に build。ローカルの D1/R2 は `.wrangler/state`、シードは `node apps/scriptorium/scripts/seed.mjs`）

## 仕様の正

- codex: `docs/coat-codex_技術計画_v2.md`、Scriptorium: `docs/coat-scriptorium_技術計画_v1.md`
- 見た目: `docs/design/coat-codex_デザイン仕様書.md` と `docs/design/handoff/coat-codex 決定デザイン.dc.html`

## 触ってはいけないもの

- `docs/coat-codex_要件定義.md` は原典なので編集しない。
- `package-lock.json` を手で編集しない。
- `apps/codex/public/_redirects` と `404.html` は作らない（SPA フォールバックの仕様、技術計画 §5.2）。デプロイ構成の規則は `.claude/rules/deploy.md`。
- 秘密情報（API キー・パスワード）をコードに書かない。`eslint-disable` を新しく足さない。`console.log`・`react-router-dom` の import（v7 は `react-router` 単体）・`@ts-ignore` は ESLint がエラーにする。

## 作業の進め方

- マイルストーンやタスクに着手するとき、委譲するとき、`/goal` を書くときは `goal-loop` skill を読む。入口で `docs/state.md` と `.claude/loop/lessons.md` を読み、出口で両方を更新する。
- 役割: セッションが設計・実装・裁定を行う。`impl`（Sonnet）は並列にできる独立タスクと機械的な大量変更に、`review`（Opus、読み取り専用）はマイルストーンの diff の独立レビューに使う。同じ作業を委譲しても答えは良くならないので、それ以外では委譲しない。
- UI の動作をブラウザ preview で確かめるときは `ui-verify` skill を読む。
- 未コミットの成果物がある作業ツリーで `git stash`・`git restore`・`git checkout <path>`（`--` の有無を問わない）を使わない。ブランチの切り替えは `git switch` で行う。並列で動く他のエージェントの編集まで巻き戻すため（2回起きた）。一時退避はファイルのコピーで行う。

## Opus 5.5 での運用

- effort は既定の medium で始める。他人のコードのバグ、flaky テスト、スキーマ移行（Dexie の version、D1 マイグレーション）は high に上げる。xhigh と max は、測って効果があった作業だけに使う。
- 依頼にない変更（ついでのリファクタや修正）はしない。気づいたことは報告にとどめる。
- state.md・lessons・PR 本文・報告は短く書く。経緯や証跡の詳細は PR 本文とコミットメッセージへ。
