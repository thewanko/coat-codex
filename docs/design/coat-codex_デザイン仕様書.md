# coat-codex デザイン仕様書 — 決定稿 v1.0

2026-07-02 ／ 方向: **「装飾写本 × 英語ディスプレイ」**（検討キャンバス t2〜t5 反映）
対応ファイル: `theme.css`（トークン一式）／ビジュアルカンプ: `coat-codex デザイン検討.dc.html`

---

## 0. 決定サマリ

- 採用コンセプト: **1b 装飾写本**（朱の章題・金の飾り罫・封蝋モノグラム・二重枠）
- 見出しは **英語ディスプレイ**（EB Garamond）＋和文は小さなgloss。機能ラベル・本文は現行言語（i18n対象）
- Print は **1g 標本箋レイアウト**（罫線台帳・点線リーダー）に封蝋ヘッダを統合（2c）
- カラーパレット・書体は DesignSystem 初期値を維持。変更は `--radius-xs/sm` のみ＋新設トークン（theme.css参照）
- 仕様変更提案 2件を含む（§8: 工程写真1枚紐づけ／MIX%再設計）

---

## 1. ブランド / ワードマーク

| 要素 | 仕様 |
|---|---|
| 封蝋モノグラム | 支給PNG（`coat-codex_logo.png`由来・`src/assets/seal-logo.png`配信。（2026-07-03改訂）CSS描画からの差し替え）。サイズはヘッダ34px／印刷26px／空状態44px |
| ワードマーク | `Coat Codex` EB Garamond 500。**両単語の頭文字Cのみ `--color-accent`**、他は `--color-ink` |
| 和文タグ | 「塗装秘伝書」しっぽり明朝 500、`letter-spacing: var(--tracking-jp-gloss)` |
| 使用箇所上限 | 封蝋モチーフは 1画面4箇所まで（ヘッダ／フッター／印刷ヘッダ／空状態）（2026-07-03改訂: フッターロゴ追加に伴い3→4箇所） |

## 2. 見出しシステム（EN display ＋ JP gloss）

```
[overline]  LIBRARY            ← EB Garamond 600 / 10–11px / tracking .42em / --color-gold
[display]   YOUR CODEX         ← EB Garamond 500 / 48px(PC hero)・30px(mobile)・20–22px(section) / tracking .06em / --color-ink
[gloss]     あなたの秘伝書       ← しっぽり明朝 500 / 11–12px / tracking .4em / --color-ink-muted
[rule]      ───◆───            ← 1px --color-gold-soft ＋ 中央に菱 --color-gold
```

- 章番号・工程番号: EB Garamond 600、`--color-accent`（ルブリケーション）。パーツはローマ数字 I II III…
- ユーザーコンテンツ（レシピ名・パーツ名）: しっぽり明朝 600（和文）／EB Garamond（欧文）
- EN見出しは i18n 対象外の意匠。JP glossのみ翻訳で差し替わる
- 本文・フォーム・ボタン: `--font-family-body`、和文 line-height 1.7
- **多言語のgloss字間（2026-07-05改訂）**: `.4em`級のglossトラッキングは和文（ja）専用。ラテン系（en/fr/de/it/es）と韓国語（ko）は `:lang()` 列挙で letter-spacing: normal に解除する（ハングルへの字間流用は禁忌）
- **韓国語フォント戦略（2026-07-05新設）**: 全OS共通のシステム明朝ハングルが存在しないため、`:root:lang(ko)` で display=`"EB Garamond", "Noto Serif KR"(Webフォント・Google Fonts wght@500;600;700), AppleMyungjo, Batang, serif`／body=`"Inter", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif` に差し替える（global.css。theme.cssは無改変）。見出しのみ명조（明朝）・本文システムゴシックは韓国Webの格式演出の慣習に適合。あわせて `:lang(ko) { word-break: keep-all }`（分かち書き言語の単語単位改行）

## 3. トークン差分（初期値からの変更）

