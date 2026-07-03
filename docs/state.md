# state — ループの背骨

セッションは毎ループの入口で本ファイルを Read し、出口で更新する。
モデルはセッションを跨ぐと忘れるが、このファイルは忘れない。

最終更新: 2026-07-03 (loop: official-paint-charts 完了)

## 完了

- 2026-07-03: **プリセット塗料の公式チャート化＋レンジフィルタ** — Citadel 334色（公式サイト由来・8レンジ）／Vallejo 255色（Game/Model）をユーザー提供チャートで差し替え、Coat d'armsにもレンジ付与。AKは除外（チャート入手不可・自由入力で記録可）。レンジフィルタUI（RangeFilter・チップ式）で候補絞り込み対応。実機確認済み・計459テスト。**あわせてv2.3仕様変更を計画に記録: SNS共有はパーツ単位・URL非掲載・#coat-codex必須（M6で実装）**

- 2026-07-02: **M4 編集画面（T16＋T22〜T28）** — useRecipeStore（Zustand・autosave 500ms・D-8既定名補完・INV-12 pending strip・pagehide flush）／HomePage／RecipeSetupPage（PaletteEditor削除ガード=必須事項③）／TechniqueSelect・ToolSelect・MemoField／StepCard＋StepPhotoTile（§8-A）／StepList（dnd-kit）／PartEditorPage（base予約ルート・768pxパネル分岐・StepPhotoStrip）／RecipeOverviewPage（PartCardList D&D・D-1バッジ・ExportActionBar枠）。**実機フロー一巡検証PASS**（新規作成→Setup→Overview→パーツ/ベース編集・リロード永続化・INV-12 strip・必須事項④再現記録）。**opusレビュー2ラウンド**（R1 FAIL: StepPhotoStripスクロール不発High等8件→修正→同一レビュアーR2 PASS: C0/H0/M0/L1）。計446テスト。※T16はM2/M3の番号の谷間で未実装だったことをM4入口で発見し先頭で実装
- 2026-07-02: 計画フェーズ — 技術計画v2.2確定（3観点レビュー約30件＋デザイン決定稿§8の提案A/B反映済み）。デザイン引き継ぎ資料＋決定稿一式は docs/design/
- 2026-07-02: **Cloudflare Pages本番デプロイ** — coat-codex.pages.dev（Pages Git連携）。本番で `/`・`/terms`・深いURL直接アクセスの200＋SPAフォールバックを確認。※初回に誤ってWorkers Buildsで作成→Pagesで作り直し（§5.5の注意点として学び）
- 2026-07-02: **カスタムドメイン設定** — https://coat-codex.com （Cloudflare Pages Custom domains。SSL・深いURLフォールバック確認済み。要件定義の「ドメイン取得可否は別途確認」は解決。www側は未設定=任意）
- 2026-07-02: **M3 塗料プリセット＆入力部品（T17〜T21）** — 4ブランド370色プリセット（Coat d'arms150全色含む）＋paintPresets／SwatchChip・PhotoUploader・ConfirmDialog／PaintPicker（value再同期・palette再利用）／MixRatioInput／PaintSlot(List)（pending基盤・重複ガード）。**opusレビュー3ラウンド**（R1 FAIL: value復元不全等8件→R2 FAIL: 修正起因リグレッション2件→R3 PASS）。実機スパイク検証（src/dev/M3Spike.tsx）でstate正・UI誤の乖離バグを検出。計280テスト
- 2026-07-02: **M2 データ永続層（T12〜T15）** — Dexie 3テーブル＋recipeStore（lazy migration5分岐・書き戻しtx化）／imageProcessing（§2.6の4段規則・依存注入設計・canvas実機4経路確認済み）／photoStore（objectURLキャッシュrevoke・GC tx化・StorageQuotaError変換）／storageHealth（persist/estimate・meta3キー・リマインダー純関数=14日/7日境界）。2回の並列委譲。opusレビューRound 1 PASS（C0/H0/M0/L3→全件反映）。計212+テスト
- 2026-07-02: **M1 純ロジック層（T7〜T11）** — mixRatio全12関数（§2.4の50ケース）／techniques10種＋i18n／recipe.ts zodスキーマ=不変条件1〜20を[INV-nn]付きsuperRefineで実装（受理/拒否49ケース）／recipeRefs／migrations（レジストリ注入・多段チェーン・欠落throw）。T10/T11は並列委譲。opusレビューRound 1 PASS（C0/H0/M2/L3→全5件反映済み）。計137テスト
- 2026-07-02: **M0 基盤（T1〜T6）** — Vite+React19+TS scaffold（§4.1固定バージョン）／React19×dnd-kit採用確定（core@6.3.1+sortable@10、StrictMode動作確認済み）／react-router v7全7ルート／i18n ja/en＋localStorage永続化／AppShell＋theme.css結線＋基底部品（EmptyState・Skeleton・ToastHost）／wrangler.toml＋SPAフォールバック検証。出口一括opusレビュー Round 1 PASS（C0/H0/M1/L3。M1=favicon参照は修正済み）

