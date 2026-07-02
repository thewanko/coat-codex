# coat-codex — DesignSystem案（初期値）

> **⚠ 本書は初期値（設計時の資料）です。** デザイン決定稿は [coat-codex_デザイン仕様書.md](coat-codex_デザイン仕様書.md) と [theme.css](theme.css)（2026-07-02納品）が正。値・仕様が食い違う場合は決定稿に従うこと。

> 本書はcoat-codexのビジュアルデザイン検討（Claude Design）用資料の一部です。3点セット: [依頼プロンプト](coat-codex_ClaudeDesign_プロンプト.md)／[DesignSystem初期値](coat-codex_DesignSystem.md)／[画面テンプレート](coat-codex_画面テンプレート.md)。機能仕様の原典は [技術計画v2](../coat-codex_技術計画_v2.md)。



> **本ドキュメントの全トークン値・スタイル方針は「Claude Designが上書きしてよい初期値（プレースホルダ）」である。** ただし**変数名（ケバブケースCSS変数）とコンポーネントの構成・バリアント一覧は実装契約**であり、Claude Designは値を差し替え、変数を追加できるが、既存変数名の削除・改名はしないこと。実装側は `src/styles/theme.css` に本定義を置き、全コンポーネントはこの変数のみを参照する。

## B-1. デザイントークン（CSSカスタムプロパティ）

### B-1-1. カラーパレット（秘伝書テーマ候補値）

**推奨: ライトテーマのみで初期リリース。** 理由: (1) 羊皮紙＝ライトがテーマそのもの (2) 色見本の見えの一貫性確保が最優先 (3) 印刷はライト前提。ただし下記のとおり全色をセマンティック変数に集約してあるため、将来 `[data-theme="dark"]` での再定義だけでダーク対応可能な構造とする（ダーク時もスウォッチ中立領域 `--color-swatch-*` は白基調を維持すること）。

```css
:root {
  /* ---- 基調: 羊皮紙 × 墨 ---- */
  --color-bg: #F6F0E2;              /* 画面地（羊皮紙） */
  --color-bg-raised: #FCF8EE;       /* カード・パネル面（一段明るい紙） */
  --color-bg-sunken: #EDE3CD;       /* 入力欄・くぼみ・帯 */
  --color-bg-backdrop: rgba(43, 36, 28, 0.55); /* モーダル背景 */
  --color-ink: #2B241C;             /* 主要テキスト（墨） */
  --color-ink-muted: #6B5F4D;       /* 補助テキスト（褪せた墨） */
  --color-ink-faint: #9A8D75;       /* プレースホルダ・無効 */
  --color-line: #D5C8AB;            /* 罫線・区切り */
  --color-line-strong: #A69576;     /* 強調罫・入力枠 */

  /* ---- アクション ---- */
  --color-accent: #7A2E1F;          /* 封蝋レッド: 主ボタン・アクティブ */
  --color-accent-hover: #632418;
  --color-accent-contrast: #FDF9F0; /* accent上の文字色 */
  --color-gold: #8F6B2E;            /* アンティークゴールド: 選択・装飾罫・章題 */
  --color-gold-soft: #C9A85C;       /* 金箔の淡いハイライト */
  --color-link: #5A3A24;            /* テキストリンク（古書の茶墨） */

  /* ---- 状態 ---- */
  --color-success: #3E6B4F;         /* 保護有効・保存成功 */
  --color-success-bg: #E3EDE3;
  --color-warning: #8F5A14;         /* 保護なし・バックアップ促し */
  --color-warning-bg: #F5E8CE;
  --color-danger: #A73121;          /* 削除・エラー */
  --color-danger-bg: #F5DDD5;
  --color-info: #3B4A6B;            /* 案内 */
  --color-info-bg: #E3E7F0;

  /* ---- 色見本まわり（テーマ非依存・中立領域。ダーク対応時も不変） ---- */
  --color-swatch-frame: #FFFFFF;            /* スウォッチ台紙 */
  --color-swatch-border: rgba(0, 0, 0, 0.18);
  --color-swatch-checker: #E0E0E0;          /* hex未指定時の市松 */

  /* ---- フォーカス ---- */
  --color-focus-ring: #3B4A6B;
  --focus-ring: 0 0 0 3px rgba(59, 74, 107, 0.45);
}
```

コントラスト参考（初期値時点）: `--color-ink` on `--color-bg` ≈ 11:1、`--color-ink-muted` on `--color-bg` ≈ 5:1、`--color-accent-contrast` on `--color-accent` ≈ 8:1（いずれもAA充足。値を差し替える場合も同水準を維持すること）。