| 変数 | 初期値 | 決定稿 | 理由 |
|---|---|---|---|
| `--radius-xs` | 2px | **3px** | COVERタグ等の小片の欠け防止 |
| `--radius-sm` | 4px | **6px** | 写本の丸み（入力・ボタン） |
| その他色・書体・spacing・shadow | — | 維持 | — |
| ADDITIONS v1.0 | — | 新設 | theme.css 末尾節参照（見出しトラッキング／二重枠／金環／墨帯オーバーレイ／プレースホルダ縞／`--shadow-panel` 等） |

## 4. コンポーネント仕様

状態表記: `hover / focus / active / disabled / dragging`。focus は全対話要素で `box-shadow: var(--focus-ring)` を**外側に追加**（羊皮紙上で視認可）。タッチ目標 44px（PCのみ sm=36px 可）。

### Button
| バリアント | 面 | 枠 | 文字 | 備考 |
|---|---|---|---|---|
| primary | `--color-accent` | 1px `--color-accent-hover` | `--color-accent-contrast` 600 | `inset 0 0 0 1.5px var(--color-gold-ring)`（金環）。hover=`--color-accent-hover`／active=同色+translateY(1px)／disabled=opacity .4 |
| secondary | `--color-bg-raised` | 1px `--color-gold-soft` | `--color-link` 600 | hover=面を`--color-warning-bg`寄りに1段 |
| ghost | 透明 | なし | `--color-link` 500 | 下線 `dotted` 50%透過。hover=下線実線 |
| danger | `--color-danger` | なし | `--color-accent-contrast` 600 | 削除確定のみ |
| icon | 透明 or raised | 1px `--color-line` | `--color-ink-muted` | 円形28–32px（⋮ ✕ ↑ ↓）。工程✕のみ文字色 `--color-danger` |

radius: 通常 `--radius-sm`、ヘッダ出力群・言語切替は `--radius-full`（ピル）。ラベルは可変幅・固定幅禁止。

### Card
- **recipe（Home）**: 折丁カード。`--color-bg-raised`＋1px `--color-line`＋二重枠inset（レシピ参照: theme.css実装メモ）＋`--shadow-1`。padding 9px、写真は内側に1px枠＋`--radius-sm`。タイトル中央・明朝。メタ = mono `VOL.012 ・ 更新 ・ 工程n`。未バックアップ ● 8px `--color-danger` をタイトル左。⋮は右上の円形iconボタン（写真上では `rgba(--color-bg-raised, .92)` 面）
- **part（Overview）**: 二重枠(soft)＋行構成 `⋮⋮ハンドル → ローマ数字(朱) → サムネ52px → 名前+工程n → バッジ列 → ›`。**（v2.6追加）** controls列（`⋮⋮ハンドル`・↑↓ボタン）の末尾に削除✕（icon danger・円形28–32px・44pxタッチターゲット維持）を追加。押下は`ConfirmDialog`（danger確定ボタン＋「取り消しできません」注記＝下記Dialog/Modal規約を適用）を起動する
- **step（Editor）**: §「StepCard」参照
- dragging（全カード共通）: `--shadow-3`＋`rotate(-1deg)`＋枠を `--color-gold-soft`。挿入位置 = 2px `--color-accent` 線＋左端6px円ドット

### Input
- 面 `--color-bg-sunken`、枠 1px `--color-line-strong`、radius `--radius-sm`、文字16px以上
- focus: 枠 `--color-focus-ring`＋`--focus-ring`
- error: 面 `--color-danger-bg`、枠 1.5px `--color-danger`（MIX%超過で使用）
- select は右端に▼（`--color-ink-muted`）。検索可能コンボは入力と同皮