## 進行中

- (なし。M4のPRマージ待ち)

## 次の候補 (優先順)

1. M5 データ保全＆エクスポート/インポート（T29〜T35）
2. M5送りのM4レビュー事項2件（下記申し送り参照。独立タスク化推奨）

## 決定事項 (変更には理由が要る)

- 仕様の正 = docs/coat-codex_技術計画_v2.md（v2.2）。ビジュアルの正 = デザイン仕様書＋決定デザインdc.html＋theme.css（**無改変**で src/styles/ へコピー済み。改変は決定稿の改訂を経ること）
- @dnd-kit/core@6.3.1 + @dnd-kit/sortable@10.0.0 で確定（新@dnd-kit/reactは見送り）
- プリセット塗料ブランドは**Citadel（334色）／Vallejo（255色）／Coat d'arms（150色）の3種**（2026-07-03改訂: 全色チャート由来・range付き。AKはチャート入手不可で除外=自由入力で記録可、入手次第マスタ方式で復活）。マスタ=docs/paints/*-master.json、収録数未決は解消
- レビュー運用: コンフィグ中心のマイルストーンはタスク毎selfcheck省略・出口で一括opusレビュー（ロジック層M1からはタスク毎の規律に戻すか出口で判断）
- **SNS共有は「全体」「パーツ」の2起点**（2026-07-03決定、v2.3）: 全体=ExportActionBar起点・全体写真＋タイトルの1枚絵候補／パーツ=PartCardメニュー起点・工程ごとの1枚絵（全体画像＋工程写真＋工程情報）候補。**いずれもユーザーが最大4枚選択**（既定=先頭4枚）。投稿テキストにURL非掲載（Xリーチ抑制対策）・`#coat-codex`必須（トリム対象外）。モバイルの下部固定バーは「出力・共有」→ボトムシートへ改善。詳細は計画§3.4冒頭とT37/T39/T40

## 申し送り (次セッションの自分へ)

- **M5送り①（M4レビューR1指摘2・Medium）**: PC幅のPartEditorパネル背面にOverviewが描画されず無地（§3.1は「/recipe/:id 上のパネル」）。機能・データは正常。対応はネストルート＋`<Outlet>`化（router.tsx構造変更）— 影響範囲が広いため独立タスクで
- **M5送り②（M4レビューR1指摘5・必須事項④）**: PaintSlotのkey={colorId}×blurクリック吸われ（実機再現済み: 1クリック吸われ＋中断編集がpalette孤児を生成。確定データ損失なし・孤児はSetupの未使用削除で回収可）。対応はPaintSlot/PaintSlotList（M3確定物）へのスロット固有安定key導入 — M3リグレッション面が開くため独立タスクで
- **M4レビューLow申し送り**: `color-mix()`をRecipeCard.module.cssで初導入（Baseline 2023、Safari 16.2+が実質のブラウザ下限に）／写真表示系のobjectURL未revokeはphotoStore共有キャッシュ設計と整合した意図的挙動／pagehideのflushAutosaveはbest-effort（非同期完了非保証）
- **商標表記**（docs/legal/coat-codex_商標表記.md、2026-07-02ユーザー納品）: T35でTermsPage長文＋AppFooter短文として実装。連絡先=**contact@coat-codex.com**確定済み。**受信転送の設定（Cloudflare Email Routing等）が公開前に必要=ユーザー作業**。商用要素追加前は専門家レビュー推奨の注記あり
- ~~M4結線の必須事項3点~~（M4で充足済み: ①ストアのstripStepPending ②updater参照同一性（テストでtoBe検証） ③PaletteEditor未使用削除UI。④は実機確認の上M5送り②へ）
- ToastHost: successの自動消滅タイマーがclearTimeout管理されていない（レビューLow）。手動閉じUI追加時に対応（M5以降）
- favicon: vite.svg参照は削除済み。正式には封蝋logo.svg（デザイン仕様書§7=唯一のSVG供給アセット）を作成してindex.htmlへ結線（M4/M7）
- i18n永続化キーは独自の `coat-codex:lang`。LanguageDetector導入時は標準`i18nextLng`との整合に注意（レビューLow）
- devサーバープレビューは .claude/launch.json の `coat-codex-dev`（port 5173）
- **Worker側 `coat-codex` の削除はペンディング**（2026-07-02: ダッシュボードに削除項目が表示されない事象。ただし**Git接続は解除済み**のため失敗ビルドは発生せず実害なし。空のWorkerが残っているだけ。気が向いたら `npx wrangler login` 後に `npx wrangler delete --name coat-codex` でも消せる）
