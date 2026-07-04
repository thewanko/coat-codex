# T43④ 実機フィードバック対応ループ（2026-07-04 ユーザーiPhone実機テスト起点）

7件の指摘。FB-A〜FB-Gとして管理。着手前にユーザー承認を得る。

## FB-A: 合成画像の一括DL → 個別DL化 [優先: 高]

- [ ] 原因確定済み: `ShareDialog.handleDownloadImages` が選択画像を50ms間隔の連続 `anchor.click()` で逐次DL → iOS Safariは2件目以降で「新たにダウンロードを開始しますか？（進行中のDLは停止）」確認を出す
- [ ] ShareImagePreviewの各候補カードに個別「この画像をDL」ボタンを追加（1タップ=1DL）
- [ ] 一括DLボタン（share.downloadImages）は削除し個別DLへ置換（上限4枚なので個別で苦にならない）
- [ ] B系統手順ガイド文言（step1Download）を個別DL前提に改訂
- [ ] 【決定 2026-07-04】SNS導線統合も実施: X/Bluesky 2ボタン→「SNSに投稿」1ボタンへ統合し、ShareDialog内にX/Bluesky切替タブ（文字数カウンタ280/300・Intent URLが追従）。ExportActionBar/ExportSheet/PartReviewDialogの3起点全てを統合形へ。第1弾（個別DL）と同ループ内で実施

## FB-B: PartCardモバイル3段組（パーツ名1文字問題） [優先: 高]

- [ ] 原因確定済み: 1行flexに 名前+工程数+混合バッジ(25%+75%(1:3))+工程レビューボタン+chevron を詰めており、モバイルでnameのellipsisが極端に潰れる
- [ ] <768pxでカード本体を縦3段化: ①パーツ名（フル幅）②使用カラーのスウォッチ四角並び ③「工程N」＋「工程レビュー」行
- [ ] スウォッチ = part.steps[].paints を palette から hex解決・重複除去・出現順・上限8個+「+N」（提案値）
- [ ] 混合バッジ・比率・警告バッジはモバイルでは非表示（色配合は不要=ユーザー指定）。PC幅は現状維持
- [ ] PartCardへ palette（またはswatch解決済み配列）propを追加（PartCardList/RecipeOverviewPage/BASEカード呼び出し元も更新。BASE合成partも自動で同型になる）

## FB-C: 全体画像の後日UP/変更動線 [優先: 中]

- [ ] Setup全体写真セクションに説明文「完成画像は後からアップロード・変更できます」（i18n ja/en）
- [ ] 【決定 2026-07-04】その場ダイアログ案: OverviewHeader付近に「全体写真を変更」ボタン→ダイアログ内でPhotoUploader再利用（overviewPhotoIds編集・updateRecipe結線は既存機構）。useFocusTrap適用・条件付きマウント形態のテストを含める（lessons 2026-07-04参照）

## FB-D: 印刷画面モバイルのヘッダ/フッタ切れ [優先: 中]

- [ ] 原因確定済み: PrintRecipeSheetが幅794px固定でモバイルビューポートを横にはみ出す。AppShellヘッダ・PrintToolbar・フッタはビューポート幅のため途中で切れて見える
- [ ] 画面表示のみシートをビューポート幅へ自動スケール（transform: scale(vw/794)・高さ補正ラッパー。倍率算出はリサイズ追従の小さなJS。CSS calc数値除算はSafari互換が不安定なため不採用）
- [ ] @media print（width:auto）は不変 → 実印刷・PDF出力に影響なし

## FB-E: noteMDボタン「動作していない」 [優先: 中]

- [ ] 実装上はclipboardコピー＋toast＋DLフォールバック済み。iOS実機で無反応に見える原因の切り分けが必要（toast視認性 or clipboard失敗→DLフォールバックの複合）
- [ ] noteMD=クリップボードコピーに一本化（ユーザー方針どおり）。フィードバック強化: ボタン自体を「コピーしました✓」状態表示＋toast併用
- [ ] コピー失敗時はテキスト全文表示ダイアログ（手動選択コピー）へフォールバック（iOSで確実）

## FB-F: 素MDボタン → .mdファイルDL化 [優先: 中]

- [ ] 素MD=クリップボード経路を削除し `downloadBlob`（`<タイトル>.md`）直行へ変更
- [ ] 【決定 2026-07-04】構造を印刷ビュー（PrintRecipeSheet）と同構造へ改訂:
      - `# タイトル` 直下に「全N工程・Nパーツ」の概要行と日付
      - `## PALETTE — 使用カラー`: 色名・ブランド・**hex併記**（印刷のパレット行と同情報）
      - `## TOOLS — 使用ツール`
      - `## BASE — ベース工程（全体）`: 工程は番号付きリスト、行内に技法名・塗料（hex・混合バッジ・≠100警告）・ツール・メモ（印刷の工程行と同情報）
      - `## PART I — パーツ名（工程N)`: パーツごとにローマ数字番号＋工程数、以下同工程形式
      - 写真はMDに埋め込めないため「写真あり」注記は現行維持（印刷の写真セル相当は省略）
      - note MD側（noteMarkdown.ts）は変更しない（note実対応記法制約が別仕様のため）

## FB-G: モバイル「出力・共有」ボタン配置 [優先: 低（検討）]

- [ ] 現状: position:fixed bottomの浮きピル → フッター商標表記に重なる
- [ ] 【決定 2026-07-04】sticky方式: 「出力・共有」ボタンをコンテンツ末尾（パーツ追加の下）へ移し `position: sticky; bottom: 0`。スクロール中は画面下に張り付き、フッター到達で押し上げられ商標表記と重ならない
- [ ] position:fixedの現行.mobileRoot構造を廃止する際、ShareDialogリフトアップ（z:300・pointer-events打ち消し）の暗黙前提を壊さないこと（CLAUDE.md「委譲・レビューの規律」のオーバーレイDOM位置変更ルール適用・出口で全ヒットテスト再確認）

## 実施順・委譲計画

- FB-A統合の決定によりA/E+F/Gが出力系ファイル（useExportActions・ExportActionBar）で重なるため、出力系は直列化する
- Wave 1（並列可・成果物不可侵）: FB-B（PartCard*・PartCardList・RecipeOverviewPageのBASEカード呼び出し）／ FB-D（PrintViewPage*・PrintRecipeSheet.module.css）
- Wave 2: FB-E+F（markdown.ts・useExportActions.ts・i18n）
- Wave 3: FB-A（ShareDialog*・ShareImagePreview*・useExportActions・ExportActionBar・PartReviewDialog・sns/types・i18n）— 本ループ最大。SNS導線統合＋個別DL化
- Wave 4: FB-G（ExportActionBar*・RecipeOverviewPage）→ FB-C（OverviewHeader・新ダイアログ・RecipeSetupPage・i18n）の順で直列（RecipeOverviewPage・i18nが重なるため）
- 各Wave: impl委譲→selfcheck→opusレビュー（UI層観点: デザイン仕様突き合わせ・a11y・修正が無効化する暗黙の前提）→実機ヒットテスト＋実ピクセル検証（iOS再現はviewport 375px＋タッチ系はelementFromPoint 4方向）

## レビュー結果

（実施後に記入）