### SwatchChip（中立領域 — テーマ変更の影響禁止）
- 白台紙 `--color-swatch-frame`＋1px `rgba(0,0,0,.12)`＋`--radius-xs`、内側チップに 1px `--color-swatch-border`
- sm 16 / md 24 / lg 40 / xl 44（印刷・共有画像）
- md以上は**常に名前併記**、lg以上は `ブランド ・ #hex`（mono）併記
- photo=チップ写真をそのまま（非加工）／empty=市松 `--color-swatch-checker`＋「hex未指定」

### Badge / Chip
| 種類 | 形 | 皮 |
|---|---|---|
| mix | ピル | mono 10.5–11px、面 `--color-bg-raised`、枠 `--color-gold-soft`。書式 §8-B |
| mix-error | ピル | 面 `--color-danger-bg`、枠・文字 `--color-danger`、`⚠ 計120%` |
| technique | ピル | sans 500、枠 `--color-line-strong` |
| status-success / warning | ピル | 面 `--color-success-bg / warning-bg`、文字 600 同系ink |
| count（使用数） | ピル | mono 10px `--color-gold`、面 `--color-bg`、枠 `--color-gold-soft`。「N工程で使用中」 |
| dot | 8px円 | `--color-danger`（未バックアップ） |

### Dialog / Modal
- backdrop `--color-bg-backdrop`。本体 `--color-bg` / radius 10px / `--shadow-3`
- ヘッダ: overline（SHARE等）＋明朝タイトル＋✕、下辺 2px `--color-gold-soft`
- モバイルはボトムシート化可（上角のみ radius）
- confirm(削除) は danger ボタン＋「取り消しできません」注記／error-detail は mono でzodエラー列挙

### Toast
- 面 `--color-bg-raised`＋1px `--color-line`＋`--shadow-2`、radius `--radius-md`。先頭に状態色8px●
- success 自動消滅3s／error 手動✕／位置: mobile下部・PC右下

### Banner
- reminder-full(Home): 面 `--color-warning-bg`、枠 `--color-warning-border`、`!`円アイコン＋本文＋[今すぐエクスポート](warning solid)＋[あとで](ghost)
- reminder-compact(Overview): 同配色のピル帯、本文＋下線リンク
- storage-warning: StatusBar 展開内（下記）

### StorageStatusBar
- healthy: 1行ピル帯（raised面）: ●success「データ保護: 有効」＋mono `12.3 MB ・ 最終エクスポート: 3日前`＋右端リンク
- warning: warning面に展開: タイトル行＋説明（Safari 7日）＋[JSONバックアップを保存](warning solid)
- unsupported: バッジ非表示・説明文のみ

### PhotoUploader / 写真（§8-A 反映）
- uploader(Setup全体写真): 112pxタイル、先頭に `COVER` タグ（`--color-gold`面・radius-xs）、各タイル右下に✕円。末尾「＋ 追加/D&D」破線タイル。並び替え=代表変更
- step-photo(工程写真): 84px（mobile76px）タイル1枚。filled=`STEP n` タグ＋✕／empty=破線＋「＋ 写真 1枚」
- readonly-thumb(baseモード): 52pxサムネ＋「全体写真の編集はSetupで ›」
- アップ中: 縞スケルトン＋プログレスバー（gold）
- **全写真フィルタ・トーン加工禁止**。radius は `--radius-sm`（タイル）／`--radius-lg`（大判）

### SortableList
- 状態: dragging（上記Card）／drag-over（挿入線）／keyboard-focus（`--focus-ring`）
- steps は **D&Dハンドル＋↑↓ボタン併設**（端の↑↓は opacity .45 で無効表示）

### BaseStepOverlay
- 写真下辺の墨帯 `--color-overlay-ink`。`BASE` overline（`--color-gold-soft`）＋技法チップ（文字 `--color-on-overlay`・枠 `--color-on-overlay-line`・ピル）＋右端「編集 ›」（gold-soft）
- empty: 破線ピル「＋ ベース工程を追加」
- 帯下の文字は on-overlay で AA 確保。写真なしでも帯は表示

