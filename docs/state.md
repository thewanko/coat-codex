# state — ループの背骨

セッションは毎ループの入口で本ファイルを Read し、出口で更新する。
モデルはセッションを跨ぐと忘れるが、このファイルは忘れない。

最終更新: 2026-07-02 (loop: M2-data 完了)

## 完了

- 2026-07-02: 計画フェーズ — 技術計画v2.2確定（3観点レビュー約30件＋デザイン決定稿§8の提案A/B反映済み）。デザイン引き継ぎ資料＋決定稿一式は docs/design/
- 2026-07-02: **Cloudflare Pages本番デプロイ** — coat-codex.pages.dev（Pages Git連携）。本番で `/`・`/terms`・深いURL直接アクセスの200＋SPAフォールバックを確認。※初回に誤ってWorkers Buildsで作成→Pagesで作り直し（§5.5の注意点として学び）
- 2026-07-02: **カスタムドメイン設定** — https://coat-codex.com （Cloudflare Pages Custom domains。SSL・深いURLフォールバック確認済み。要件定義の「ドメイン取得可否は別途確認」は解決。www側は未設定=任意）
- 2026-07-02: **M2 データ永続層（T12〜T15）** — Dexie 3テーブル＋recipeStore（lazy migration5分岐・書き戻しtx化）／imageProcessing（§2.6の4段規則・依存注入設計・canvas実機4経路確認済み）／photoStore（objectURLキャッシュrevoke・GC tx化・StorageQuotaError変換）／storageHealth（persist/estimate・meta3キー・リマインダー純関数=14日/7日境界）。2回の並列委譲。opusレビューRound 1 PASS（C0/H0/M0/L3→全件反映）。計212+テスト
- 2026-07-02: **M1 純ロジック層（T7〜T11）** — mixRatio全12関数（§2.4の50ケース）／techniques10種＋i18n／recipe.ts zodスキーマ=不変条件1〜20を[INV-nn]付きsuperRefineで実装（受理/拒否49ケース）／recipeRefs／migrations（レジストリ注入・多段チェーン・欠落throw）。T10/T11は並列委譲。opusレビューRound 1 PASS（C0/H0/M2/L3→全5件反映済み）。計137テスト
- 2026-07-02: **M0 基盤（T1〜T6）** — Vite+React19+TS scaffold（§4.1固定バージョン）／React19×dnd-kit採用確定（core@6.3.1+sortable@10、StrictMode動作確認済み）／react-router v7全7ルート／i18n ja/en＋localStorage永続化／AppShell＋theme.css結線＋基底部品（EmptyState・Skeleton・ToastHost）／wrangler.toml＋SPAフォールバック検証。出口一括opusレビュー Round 1 PASS（C0/H0/M1/L3。M1=favicon参照は修正済み）

## 進行中

- (なし。M2のPRマージ待ち)

## 次の候補 (優先順)

1. M3 塗料プリセット＆入力部品（T16〜: **プリセットJSONデータ整備を含む — 収録範囲は§6未決事項。着手時にユーザー確認が必要**（3ブランド×何色か））
2. M4 編集画面（新規作成→Setup→Overview→パーツ/ベース工程編集の全フロー。デザイン決定稿dc.htmlとの突き合わせ開始点）

## 決定事項 (変更には理由が要る)

- 仕様の正 = docs/coat-codex_技術計画_v2.md（v2.2）。ビジュアルの正 = デザイン仕様書＋決定デザインdc.html＋theme.css（**無改変**で src/styles/ へコピー済み。改変は決定稿の改訂を経ること）
- @dnd-kit/core@6.3.1 + @dnd-kit/sortable@10.0.0 で確定（新@dnd-kit/reactは見送り）
- プリセット塗料ブランドは**Citadel／Vallejo／AK／Coat d'arms**の4種（2026-07-02決定）。Coat d'armsマスタは docs/paints/coatdarms-master.json（全150色。hexは目視推定→M3で校正）。他3ブランドの収録数は未決（M3着手時に確認、既定は各50〜100色）
- レビュー運用: コンフィグ中心のマイルストーンはタスク毎selfcheck省略・出口で一括opusレビュー（ロジック層M1からはタスク毎の規律に戻すか出口で判断）

## 申し送り (次セッションの自分へ)

- **商標表記**（docs/legal/coat-codex_商標表記.md、2026-07-02ユーザー納品）: T35でTermsPage長文＋AppFooter短文として実装。連絡先=**contact@coat-codex.com**確定済み。**受信転送の設定（Cloudflare Email Routing等）が公開前に必要=ユーザー作業**。商用要素追加前は専門家レビュー推奨の注記あり
- ToastHost: successの自動消滅タイマーがclearTimeout管理されていない（レビューLow）。手動閉じUI追加時に対応（M4）
- favicon: vite.svg参照は削除済み。正式には封蝋logo.svg（デザイン仕様書§7=唯一のSVG供給アセット）を作成してindex.htmlへ結線（M4/M7）
- i18n永続化キーは独自の `coat-codex:lang`。LanguageDetector導入時は標準`i18nextLng`との整合に注意（レビューLow）
- devサーバープレビューは .claude/launch.json の `coat-codex-dev`（port 5173）
- **Worker側 `coat-codex` の削除はペンディング**（2026-07-02: ダッシュボードに削除項目が表示されない事象。ただし**Git接続は解除済み**のため失敗ビルドは発生せず実害なし。空のWorkerが残っているだけ。気が向いたら `npx wrangler login` 後に `npx wrangler delete --name coat-codex` でも消せる）
