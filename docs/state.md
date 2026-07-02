# state — ループの背骨

セッションは毎ループの入口で本ファイルを Read し、出口で更新する。
モデルはセッションを跨ぐと忘れるが、このファイルは忘れない。

最終更新: 2026-07-02 (loop: M0-foundation)

## 完了

- 2026-07-02: 計画フェーズ — 技術計画v2.2確定（3観点レビュー約30件＋デザイン決定稿§8の提案A/B反映済み）。デザイン引き継ぎ資料＋決定稿一式は docs/design/
- 2026-07-02: **M0 基盤（T1〜T6）** — Vite+React19+TS scaffold（§4.1固定バージョン）／React19×dnd-kit採用確定（core@6.3.1+sortable@10、StrictMode動作確認済み）／react-router v7全7ルート／i18n ja/en＋localStorage永続化／AppShell＋theme.css結線＋基底部品（EmptyState・Skeleton・ToastHost）／wrangler.toml＋SPAフォールバック検証。出口一括opusレビュー Round 1 PASS（C0/H0/M1/L3。M1=favicon参照は修正済み）

## 進行中

- (なし)

## 次の候補 (優先順)

1. **M1 純ロジック層**（T7〜T11: mixRatio.ts関数群／techniques.ts／models/recipe.ts zodスキーマ＝不変条件1〜20／recipeRefs.ts／importRecipe.ts。§4.2のとおりUIなしテスト完結）
2. M2 データ永続層（T12〜: Dexie 3テーブル・photoStore・storageHealth。fake-indexeddb導入済み）
3. Cloudflare Pages GitHub連携の初回デプロイ（§5.5。ダッシュボード操作＝**ユーザー作業**）

## 決定事項 (変更には理由が要る)

- 仕様の正 = docs/coat-codex_技術計画_v2.md（v2.2）。ビジュアルの正 = デザイン仕様書＋決定デザインdc.html＋theme.css（**無改変**で src/styles/ へコピー済み。改変は決定稿の改訂を経ること）
- @dnd-kit/core@6.3.1 + @dnd-kit/sortable@10.0.0 で確定（新@dnd-kit/reactは見送り）
- レビュー運用: コンフィグ中心のマイルストーンはタスク毎selfcheck省略・出口で一括opusレビュー（ロジック層M1からはタスク毎の規律に戻すか出口で判断）

## 申し送り (次セッションの自分へ)

- ToastHost: successの自動消滅タイマーがclearTimeout管理されていない（レビューLow）。手動閉じUI追加時に対応（M4）
- favicon: vite.svg参照は削除済み。正式には封蝋logo.svg（デザイン仕様書§7=唯一のSVG供給アセット）を作成してindex.htmlへ結線（M4/M7）
- i18n永続化キーは独自の `coat-codex:lang`。LanguageDetector導入時は標準`i18nextLng`との整合に注意（レビューLow）
- devサーバープレビューは .claude/launch.json の `coat-codex-dev`（port 5173）