### PaintSlot（A〜E）＋ MixRatioInput（§8-B 反映）
- PC/パネル: 1行 `A(朱金ラベル) → Brand select(84px) → Color select(flex) → SwatchChip → %入力(48px) → ✕`
- mobile: スロットを薄枠グループで2行（選択行／スウォッチ+配合行）
- MIX行: `MIX` ラベル＋比率入力＋`⇄`注記＋右端に `計 n%`（100=success● / ≠100=danger●）
- エラー時: 全%枠 error 皮、比率欄「—」disabled、下に `!` メッセージ。**autosaveは継続**し、出力に警告を継承
- 単色工程: MIX行・%列とも非表示
- 5件到達: 「＋塗料を追加」disabled＋「最大5種まで」。追加リンクに残数表示「（あと2）」

### PaletteEditor / ToolListEditor 行
- raised面ピル行: SwatchChip(md)＋ブランドmono＋右端に count バッジ＋✕円
- in-use: ✕ opacity .45 + disabled、行下に注記「↳ 工程で使用中のため削除できません（工程側で外すと削除可）」
- 未使用: 「未使用」バッジ（faint枠）＋✕活性
- **（v2.6追加）**`ToolSelect`（工程エディタ）内のdoc.tools行も同一皮を適用する（in-use=使用中の工程でチェック中の意）

### ToolsPage / TagChipEditor（v2.6追加・2026-07-13ユーザーFB裁定）
- **ToolsPage一覧行**: `PaletteEditor / ToolListEditor 行`と同一皮のraised面ピル行（SwatchChipなし・ツール名sans 500のみ）。行内に`TagChipEditor`を内包し、末尾に削除✕円（danger文字色・§Button iconバリアント）
- **TagChipEditor**: 各チップは`#`＋タグ名（mono 11px）・raised面faint枠・小円radius-full・末尾に除去✕（12px・opacity .6→hover 1）。追加inputは同列末尾に配置し、Enter確定・重複無視は無音（トースト不要）
- **削除確認**: ToolsPage・PartCard・ToolSelectいずれの削除✕も上記Dialog/Modal規約（confirm=dangerボタン＋「取り消しできません」注記）を適用する。ライブラリ削除のdescriptionは「登録済みレシピからは削除されません」、パーツ削除は「工程と写真も削除されます」と、影響範囲をdescriptionで明記する（注記自体は共通・description文言のみ画面ごとに差し替え）

### ActionBar
- export(PC): ヘッダ右にピル群。グループ区切りは**菱** `--color-gold`: `[印刷][PDF] ◆ [X][Bluesky][note MD] ◆ [JSON|素MD]`
- **JSON+素MD は結合ピル**（外枠 `--color-accent`・面 `--color-warning-bg`・中仕切り1px）— 隣接固定の視覚化
- export(mobile): 下部固定 `--actionbar-height`、上辺 2px `--color-gold-soft`＋上向き`--shadow-2`。ラベル: `印刷 PDF X Bsky note [JSON|素MD]`（EN: `Print PDF X Bsky note [JSON|MD]`）
- print-toolbar: sunken帯＋[印刷する](primary)＋PDF保存案内。`@media print` で非表示

### CharCounter
- mono 11px 600。ok=`--color-success`／over=`--color-danger`＋`⚠ n文字超過`＋[自動トリム](warning solid sm)
- X=重み付き280／Bluesky=300 grapheme（表記併記）

### LanguageSwitcher
- ピル2セグメント、枠 `--color-gold-soft`、active面 `--color-accent`＋contrast文字。高さ36–40px

### AppFooter
- 上辺1px `--color-gold-soft`。`© coat-codex ◆ 利用規約・免責`（菱区切り、リンクはdotted下線）
- （2026-07-03改訂）`© coat-codex` の直前に封蝋ロゴ画像（18px・`aria-hidden`・`vertical-align: middle`）を追加

### EmptyState
- 破線枠（gold-soft）＋封蝋 or ＋円＋明朝見出し＋1行説明＋CTA。Home空: 「最初の秘伝書を作る」(primary)＋インポート導線＋「データはこの端末のブラウザにのみ保存されます」