### B-1-2. タイポグラフィ

```css
:root {
  /* 見出し: セリフ（欧文Garamond系→和文明朝系）。Google Fonts想定・サブセット配信 */
  --font-family-display: "EB Garamond", "Shippori Mincho", "Hiragino Mincho ProN",
                         "Yu Mincho", serif;
  /* 本文・UI: サンセリフ（実用性優先） */
  --font-family-body: "Inter", "Noto Sans JP", "Hiragino Kaku Gothic ProN",
                      "Yu Gothic", sans-serif;
  /* 数値・hex・混合比: 等幅 */
  --font-family-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --font-size-xs: 0.75rem;    /* 12px: 注記・キャプション */
  --font-size-sm: 0.875rem;   /* 14px: 補助・バッジ・メタ情報 */
  --font-size-md: 1rem;       /* 16px: 本文・入力（iOSズーム回避のため入力は16px未満禁止） */
  --font-size-lg: 1.125rem;   /* 18px: 小見出し・カードタイトル */
  --font-size-xl: 1.375rem;   /* 22px: 画面見出し */
  --font-size-2xl: 1.75rem;   /* 28px: レシピタイトル */
  --font-size-3xl: 2.125rem;  /* 34px: Homeヒーロー（PCのみ） */

  --line-height-tight: 1.3;   /* 見出し */
  --line-height-body: 1.7;    /* 和文本文（英文は1.5に落としてよい） */

  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;
}
```

### B-1-3. spacing / radius / shadow / サイズ

```css
:root {
  /* 4pxベーススケール */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;

  /* 角丸: 「印刷物」寄りの控えめな値を初期値とする */
  --radius-xs: 2px;    /* バッジ・チップ */
  --radius-sm: 4px;    /* 入力・小ボタン */
  --radius-md: 8px;    /* カード・ダイアログ */
  --radius-lg: 14px;   /* 写真・大パネル */
  --radius-full: 999px;/* ピル・ドット */

  /* 影: 紙の浮きを表す淡い墨影 */
  --shadow-1: 0 1px 2px rgba(43, 36, 28, 0.10);              /* カード静止 */
  --shadow-2: 0 2px 8px rgba(43, 36, 28, 0.14);              /* ホバー・バー */
  --shadow-3: 0 8px 24px rgba(43, 36, 28, 0.20);             /* ドラッグ中・モーダル */

  /* サイズ・レイアウト定数 */
  --size-touch-target: 44px;    /* 最小タッチ領域 */
  --size-swatch-sm: 16px;
  --size-swatch-md: 24px;
  --size-swatch-lg: 40px;       /* 印刷では更に拡大 */
  --container-max: 960px;       /* 本文コンテナ最大幅 */
  --panel-width: 480px;         /* PCスライドインパネル幅 */
  --actionbar-height: 64px;     /* ExportActionBar（モバイル下部固定） */
}
```

**ブレークポイント（CSS変数はメディアクエリに使えないため定数として文書定義）**: `768px` 未満＝モバイル（PartEditorフルページ）／`768px` 以上＝PC（スライドインパネル）／`1200px` 以上＝ワイド（Homeグリッド3〜4列）。

## B-2. コンポーネントインベントリ

画面構成（§3確定版）から必要な全UI部品。**部品名とバリアント構成は実装契約、見た目は初期案。**