### Skeleton
- card: 二重枠のみ＋縞面／photo: プレースホルダ縞に `linear-gradient` シマー（placeholder-a/b間）

### SlideInPanel（PC ≥768px）
- 右から `--panel-width`、面 `--color-bg`、`--shadow-panel`、ヘッダ下辺 2px gold-soft。backdrop = `--color-bg-backdrop`（背後のOverviewが透ける）。mobileは使用せずフルページ

## 5. 画面状態規約（全画面）

- autosave 500ms debounce。保存ボタン・未保存警告なし。失敗時のみ error トースト
- ロード = Skeleton（紙面骨格優先）／不正ルート = リダイレクト＋トースト
- ドラッグ系は必ず「掴む前・中・挿入位置」の3表現（§4 Card/SortableList）
- ブレークポイント: **768px**（SlideInPanel分岐）／**1200px**（Homeグリッド3→4列）。基準VP: 390 / 1280

## 6. print.css 方針（PrintViewPage）

紙面サンプル: キャンバス 2c（A4・標本箋レイアウト＋封蝋ヘッダ）

方針:
1. **色見本が主役**: スウォッチ `--size-swatch-xl`（一覧）/16px（工程行）、**名前＋ブランド＋#hex＋配合%を必ずテキスト併記**（モノクロ耐性）。`print-color-adjust: exact` はスウォッチにのみ適用
2. **インク節約**: 背景ベタ・二重枠・影を print で全て外す。紙面は白、装飾は1px罫と点線リーダーのみ。朱・金はテキスト＋細罫に限定
3. **改ページ**: パーツ節 = `break-inside: avoid;` を基本、収まらない節は節頭で `break-before: page`。工程行は `break-inside: avoid`
4. **寸法**: `@page { size: A4; margin: 15mm }`。本文 印刷時 ≥10.5pt 相当、キャプション下限 8.5pt
5. ヘッダ（二重罫＋封蝋＋VOL・日付）とフッタ（1px罫＋`頁 n / N`）を各ページに

```css
@media print {
  @page { size: A4; margin: 15mm; }
  .print-toolbar, nav, .app-footer { display: none; }
  body { background: #fff; color: var(--color-ink); }
  .card, .folio { box-shadow: none !important; border: none; }
  .swatch { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .part-section { break-inside: avoid; }
  .part-section--long { break-before: page; }
  .step-row { break-inside: avoid; }
}
```

## 7. 装飾アセット方針

原則 **CSSで実装**。（2026-07-03改訂）封蝋モノグラムのみユーザー支給PNG（`docs/design/coat-codex_logo.png`原本・編集禁止）から生成した配信アセットを使用する。

| アセット | 実装 | 使用ルール |
|---|---|---|
| 封蝋モノグラム "cc" | （2026-07-03改訂）**PNG供給**（原本`coat-codex_logo.png`由来・`src/assets/seal-logo.png`として配信。favicon/apple-touch-icon/ヘッダ/フッターで使用） | 1画面3箇所まで。最小16px |
| 菱（ダイヤ） | span 4–8px `rotate(45deg)` `--color-gold` | 飾り罫の中心・枠四隅・区切りのみ。連続配置禁止 |
| 金の飾り罫 | flex: 1px線(gold-soft)＋中央菱 | 章題ブロック直下のみ（1見出し1本） |
| 二重枠 | border＋inset box-shadow ×2 | recipe/partカード・ヒーロー枠。入力・スウォッチには禁止 |
| 墨帯オーバーレイ | `--color-overlay-ink` | 写真下辺のみ。**スウォッチ・色情報の上に禁止** |
| 点線リーダー | `border-bottom: 1px dotted --color-line-strong` | 印刷カラー一覧・メタ行 |
| 挿入線 | 2px `--color-accent`＋左端6px円 | D&D中のみ |

禁止: テキスト背面のテクスチャ／スウォッチ・写真への色付き装飾／装飾のためのタップ領域侵食（44px維持）

## 8. 仕様変更提案（技術計画v2からの差分 — 検討 t4・t5 で合意）

### A. 工程写真 1枚紐づけ（t4）
- `part.photoIds[]` を廃止 → `step.photoId?: string`（0..1）。Setupの全体写真は従来どおり
- PartEditor: パーツ写真ギャラリー削除。StepCard下段に「写真タイル＋メモ」ペア。mobileはカード上に工程写真ストリップ（番号付き・タップで該当工程へ）
- Overview partサムネ = 写真がある最後の工程（なければプレースホルダ）、`STEP n` タグ付き
- Print: 工程行の右に64×48写真（なければ空欄・行高一定）／共有合成画像の2枚目以降 = 写真つき工程から時系列
- 移行: 既存パーツ写真を先頭工程から順に割当て、余りは全体写真へ退避

### B. MIX%の再設計（t5）
- 保存形: `step.mix?: number[]`（スロット順の整数%。単色は `undefined`）
- **各スロットに%入力**。合計100で有効。**合計≠100はエラー**: %枠error皮＋`計 n%`(danger)＋メッセージ「合計が100%になるよう調整してください」。autosaveは継続、エラーは出力（バッジ/印刷/共有）へ警告として継承
- 比率欄は導出/入力補助: `5:3:2` 入力→%へ展開（丸め剰余は末尾スロット）／%直接編集→自動約分して再表示（約分不能は素値のまま）／合計≠100中は「—」
- バッジ書式: `60% + 40% (3:2)`・`50% + 30% + 20% (5:3:2)`・約分不能時は比率省略

### C. ツールライブラリ＋パーツ削除の意匠（v2.6追加・2026-07-13ユーザーFB裁定。技術計画v2.6 §2.8/§3.1/§3.3対応）
- **新規画面 `/tools`（ToolsPage）**: 既存画面と同じ紙面トーン（羊皮紙面・二重枠なしの単純raisedリスト）で構成する。新規トークンは作らない（既存 `--color-bg-raised`・`--color-gold-soft`・`--radius-sm`等を流用）
- **PartCard削除ボタン**: 上記「Card」節のとおり、controls列（ドラッグハンドル・↑↓）の末尾に削除✕を並べる。44pxタッチターゲットを維持し、ドラッグハンドル・↑↓・✕の3ボタンが密集しても誤タップ距離を確保する（実機検証はドラッグハンドルと削除✕の誤タップ距離を含める）
- **タグチップ**: 上記「ToolsPage / TagChipEditor」節のとおり`#名`表示＋除去✕。ライブラリ専用データのため、レシピ側（Setup/StepCard）の意匠には影響しない
- **削除確認ダイアログ**は全箇所で既存「Dialog / Modal」節のconfirm=dangerボタン＋「取り消しできません」注記をそのまま適用し、本改訂で新規のダイアログ皮は作らない

## 9. アクセシビリティ・チェックリスト

- コントラスト（羊皮紙 #F6F0E2 上）: ink 11:1 ✓／ink-muted 5:1 ✓／gold(#8F6B2E) ≈4.8:1 — 本文使用禁止・600以上のラベル/overlineのみ ✓／accent面のcontrast文字 8:1 ✓／墨帯上 on-overlay ≥7:1 ✓
- 色だけに依存しない: スウォッチ常時名前＋hex／MIXエラーはメッセージ併記／未バックアップ●はメニュー内「JSONエクスポート」と重複提供
- フォーカスリング: 藍 `--focus-ring` — 羊皮紙・raised・warning面すべてで視認確認済み
- タッチ 44px（sm 36pxはPCポインタのみ）／D&Dに↑↓ボタン代替／`prefers-reduced-motion` でドラッグ傾き・シマー無効化
- 英語ラベル1.5〜2倍長: 全ボタン可変幅（検証カンプ 3e）