| 部品 | バリアント | 用途・備考 |
|---|---|---|
| **Button** | `primary`（封蝋レッド: make codex!・共有実行）/ `secondary`（枠線: インポート・DL）/ `ghost`（低強調: あとで・キャンセル）/ `danger`（削除確定）/ `icon`（メニュー⋮・閉じる✕・追加＋）。サイズ `md`/`sm` | 高さ最小44px（sm=36pxはPCのみ）。ラベル可変幅 |
| **Card** | `recipe`（Home一覧: サムネ＋タイトル＋更新日＋未バックアップドット＋⋮メニュー）/ `part`（Overview: ドラッグハンドル＋サムネ＋名前＋工程数＋混合バッジ列）/ `step`（Editor: ハンドル＋番号＋技法＋塗料スロット群＋混合比＋ツール＋メモ）| すべて `--color-bg-raised` 面＋`--shadow-1`。dragging時 `--shadow-3`＋僅かな傾き可 |
| **Input** | `text` / `textarea`（メモ）/ `select`（技法・ブランド・カラー・ツール。検索可能コンボボックス）/ `number`（%）/ `ratio`（A:B書式）| 背景 `--color-bg-sunken`、フォーカスで `--focus-ring`。フォント16px以上 |
| **SwatchChip** | サイズ `sm`/`md`/`lg`。`hex`（べた塗り）/ `photo`（カラーチップ写真）/ `empty`（市松＝未指定）| **白台紙 `--color-swatch-frame` 上に表示、テーマ色の影響禁止**。常に名前（＋lgではhex）併記 |
| **Badge / Chip** | `mix`（「60% + 40% (3:2)」等幅フォント）/ `technique`（工程名チップ: BaseStepOverlay・PartCard内）/ `status-success`（データ保護: 有効）/ `status-warning`（保護なし）/ `count`（工程数、および**使用数「N工程で使用中」: PaletteEditor/ToolListEditor行で使用**）/ `dot`（未バックアップの点） | radius `--radius-xs` または `--radius-full` |
| **Dialog / Modal** | `confirm`（削除確認）/ `share`（ShareDialog: 画像プレビュー＋テキスト＋2系統UI）/ `error-detail`（インポート検証エラー詳細） | backdrop=`--color-bg-backdrop`。モバイルはボトムシート化可 |
| **Toast** | `success`（保存済み・エクスポート完了）/ `error` / `info` | ToastHost経由。自動消滅、errorは手動閉じ |
| **Banner** | `reminder-full`（Home全幅: エクスポート促し＋「あとで」）/ `reminder-compact`（Overview帯: ワンタップJSONエクスポート）/ `storage-warning`（Safari 7日消去警告文） | warning系配色 |
| **StorageStatusBar** | `healthy`（1行の控えめ表示）/ `warning`（保護なし展開表示）/ `unsupported`（バッジ非表示＋警告文） | バッジ＋使用量＋最終エクスポートの複合部品 |
| **PhotoUploader / Gallery** | `uploader`（D&D＋タップ追加・並び替え・削除・**先頭＝代表マーク**）/ `gallery`（PartEditor: ＋タイル付きサムネ列）/ `strip`（Overview: 横スクロールサムネ）/ `readonly-thumb`（baseモード） | 写真は `--radius-lg`、フィルタ加工禁止 |
| **SortableList** | `part-cards`（Overview）/ `steps`（Editor: ハンドル＋上下移動ボタン併設） | dnd-kit。dragging / drag-over / keyboard-focus の3状態を定義 |
| **BaseStepOverlay** | `filled`（技法チップ列＋編集ボタン）/ `empty`（「＋ベース工程を追加」） | 写真上の半透明帯。写真の視認性を損なわない濃度で、かつテキストAA維持 |
| **PaintSlot** | `A`〜`E` 行部品: スロットラベル＋BrandSelect＋ColorSelect＋SwatchChip＋削除✕ | 最大5行＋「＋塗料追加」 |
| **MixRatioInput** | `%`欄と`A:B`欄の連動ペア（%直入力→比率クリア／比率入力→%自動計算表示） | 等幅フォント。連動挙動が分かるUI |
| **PaletteEditor / ToolListEditor行** | `deletable`（使用数0: 削除✕活性）/ `in-use`（**使用数バッジ=Badge count「N工程で使用中」＋削除✕disabled＋無効理由の提示**） | Setup画面の使用カラー・使用ツール一覧の行部品。**「無条件削除可（✕常時活性）」の表現は機能要件違反のため不可**（技術計画v2 §2.6） |
| **ActionBar** | `export`（Overview下部: 印刷・PDF・X・Bluesky・note MD・**JSON+素MD隣接**。モバイル=下部固定、PC=インライン可）/ `print-toolbar`（PrintView上部、印刷時非表示） | 7アクションのグルーピングはデザイン裁量（JSON/素MD隣接のみ必須） |
| **CharCounter** | `x`（重み付き280）/ `bluesky`（300 grapheme）。`ok` / `over`（警告色＋自動トリムボタン） | ShareDialog内 |
| **LanguageSwitcher** | ja/en セグメントコントロール | ヘッダー常設 |
| **AppFooter** | 通常 | `/terms` リンク常設 |
| **EmptyState** | `home`（レシピ0件）/ `parts`（パーツ0件）/ `steps`（工程0件） | 秘伝書テーマの演出どころ |
| **Skeleton** | `card` / `photo` | IndexedDB読込中 |
| **SlideInPanel** | PC幅のPartEditorコンテナ（右から `--panel-width`、backdrop半透明） | モバイルでは使用しない |

---
---