# coat-codex 技術計画 v2

**位置づけ**: [要件定義書](coat-codex_要件定義.md)に基づく技術計画の第2版。v1に対する3観点レビュー（要件カバレッジ／技術的正確性／データスキーマ整合性。重大度「高」10件を含む約30件の指摘）を全面反映し、多段の敵対的検証・修復を経て確定した。実装フェーズ（Opus=レビュー／Sonnet=実装）は§4のタスクを上から順に実施する。

**改訂履歴**: 2026-07-02 v2.2: デザイン決定稿（[デザイン仕様書](design/coat-codex_デザイン仕様書.md)§8、検討t4/t5合意）の提案A（工程写真1枚紐づけ）・提案B（MIX%再設計）を反映。**要件定義10-3の「パーツ写真複数枚」「%とA:B比率の両保持」からの合意済み変更**（原典は改訂せず本書を正とする）。／2026-07-03 v2.3: **SNS共有を全体/パーツの2起点に変更**・投稿テキストに**URLを含めない**（Xのリンク付き投稿リーチ抑制対策）・**`#coat-codex`タグ必須**（§3.4）。プリセット3ブランド確定（§6）。**Setupの使用カラー先行登録を廃止**（要件10-1からの変更: 色は工程のPaintPickerからのみ追加され、参照0になったpalette色は保存時に自動GC=チップ写真Blob含む）。**工程のツール指定を「その場追加＋登録済み選択」に拡張**（Setupのツール登録も併存）。／2026-07-06 v2.4: ハッシュタグを`#coatcodex`へ変更（Xのハッシュタグはハイフンで途切れるため。トリム対象外＝末尾維持の仕様は不変）。／2026-07-07 v2.5: monorepo切り出し追随（Scriptorium計画v1 §5.1/§5.2の実装記録）: schema/純ロジック/exchange/convertは`packages/recipe-core`（S1）、SwatchChip（resolvePhotoUrl注入化）・CroppedPhoto・theme.css・表示アトム（MixBadge/TechniqueChip/StepListView）・PhotoSourceProvider/usePhotoUrl・REQUIRED_I18N_KEYSは`packages/recipe-ui`（S2）へ移動。codexはApp.tsxで`photoStore.resolvePhotoUrl`を注入。PrintRecipeSheetの印刷意匠バッジはcodex残留（アトム非適用）。／2026-07-14 v2.6: **ツールライブラリ（M10/M11）＋パーツ削除（M9）を追加**（2026-07-13ユーザーFB裁定）。管理画面を新ルート`/tools`として追加し、§3.1のルート数を7から**8**へ改訂（以降の画面追加は都度本仕様書の改訂を要する。「これ以上の画面追加はしない」という旧v1〜v2.5時点の制約は本改訂をもって解除）。ツールはレシピ横断の`UserToolRecord`ライブラリとして`userTools`テーブル（Dexie `version(2)`）に保持し、タグは**ライブラリ専用**（RecipeDoc・公開データ・レシピエクスポートには非搭載。schemaVersion=3は不変）。新設§2.8にデータモデル・正規化規約・doc.toolsとの関係・専用エクスポート/インポート形式を定義。§2.6にパーツ削除時の整合性（steps巻き添え・写真Blob即時回収）と工程削除時の写真孤児バグ修正を追記。§4.2にM9（T48〜T50）／M10（T51〜T54）／M11（T55〜T57）を新設（既存T47は2026-07-04に見送り裁定済みの任意Low項目のため、新規タスクはT48から採番する）。／2026-07-14 v2.7: **M12（T58〜T61）を新設**（2026-07-14ユーザーFB裁定。ツールライブラリ仕上げ＋パーツ操作列カード内統合）: §2.8に**一括移行**（/toolsページの「レシピから取り込む」ボタンで全レシピの`doc.tools`をtoolNameKeyマージでライブラリへ取り込む。T54のmergeImportedTools再利用）と**将来方針**（`doc.tools`は経過措置でありツール参照はいずれツールライブラリへ完全移行する旨をエディタUIにも表示）を追記。§3.3のToolsPage（一括移行ボタン）・ToolSelect（✕は削除可能行のみ表示・注記はリスト下の一元ヒント1行＋完全移行予告）・PartCardList/PartCard（操作列を左カラムからカード内へ移設）の記述を更新。デザイン仕様書にもv2.7としてPartCard操作ボタンのカード内統合・ToolSelect注記一元化・ToolsPage一括移行ボタンを反映。

**採用スタック（確定。バージョン固定の単一情報源は§4.1）**: Vite + React 19 + TypeScript / Zustand v5 / Dexie.js（IndexedDB）/ zod v4 / react-i18next / @dnd-kit/core@6.x + @dnd-kit/sortable / react-router v7（declarative mode）

**関連ドキュメント**（ビジュアルデザイン検討フェーズ＝Claude Design向け）:
- [design/coat-codex_ClaudeDesign_プロンプト.md](design/coat-codex_ClaudeDesign_プロンプト.md) — Claude Designへの依頼プロンプト
- [design/coat-codex_DesignSystem.md](design/coat-codex_DesignSystem.md) — デザイントークン初期値（Claude Designが上書きしてよい）
- [design/coat-codex_画面テンプレート.md](design/coat-codex_画面テンプレート.md) — 画面ごとの構造ラフ・状態一覧
- [design/coat-codex_デザイン仕様書.md](design/coat-codex_デザイン仕様書.md) — **デザイン決定稿（2026-07-02納品）**。§8の仕様変更2件（提案A/B）はv2.2で本書へ反映済み

---

## 1. ディレクトリ／ファイル構成

```
coat-codex/
├── public/
│   └── paints/                    # ブランド別プリセット塗料DB（遅延fetch、バンドル外）
│       ├── index.json             # ブランド一覧メタ
│       ├── citadel.json           # 334色・公式チャート由来（マスタ: docs/paints/citadel-master.json）
│       ├── vallejo.json           # 255色・変換チャート由来（マスタ: docs/paints/vallejo-master.json）
│       └── coatdarms.json         # 150色・公式チャート由来（マスタ: docs/paints/coatdarms-master.json）
│       # AKは2026-07-03に除外（チャート入手不可のため。自由入力で記録可・入手次第マスタ方式で復活）
│   # 注意: public/_redirects と 404.html は「置かない」こと自体が仕様（§5.2 SPAフォールバック）
├── src/
│   ├── main.tsx / App.tsx / router.tsx   # 8ルート定義（§3.1。v2.6でツールライブラリ管理画面 /tools を追加）
│   ├── routes/
│   │   ├── HomePage.tsx           # レシピ一覧・新規作成・インポート・データ保全ステータス
│   │   ├── RecipeSetupPage.tsx    # 10-1 初期入力
│   │   ├── RecipeOverviewPage.tsx # 10-2 ペイント構成全体表示
│   │   ├── PartEditorPage.tsx     # 10-3 パーツ工程編集（/part/base でベース工程編集を共用）
│   │   ├── PrintViewPage.tsx      # 印刷／PDF用レイアウト
│   │   ├── TermsPage.tsx          # 利用規約・免責（データ消失自己責任の明記場所）
│   │   └── ToolsPage.tsx          # v2.6追加: ツールライブラリ管理（一覧・追加・タグ・削除・エクスポート/インポート。§2.8/§3.3）
│   ├── components/
│   │   ├── common/      # AppShell, LanguageSwitcher, AppFooter, ToastHost,
│   │   │                #   PhotoUploader, ConfirmDialog, EmptyState, Skeleton, ImportErrorDialog
│   │   │                #   （v2.5: SwatchChip・CroppedPhoto・表示アトムは packages/recipe-ui へ移動）
│   │   ├── home/        # RecipeCardGrid, RecipeCard, NewRecipeButton, ImportJsonButton,
│   │   │                #   StorageStatusBar, ExportReminderBanner
│   │   ├── setup/       # TitleInput, OverviewPhotoUploader, PaletteEditor, ToolListEditor,
│   │   │                #   ImportJsonSection, MakeCodexButton
│   │   ├── paint/       # PaintPicker, BrandSelect, ColorSelect, MixRatioInput
│   │   ├── overview/    # OverviewHeader, OverviewPhotoStrip, PartCardList,（BaseStepOverlayはv2.3で廃止→BASEカード）
│   │   │                #   PartCard, AddPartButton, ExportActionBar, ShareDialog,
│   │   │                #   ShareImagePreview, ShareTextEditor
│   │   ├── part-editor/ # PartEditorHeader, PartNameInput, StepList, StepCard, StepPhotoTile,
│   │   │                #   StepPhotoStrip, TechniqueSelect, PaintSlotList, PaintSlot, ToolSelect,
│   │   │                #   MemoField, AddStepButton
│   │   │                #   （v2.2: PartPhotoGalleryは廃止 → 工程写真のStepPhotoTile／モバイル用StepPhotoStripへ。§3.3）
│   │   ├── tools/       # v2.6追加: TagChipEditor（§2.8/§3.3）
│   │   └── print/       # PrintRecipeSheet, PrintToolbar
│   ├── hooks/
│   │   └── useJsonImport.ts       # Home/Setup共通のJSONインポート処理フック（§3.3）
│   ├── db/
│   │   ├── db.ts                  # Dexie定義: version(1)=recipes/photos/meta、version(2)でuserTools追加（§2.7）
│   │   ├── recipeStore.ts         # レシピCRUD・ロード時lazy migration（§2.7）
│   │   ├── photoStore.ts          # Blob保存・URL解決・孤児GC・欠損時フォールバック（§2.6）
│   │   └── toolStore.ts           # v2.6追加: UserToolRecord CRUD（§2.8）
│   ├── models/
│   │   ├── recipe.ts              # RecipeDoc / RecipeExportFile 型＋zodスキーマ（§2）＋ recipe.test.ts
│   │   └── migrations.ts          # schemaVersionマイグレーション（§2.7）
│   ├── stores/
│   │   └── useRecipeStore.ts      # 編集中レシピ＋autosave（debounce 500ms）
│   ├── lib/
│   │   ├── mixRatio.ts            # 混合比率の変換・表示文字列導出（§2.3/§2.4）＋ mixRatio.test.ts
│   │   ├── techniques.ts          # 技法プリセットマスタ（§2.1）＋ techniques.test.ts
│   │   ├── paintPresets.ts        # プリセット塗料DBのロード・ブランド絞り込み検索
│   │   ├── recipeRefs.ts          # 参照整合性ユーティリティ（色/ツール使用数カウント等。§2.6）
│   │   ├── photoRefs.ts           # v2.6追加: 参照写真ID集合の抽出（overviewPhotoIds/steps[].photoId。chipPhotoIdは対象外。§2.6）
│   │   ├── toolTags.ts            # v2.6追加: normalizeTag/addTag等タグ正規化ロジック（§2.8）
│   │   ├── toolLibraryFile.ts     # v2.6追加: ツールライブラリ専用エクスポート/インポート形式（§2.8）
│   │   ├── storageHealth.ts       # storage.persist / persisted / estimate ラッパー（§3.5）
│   │   ├── imageProcessing.ts     # アップロード時mime正規化・長辺2048pxリサイズ（§2.6）
│   │   ├── importRecipe.ts        # インポート3段検証・全ID新規採番リマップ（§2.7）
│   │   ├── exporters/             # json.ts / markdown.ts / noteMarkdown.ts
│   │   └── sns/                   # types.ts（SnsTarget IF）/ x.ts / bluesky.ts / imageComposer.ts
│   ├── i18n/                      # index.ts / locales/ja.json / locales/en.json
│   ├── styles/                    # theme.css / print.css（print-color-adjust: exact 必須。§4）
│   └── dev/
│       └── DndSpike.tsx           # M0: React 19×dnd-kit peer依存の検証スパイク（T2。確認後削除可）
├── tests/
│   ├── roundtrip.test.ts          # export→import 往復同値性テスト
│   ├── exporters.snapshot.test.ts # Markdown/note出力のスナップショットテスト
│   └── fixtures/recipe.ts         # テスト用レシピフィクスチャ
├── index.html
├── vite.config.ts / tsconfig.json / package.json
└── wrangler.toml                  # §5.3（3行のみ）
```

**設計上のポイント**: SNS投稿先は `SnsTarget` インターフェースの配列登録制（`x.ts` / `bluesky.ts` が実装）とし、Mastodon等の将来追加が1ファイル追加で済む構造にする。


---

## 2. レシピJSONデータスキーマ

### 2.0 v1からの変更点（レビュー指摘対応の要約）

| # | 指摘 | v2での対応 |
|---|---|---|
| 1 | percent/ratioValue/ratioTextの三重管理 | `ratioText`削除。モード別に`percent`または`ratioValue`の一方のみが正（他方はnull強制）。表示文字列は`lib/mixRatio.ts`で導出（§2.3） |
| 2 | 3〜5塗料混合の仕様未定義 | n項比率（2〜5項）とバッジ表示規約を定義（§2.3） |
| 3 | 色/ツール削除時のdangling参照 | 「使用中は削除不可」＋zodクロス参照検証（§2.5 / §2.6） |
| 4 | DB内/エクスポートのスキーマ未分離 | `RecipeDoc`と`RecipeExportFile`を分離定義（§2.1 / §2.2） |
| 5 | DB内旧文書のマイグレーション欠落 | ロード時lazy migration（§2.7） |
| 6 | インポート検証順序 | ヘッダ検証→migrate→フル検証の3段構成（§2.7） |
| 7 | インポートID衝突ポリシー | 常に全ID新規採番＋参照リマップ（§2.7） |
| 8 | 丸めで合計100にならない | 丸め規則を確定。zodは合計を検証しない（§2.3 / §2.5） |
| 9 | 単色・塗料0件の値規約 | 値規約表で確定（§2.3） |
| 10 | 塗料追加/削除時の再計算 | 再計算規則を確定、mixRatio.tsの純関数に集約（§2.3 / §2.4） |
| 11 | orderと配列順の二重管理 | `order`フィールド全廃。配列順が正 |
| 12 | photoId dangling | インポート正規化で除去＋ランタイムはプレースホルダ表示（§2.6） |
| 13 | photos同梱のmime/dataUrl冗長 | `mime`フィールド削除（dataUrlに内包、DB側は`Blob.type`） |
| 14 | technique.presetKeyマスタ未定義 | `lib/techniques.ts`にマスタ定義＋i18nキー対応（§2.1末尾） |

**v2.1追加改訂（第2次レビュー：新規問題・成果物間整合性指摘への対応）**:

| # | 指摘 | v2.1での対応 |
|---|---|---|
| 15 | 丸め規則が目標100固定で、percent削除時の「削除前合計維持」と矛盾 | 丸め規則を**任意の目標合計値への残差配分**に一般化。`roundPercentsToTarget`を追加（§2.3 / §2.4。v2.2で整数%化に伴い`allocateIntegerPercents`へ改組 — 「削除前合計維持」の方針自体は維持） |
| 16 | 塗料0件→1件目追加の規則が未定義 | 再計算規則表・関数コメント・テストケースに「0件→1件目=単色規約適用」を明記（§2.3 / §2.4） |
| 17 | HEIC/GIF等アップロード時のエクスポートdataUrl不整合（ラウンドトリップ破綻） | **写真アップロード時のmime正規化**（png/jpeg/webp以外はJPEG再エンコード、不能時はエラー）を仕様化（§2.6） |
| 18 | `kind`がヘッダ検証に含まれず種別判別が機能しない | インポート第1段ヘッダ検証に`kind: z.literal('recipe-export')`を追加（§2.7） |
| 19 | 混合バッジ表記が成果物間で食い違い（「60% (3:2)」vs「60% + 40% (3:2)」） | **`formatMixBadge`の返す「60% + 40% (3:2)」形式が唯一の正**と確定し、他成果物の表記を読み替え対象と明記（§2.3） |
| 20 | `meta`テーブルがDexie定義に存在しない | `meta`テーブルとレコード形状（キー一覧・値型）を§2.7に定義 |
| 21 | partId予約語`"base"`拒否がzod不変条件リストにない | 不変条件17として追加（§2.5） |
| 22 | title空文字不可とドラフト即時autosaveの矛盾（既定名補完仕様の欠落） | **ドラフト既定タイトル規約**（作成時初期化＋空確定時置換、i18nキー・タイミング）を定義（§2.5） |
| 23 | 旧フィールド名`inputMode`への言及が他成果物に残存 | `mix.inputMode`は`mixMode`へ改名済みであることを明記。他成果物の`inputMode`表記は`mixMode`に読み替える（§2.3） |
| 24 | 「使用中削除不可」UIがデザイン要件から欠落 | §2.6でPaletteEditor/ToolListEditorのUI要件（使用数バッジ・削除無効化）を**デザイン成果物必須要件**として規範化 |

**v2.2追加改訂（デザイン決定稿反映: デザイン仕様書§8、検討t4/t5合意）**:

| # | 変更 | v2.2での対応 |
|---|---|---|
| 25 | 提案A: 工程写真1枚紐づけ | `parts[].photoIds[]`（パーツ写真・複数枚）を廃止し、Stepに`photoId: string \| null`（0..1枚）を新設。`overviewPhotoIds`（全体写真）・`palette[].chipPhotoId`は不変。アプリ未実装で既存データが存在しないため**schemaVersion=1のまま定義自体を改訂**（マイグレーション不要。§2.1の注記参照）。UI・印刷・共有画像の反映は§3.3/§3.4/T25/T27/T28/T36/T37 |
| 26 | 提案B: MIX%再設計 | Stepの`mixMode`・`paints[].percent`・`paints[].ratioValue`を全廃し、`paints: [{ colorId }]`＋`mix: number[] \| null`（スロット順の整数%。単色・塗料0件はnull）へ再設計。比率（A:B）は保存せず入力補助・導出表示に変更（§2.3/§2.4/§2.5/T7/T20/T21） |

---

### 2.1 RecipeDoc（IndexedDB内スキーマ）

IndexedDB `recipes`テーブルに1レコード=1文書で保存する正規スキーマ。**写真バイナリは含まない**（`photos`テーブルをphotoIdで参照）。全IDは`<prefix>_<crypto.randomUUID()>`形式。

> **v2.2改訂の適用方式（デザイン決定稿§8反映）**: 提案A（工程写真1枚紐づけ）・提案B（mix再設計）は、アプリ未実装で既存データが存在しないため**`schemaVersion`は1のままスキーマ定義自体を改訂**する（マイグレーション不要。デザイン仕様書§8-Aの「移行」項〔既存パーツ写真の先頭工程からの割当て・余りの全体写真への退避〕は**適用不要と判断済み**）。

```jsonc
// RecipeDoc
{
  "schemaVersion": 2,               // 文書スキーマ版。lazy migrationの判定に使用（§2.7。v2=photoCrops追加〔2026-07-05〕）
  "id": "rcp_<uuid>",               // レシピID（アプリ内グローバル一意）
  "title": "Space Marine Captain",  // レシピ名。必須・空文字不可（ドラフト作成時に既定名で初期化。§2.5「ドラフト既定タイトル規約」）
  "createdAt": "2026-07-02T10:00:00.000Z", // ISO 8601 UTC。作成時刻（インポート時も保持）
  "updatedAt": "2026-07-02T12:34:56.000Z", // autosaveごとに更新。一覧のソートキー
  "overviewPhotoIds": ["ph_<uuid>"],// 全体写真（photosテーブル参照）。0件可。配列順=表示順

  "photoCrops": {                   // 【v2】非破壊クロップ。photoId→元画像に対する正規化矩形（x,y,w,h∈[0,1]・x+w≤1・y+h≤1・w,h≥0.1はUI制約）
    "ph_<uuid>": { "x": 0, "y": 0, "w": 0.56, "h": 0.51 }
    // 元画像は無加工のまま保持し、表示（CroppedPhoto）・共有カード（imageComposer）・印刷が本矩形内でcover描画する。
    // クロップ解除=キー削除。danglingキーは無害（INV追加なし・INV-16と同方針）: 保存時GC（toPersistedDoc）と
    // エクスポート時strip（stripDanglingPhotoRefs）で掃除、インポートのID再採番（reassignRecipeIds）でキーもリマップされる。
    // palette[].chipPhotoIdはクロップ対象外（スウォッチ小円で意味がないため導線を設けない）
  },

  "palette": [                      // 使用カラー一覧。配列順=表示順（orderフィールドは持たない）
    {
      "id": "col_<uuid>",           // 文書内一意。StepPaint.colorIdから参照される
      "source": "preset",           // "preset"=プリセット塗料DB由来 | "custom"=自由入力
      "brand": "Citadel",           // メーカー名。custom時は任意（null可）
      "name": "Mephiston Red",      // カラー名。必須・空文字不可
      "presetId": "citadel:mephiston-red", // source="preset"時は必須 / "custom"時はnull
      "hex": "#960F0F",             // 色見本HEX。^#[0-9A-Fa-f]{6}$。不明時null
      "chipPhotoId": null           // hex代替のカラーチップ写真（photos参照）。null可
    }
  ],

  "tools": [                        // 使用ツール一覧。配列順=表示順
    {
      "id": "tool_<uuid>",          // 文書内一意。Step.toolIdsから参照される
      "name": "エアブラシ",          // 必須・空文字不可
      "note": "0.3mm"               // 補足。null可
    }
  ],

  "baseSteps": [ /* Step[]。全体工程（全体写真に紐づく）。配列順=工程順 */ ],

  "parts": [                        // 配列順=表示順。dnd-kit並び替えは配列自体を並び替える
    {
      "id": "part_<uuid>",          // 文書内一意。予約語 "base" は不可（§2.5-17。ルート /recipe/:id/part/base がベース工程編集に使用）
      "name": "兜",                 // パーツ名。必須・空文字不可
      "steps": [ /* Step[]。配列順=工程順 */ ]
                                    // v2.2: parts[].photoIds[]（パーツ写真）は廃止 — 工程写真 steps[].photoId へ（§2.0#25）。
                                    // Overviewのパーツサムネは「写真がある最後の工程の写真」を導出表示（§3.3 PartCard）
    }
  ]
}
```

```jsonc
// Step — baseSteps / parts[].steps 共通形。配列順=工程順（orderフィールドなし）
{
  "id": "stp_<uuid>",               // 文書内一意（baseSteps・全parts横断で一意）
  "technique": {
    "presetKey": "basecoat",        // lib/techniques.tsのマスタキー。自由入力時はnull
    "label": null                   // 自由入力時のみ非null。preset時はi18nで解決するためnull
  },                                // 両方null=未設定は許容。両方非nullは不可
  "photoId": null,                  // 工程写真（0..1枚。photosテーブル参照）。null=写真なし
                                    // （v2.2: デザイン決定稿§8-A反映。パーツ写真parts[].photoIds[]の後継）
  "paints": [                       // 使用塗料。0〜5要素。配列順=A,B,C,D,E。colorId重複不可
    { "colorId": "col_<uuid>" },    // v2.2: percent/ratioValueは廃止（%はmix側にスロット順で保持。§2.3）
    { "colorId": "col_<uuid>" }
  ],
  "mix": [60, 40],                  // スロット順の整数%（0〜100）の配列 | null（v2.2: デザイン決定稿§8-B反映）。
                                    // 単色・塗料0件はnull。合計100はUI上の有効条件（zodは合計を検証しない。§2.3）
  "toolIds": ["tool_<uuid>"],       // tools[].idの部分集合。重複不可。0件可
  "memo": ""                        // フリーメモ。空文字可
}
```

**technique.presetKeyのマスタ（指摘14）** — `lib/techniques.ts`:

```ts
// lib/techniques.ts — 技法プリセットの単一情報源
export const TECHNIQUE_PRESET_KEYS = [
  'prime', 'basecoat', 'layer', 'wash', 'drybrush',
  'edge-highlight', 'glaze', 'stipple', 'masking', 'varnish',
] as const;
export type TechniquePresetKey = (typeof TECHNIQUE_PRESET_KEYS)[number];

// 表示名はi18nキー "techniques.<presetKey>"（ja.json / en.jsonに全キー定義）で解決する。
// presetKeyがマスタ外の場合（将来プリセットを削除した後の旧データ等）は
// presetKey文字列をそのまま表示するフォールバック。
export function resolveTechniqueLabel(
  technique: { presetKey: string | null; label: string | null },
  t: (key: string) => string,
): string;
```

zod上は`presetKey: z.string().nullable()`とし、マスタ所属の強制はしない（プリセット改廃で旧データのロードが壊れるのを防ぐ）。インポート正規化ではマスタ外presetKeyを`{ presetKey: null, label: <旧キー文字列> }`へ降格する（§2.7）。

---

### 2.2 RecipeExportFile（エクスポートファイル形式）

JSONエクスポート/インポートの1ファイル=1レシピ形式。`RecipeDoc`に写真のbase64同梱を加えたもの。

```jsonc
// RecipeExportFile
{
  "app": "coat-codex",              // 固定リテラル。インポート第1段（ヘッダ検証）で使用
  "kind": "recipe-export",          // ファイル種別リテラル（将来の別形式との区別用）。第1段ヘッダ検証で照合し、不一致はmigrate前に中断（§2.7）
  "schemaVersion": 1,               // recipe.schemaVersionと常に一致（エクスポート生成時に保証）
  "exportedAt": "2026-07-02T13:00:00.000Z", // エクスポート時刻（情報用）
  "recipe": { /* RecipeDocをそのまま埋め込み（§2.1） */ },
  "photos": [                       // 写真同梱配列。「写真なしエクスポート」時は []
    {
      "id": "ph_<uuid>",            // recipe内のphotoId参照と対応
      "dataUrl": "data:image/jpeg;base64,..." // mimeはdataUrlのヘッダに内包（別フィールドは持たない）。
                                    // mimeは常にpng/jpeg/webpのいずれか（アップロード時正規化で保証。§2.6）
    }
  ]
}
```

- エクスポート時: `photos`テーブルから当該recipeIdの実体を収集し`Blob→dataUrl`変換。実体のないphotoId参照は出力文書から除去する。**文書内のphotoId参照箇所は`overviewPhotoIds`／`steps[].photoId`（baseSteps・全parts。v2.2: 旧`parts[].photoIds`から変更）／`palette[].chipPhotoId`の3種**（v2.2: デザイン決定稿§8-A反映）
- 写真なしエクスポート時: `photos: []`のまま、recipe内のphotoId参照（上記3種）は残す（インポート正規化で自動除去されるため無害。§2.7）
- DB側`photos`テーブルにも`mime`フィールドは持たず`Blob.type`を使う（指摘13）。DB内Blobのtypeはアップロード時正規化（§2.6）によりpng/jpeg/webpのいずれかであることが保証され、自アプリ生成のエクスポートファイルは§2.5-20のdataUrl検証を常に通過する（ラウンドトリップ保証。指摘17）

---

### 2.3 混合比率（mix）の正規データ設計（v2.2: デザイン決定稿§8-B反映で全面改訂）

**単一情報源の原則（指摘1の方針を継承）**: 保存するのは**スロット順の整数%配列`mix`のみ**（Step直下。§2.1）。比率テキスト・約分結果・バッジ文字列などの派生表現は一切保存せず、`lib/mixRatio.ts`で表示時に導出する。

> **旧フィールドに関する注記（指摘23を改訂）**: v1スキーマの`mix.inputMode`・`mix.ratioText`はv2で廃止、さらに**v2.1まで存在した`mixMode`（Step直下）・`paints[].percent`・`paints[].ratioValue`と「percentモード／ratioモード」の2モード制はv2.2（デザイン決定稿§8-B）で全廃**した。他成果物に残るこれらの表記は、すべて本節の`mix`モデルへの言及として読み替え、当該成果物側を改訂する。

#### 値規約表（指摘1, 2, 9をv2.2で改訂）

| 構成 | `paints.length` | `mix` | 10-2バッジ表示 |
|---|---|---|---|
| 混色（合計100） | 2〜5 | 非null。`mix.length === paints.length`・各要素は**整数0〜100** | `"60% + 40% (3:2)"`／`"50% + 30% + 20% (5:3:2)"`。約分不能時は比率省略で`"55% + 45%"` |
| 混色（合計≠100） | 2〜5 | 同上（合計≠100の文書も保存上は正規。UI上はエラー） | `"60% + 50%"`（比率省略）＋警告表記を併記（下記） |
| 単色 | 1 | `null` | バッジ非表示（スウォッチのみ） |
| 塗料0件（マスキング等） | 0 | `null` | バッジ非表示（技法名のみ） |

- `paints`の各要素は`{ colorId }`のみを持つ（%は`mix`側にスロット順=A〜Eで保持。§2.1）
- **合計100はUI上の有効条件であり、zodは合計を検証しない**（指摘8の方針を既存どおり維持）。合計≠100のUIは「全%入力枠のerror皮＋『計 n%』danger表示＋メッセージ『合計が100%になるよう調整してください』」（デザイン仕様書§4 PaintSlot/MixRatioInput）。**autosaveは継続**し、警告は出力（バッジ・印刷・共有画像）へ継承する: 出力側は合計≠100の工程にmix-errorバッジ（i18nキー`mix.totalWarning`。ja例「⚠ 計 110%」）を併記する

#### 比率（A:B）の扱い（v2.2）— 保存せず、入力補助と導出表示に限定

| 操作/状態 | 規則 |
|---|---|
| 比率入力（`5:3:2`等） | `parseRatioText`で2〜5項・各1〜999の**整数**として受理（小数比率はv2.2で廃止。`1.5:1`は`3:2`として入力する）。**項数が現在のスロット数と一致しない入力は不正**。確定時に`expandRatioToPercents`で%へ展開して`mix`に保存（丸め剰余は**末尾スロット**に加算 — 下記丸め規則） |
| %直接編集 | `mix[index]`のみ更新（他スロットの自動按分はしない）。合計100のとき`reducePercentsToRatio`の**GCD約分**結果を比率欄に併記表示。**約分不能**（約分後の全項が1桁〔1〜9〕に収まらない。GCD=1を含む）なら比率は省略する |
| 合計≠100の間 | 比率欄は「—」表示＋disabled（展開・約分とも行わない） |

#### バッジ表記の正（指摘19・D-1の原則を維持）

混合バッジ文字列の**唯一の情報源は`formatMixBadge`**（§2.4）であることに変更はない。返り値の書式（v2.2）:

- 合計100かつ約分可能: `"60% + 40% (3:2)"`・`"50% + 30% + 20% (5:3:2)"`（全要素の%を`+`区切りで列挙＋末尾に約分比率を併記）
- 合計100だが約分不能: 比率省略で`"55% + 45%"`
- 合計≠100: 比率省略で`"60% + 50%"`（警告`mix.totalWarning`はUI/出力側でmix-errorバッジとして併記 — 上記値規約表）
- 単色・塗料0件: `""`（バッジ非表示）

UI・デザイン・エクスポータはいずれも`formatMixBadge`の返り値をそのまま表示し、独自にバッジ文字列を組み立ててはならない。

#### 丸め規則（指摘8, 15をv2.2で改訂）— 整数化と剰余の末尾スロット一括加算

%が整数になったため、丸めは**「各生値を切り捨てで整数化 → 目標合計`targetSum`との残差を末尾スロットへ一括加算」**に統一する（`allocateIntegerPercents(raw, targetSum)`。v2.1の「小数1桁四捨五入＋最大要素への残差加算」は廃止）。`targetSum`は文脈で決まる:

| 文脈 | targetSum |
|---|---|
| 比率→%展開（`expandRatioToPercents`） | `100` |
| 塗料削除の按分（`removePaintSlot`） | **削除前の合計値**（100でない場合もその値。合計≠100の文書は正規に存在し得るため。v2.1の方針を維持） |

例1（targetSum=100）: `1:1:1` → 生値33.33... → 切り捨て`[33, 33, 33]`（合計99）→ 剰余+1を**末尾**へ → **`[33, 33, 34]`**

例2（targetSum=90、合計≠100の文書から削除）: `[30, 30, 30]`から1件削除 → 残2件へ現在比（1:1）で按分 → 生値45/45 → 合計90=targetSumで剰余0 → **`[45, 45]`**（削除前合計90を維持）

**zodは合計100を検証しない**（合計100はUI上の有効条件。手入力途中のautosaveへの耐性のため。§2.5-10）。

#### 入力連動・塗料追加/削除時の再計算規則（指摘10, 16をv2.2で改訂）

| 操作 | 規則 |
|---|---|
| %を直接入力（確定時） | `mix[index]`を整数0〜100へclamp（小数入力は四捨五入で整数化）して設定。他スロットは不変（合計≠100はUIエラー表示で提示 — 上記値規約表） |
| 比率を入力（確定時） | `expandRatioToPercents`の結果を`mix`へ設定（項数=スロット数のみ受理） |
| **塗料追加（0件→1件目）** | **単色規約を適用: `paints=[{colorId}]`・`mix=null`のまま**（マスキング等の塗料0件工程への最初の追加。C-4の工程0件→塗料追加フローで必ず通る経路） |
| 塗料追加（単色→2色目） | `mix=[100, 0]`で混色化（既存スロット=100・新スロット=0） |
| 塗料追加（混色2〜4件→追加） | `mix`末尾に`0`を追加（既存値は不変） |
| 塗料削除（混色） | 削除スロットの%を残スロットへ**現在%比で按分**（丸め規則を`targetSum=削除前合計`で適用。残スロット全0なら均等按分）。削除前の合計を維持（合計≠100の場合もその合計値を維持） |
| 削除の結果1件になった | 単色規約へ変換: `mix=null` |
| 削除の結果0件になった | `paints=[]`・`mix=null` |

---

### 2.4 lib/mixRatio.ts 公開関数シグネチャ（v2.2: デザイン決定稿§8-B反映で全面改訂）

すべて純関数（引数を破壊しない）。UI・exporter・インポート正規化から共用する。

```ts
export interface StepPaint { colorId: string; }   // v2.2: percent/ratioValueは廃止（§2.3）
export type Mix = number[] | null;                // スロット順の整数%。単色・塗料0件はnull
export interface MixState { paints: StepPaint[]; mix: Mix; }

/** 比率テキストをパース。2〜5項・各1〜999の整数のみ受理（小数比率はv2.2で廃止）。不正は null */
export function parseRatioText(text: string): number[] | null;

/** 比率配列 → "5:3:2" テキストへ整形 */
export function formatRatioText(ratios: number[]): string;

/** 比率配列→整数%配列（合計100）へ展開。丸め規則（§2.3: 切り捨て＋剰余は末尾スロットへ一括加算）適用済み */
export function expandRatioToPercents(ratios: number[]): number[];

/** 丸め規則の本体（一般形）: 各生値を切り捨てで整数化し、targetSum（整数）との残差を末尾スロットへ
 *  一括加算。expandRatioToPercents / removePaintSlotの按分から共用（§2.3の丸め規則の実装） */
export function allocateIntegerPercents(rawPercents: number[], targetSum: number): number[];

/** 整数%配列→約分済み比率。合計100かつGCD約分後の全項が1桁（1〜9）のときのみ配列を返す。
 *  それ以外（合計≠100・約分不能）は null（比率表示は省略。§2.3） */
export function reducePercentsToRatio(percents: number[]): number[] | null;

/** mixの合計値（「計 n%」インジケータ・合計100判定に使用）。nullは0 */
export function sumPercents(mix: Mix): number;

/** UI有効条件（§2.3）: 混色は合計100のときのみtrue。単色・塗料0件（mix=null）は常にtrue */
export function isMixTotalValid(paints: StepPaint[], mix: Mix): boolean;

/** 10-2バッジ文字列（バッジ表記の唯一の情報源 — 指摘19/D-1の原則を維持）。
 *  合計100: "60% + 40% (3:2)" ／ 約分不能: "55% + 45%"（比率省略）
 *  合計≠100: "60% + 50%"（比率省略。警告mix.totalWarningはUI/出力側でmix-errorバッジとして併記 — §2.3）
 *  単色・塗料0件: ""（バッジ非表示） */
export function formatMixBadge(paints: StepPaint[], mix: Mix): string;

/** %直接入力の確定。値を整数0〜100へclamp（小数は四捨五入で整数化）し mix[index] のみ更新（他スロット不変） */
export function commitPercentInput(state: MixState, index: number, value: number): MixState;

/** 比率入力の確定。ratios.length === paints.length のみ受理し、expandRatioToPercentsの結果をmixへ設定。
 *  項数不一致・paints.length ≤ 1 の場合は現状態をそのまま返す */
export function commitRatioInput(state: MixState, ratios: number[]): MixState;

/** 塗料スロット追加（§2.3の規則: 0件→1件目=mix=nullのまま（単色規約）／単色→2色目=mix=[100, 0]／
 *  混色→mix末尾に0を追加／5件到達時は拒否（現状態を返す）） */
export function addPaintSlot(state: MixState, colorId: string): MixState;

/** 塗料スロット削除（§2.3の規則: 削除%を残スロットへ現在比按分（targetSum=削除前合計・剰余は末尾へ・
 *  残スロット全0なら均等按分）／残1件はmix=null（単色化）／0件はpaints=[]・mix=null） */
export function removePaintSlot(state: MixState, index: number): MixState;
```

**単体テストケース名（vitest）**:

- `parseRatioText`: 「'5:3:2'→[5,3,2]」「空白混じり' 3 : 2 'を受理」「小数'1.5:1'は拒否（v2.2: 整数のみ）」「'3:0'は拒否（0不可）」「1項は拒否」「6項は拒否」「非数値は拒否」
- `formatRatioText`: 「[5,3,2]→'5:3:2'」「[3,2]→'3:2'」
- `expandRatioToPercents`: 「3:2を[60,40]へ展開」「5:3:2を[50,30,20]へ展開」「1:1:1は[33,33,34]（剰余+1は末尾スロットへ）」「1:2は[33,67]（剰余は末尾へ）」「1:1:1:1:1の合計が100」
- `allocateIntegerPercents`: 「targetSum=100で剰余+1を末尾スロットへ加算」「targetSum=90で合計90になる（削除按分用）」「剰余0はそのまま返す」
- `reducePercentsToRatio`: 「[60,40]→[3,2]」「[50,30,20]→[5,3,2]」「[55,45]はnull（約分後11:9が1桁に収まらない）」「[33,33,34]はnull（GCD=1）」「合計≠100の[60,50]はnull」
- `sumPercents`: 「[60,40]→100」「[60,50]→110」「nullは0」
- `isMixTotalValid`: 「合計100はtrue」「合計110はfalse」「単色（mix=null）はtrue」「塗料0件はtrue」
- `formatMixBadge`: 「2色合計100は'60% + 40% (3:2)'」「3色合計100は'50% + 30% + 20% (5:3:2)'」「約分不能は'55% + 45%'（比率省略）」「合計≠100は'60% + 50%'（比率省略）」「単色は空文字」「塗料0件は空文字」
- `commitPercentInput`: 「mix[index]のみ更新し他スロットは不変」「101はclampされ100」「小数入力は四捨五入で整数化」
- `commitRatioInput`: 「[5,3,2]で[50,30,20]が設定される」「項数不一致は現状態を返す」「単色（1スロット）へは適用されない（現状態を返す）」
- `addPaintSlot`: 「**塗料0件への1件目追加はmix=nullのまま（単色規約）**」「単色に2色目追加でmix=[100,0]」「混色への追加でmix末尾に0（既存値不変）」「5件到達時の追加は拒否（現状態を返す）」
- `removePaintSlot`: 「削除スロットの%を残スロットへ現在比按分（剰余は末尾へ）」「**合計90（≠100）から削除しても削除前合計90を維持して按分**」「按分先が全0なら均等按分」「残1件でmix=null（単色化）」「全削除でpaints=[]・mix=null」

---

### 2.5 不変条件リスト（zodで強制）

`models/recipe.ts`のzodスキーマ（`superRefine`含む）で以下を強制する。

**Stepレベル**（2〜6はv2.2: デザイン決定稿§8-B反映で同番号位置のまま新mix規約へ差し替え）:
1. `paints.length ≤ 5`
2. `paints.length ≥ 2` ⇒ `mix ≠ null` ∧ `mix.length === paints.length`
3. `mix ≠ null` ⇒ 各要素は**整数**（`z.int()`）かつ 0〜100
4. `paints.length ≤ 1` ⇒ `mix = null`（2と4の対で `paints.length ≥ 2 ⇔ mix ≠ null` の双方向を構成）
5. （欠番。v2.2でmix再設計により統合 — 旧5「単色は`percent=100`」は廃止: 単色は`mix=null`で%を保持しない。規約は2〜4へ統合）
6. （欠番。v2.2でmix再設計により統合 — 旧6「`paints.length ≥ 2` ⇒ `mixMode ≠ null`」は2へ統合）
7. `paints`内の`colorId`に重複なし
8. `technique.presetKey`と`technique.label`が同時に非nullでない（マスタ所属チェックはzodでは行わない。§2.1）
9. `toolIds`内に重複なし
10. **mix合計100は検証しない**（指摘8の方針をv2.2でも維持。合計100はUI上の有効条件 — §2.3）

**RecipeDoc（文書）レベル**:

11. `palette[].id` / `tools[].id` / `parts[].id` / 全Step`id`（baseSteps・parts横断）はそれぞれ文書内一意
12. **クロス参照（指摘3）**: 全StepPaintの`colorId ∈ palette[].id`
13. **クロス参照（指摘3）**: 全Stepの`toolIds ⊆ tools[].id`
14. `palette`: `source='preset' ⇔ presetId非null`、`hex`は`^#[0-9A-Fa-f]{6}$`またはnull
15. `title`・`palette[].name`・`tools[].name`・`parts[].name`は空文字不可、日時はISO 8601
16. 写真参照（`overviewPhotoIds`/`steps[].photoId`/`chipPhotoId`。v2.2: 旧`parts[].photoIds`は廃止）はzodでは実体存在を検証しない（写真なしエクスポート許容のため。整合は§2.6/§2.7の正規化とランタイムフォールバックで担保）
17. **予約語（指摘21）**: `parts[].id ≠ "base"`（ルーティング`/recipe/:id/part/base`がベース工程編集に予約されているため。通常フローでは`part_<uuid>`形式のため発生しないが、手編集されたインポートファイルへの防御としてzodで拒否する）

**ドラフト既定タイトル規約（指摘22）** — 不変条件15（title空文字不可）と「新規作成→ドラフトID発行→即時autosave（保存ボタンなし）」フローを両立させるための規約:

- **作成時初期化**: 新規レシピのドラフト作成時（ID発行時点）に、`title`をi18nキー`recipe.untitledTitle`の値（ja: 「無題のレシピ」/ en: "Untitled Recipe"）で初期化する。既定名は作成時のUI言語で解決した**文字列値として文書に保存**する（特別なフラグや空値は持たない。後から言語を切り替えても保存済みtitleは変わらない）
- **空確定時の置換**: タイトル入力欄の確定（blur/Enter）時にトリム結果が空文字ならば、`recipe.untitledTitle`の既定名へ置換してから保存する
- この2点により、**autosaveがDexieへ書き込む文書は常に不変条件15を満たし**、`loadRecipe`のparse失敗（§2.7）で開けなくなるドラフトは発生しない。デザインパッケージC-2の「タイトル空なら既定名を補完」はこの規約を指すものとして読み替える

**RecipeExportFileレベル**:

18. `app='coat-codex'`・`kind='recipe-export'`のリテラル一致
19. `schemaVersion === recipe.schemaVersion`（エクスポート生成時にも保証）
20. `photos[].id`に重複なし、`dataUrl`は`^data:image\/(png|jpeg|webp);base64,`に一致（この3形式限定はアップロード時のmime正規化（§2.6）が保証するため、自アプリ生成ファイルのラウンドトリップは常に成立する）

---

### 2.6 参照整合性ポリシー

**色・ツールの削除（指摘3, 24）** — 「使用中は削除不可」:

- `lib/recipeRefs.ts`に`countColorUsage(doc, colorId): number` / `countToolUsage(doc, toolId): number`（参照しているStep数を返す純関数）を定義
- UIはpalette/toolsの各エントリに使用数を表示し、使用数>0のエントリは削除ボタンを無効化＋「N工程で使用中」を提示。0件のときのみ削除可
- 一括置換・連鎖削除は提供しない（シンプルさとデータ破壊防止を優先）
- この運用により通常フローでdangling colorId/toolIdsは発生せず、zodクロス参照検証（§2.5-12,13）が最終防衛線となる
- **デザイン成果物への必須要件（指摘24）**: 上記UI（`PaletteEditor`/`ToolListEditor`の各行における**使用数バッジ**（Badgeの使用数バリアント）と**使用中エントリの削除ボタン無効化＋「N工程で使用中」表示**）は、参照整合性ポリシーの一次防衛線であり**デザインパッケージのコンポーネントインベントリ・状態表に必ず含める**。「無条件削除可（✕ボタン常時活性）」の表現は本ポリシー違反であり採用しない
- **v2.6追記**: 上記「使用中は削除不可」（`countToolUsage===0`のときのみ削除可）は、`ToolListEditor`だけでなく`ToolSelect`（工程エディタ内・§3.3。**doc.toolsからの削除ボタンをv2.6で新設**）にも同様に適用する。チェック中（当該工程で選択中）のツールは使用数>0として扱い削除不可。なお本規則は`doc.tools`（レシピ内ツール）に対するものであり、§2.8のツールライブラリ（`userTools`）からの削除には適用しない（ライブラリは端末ローカルの管理対象であり、削除は既存レシピの`doc.tools`に一切影響しないため。§2.8）

**パーツ削除の整合性（v2.6新設）** — パーツ削除UI（`PartCardList`／`RecipeOverviewPage`。§3.3・§4.2 T50）における参照整合性:

- パーツ削除は**当該パーツの`steps[]`を巻き添えで削除**する（工程を個別に残す部分削除は提供しない）
- 削除対象パーツの各工程が参照していた`steps[].photoId`のBlobは、削除確定後の文書（`parts`配列からの除去後）で**もはや文書のどこからも参照されないもののみ**、`photoStore.deletePhoto`により**即時回収**する（他の工程・ベース工程が同一`photoId`を参照することはない設計だが、回収前に必ず更新後docへの非参照を確認してから削除する）。なおBlob回収はUI操作直後の即時実行であり、doc永続化（500ms debounce autosave）より先行する＝削除直後500ms以内のハードクラッシュ時は「旧永続docがdeleted blobを参照」する窓が理論上残るが、pagehide時のflushで実質限定され、欠損時もプレースホルダ縮退で無害（許容リスク）
- `photoCrops`・`palette`色（custom色のチップ写真Blob含む）・その他の派生データは、パーツ削除時点では回収せず、既存の**保存時自動GC**（`toPersistedDoc`。§2.6既存規約）に委譲する（パーツ削除固有の特別処理は設けない）
- 上記は**工程削除（既存の`PartEditorPage.tsx handleStepDelete`）にも同様に適用する**。旧実装は削除した工程の`photoId`に対応する写真Blobを回収しておらず`photos`テーブルに孤児レコードが残るバグがあったため、本改訂で「削除stepのphotoIdを退避→更新後docで非参照なら`deletePhoto`」を工程削除・パーツ削除の共通規則として明文化し、修正する（§4.2 T49）

**写真アップロード時のmime正規化・リサイズ（指摘17・指摘6）** — `photoStore.savePhoto(recipeId, file: Blob)`の保存前処理（実装はT13 `lib/imageProcessing.ts`。**本節が規則の正**）:

1. `Blob.type`が`image/png`・`image/jpeg`・`image/webp`のいずれかで、かつ**長辺2048px以下**なら、そのまま保存する（無変換・無劣化）
2. 上記3形式だが**長辺2048px超**の場合は、`createImageBitmap(blob, { imageOrientation: 'from-image' })`でデコード（失敗時は`<img>`+objectURLでのデコードにフォールバック）→ canvas縮小（長辺2048px）→ **同形式で再エンコード**（jpeg/webpは品質0.9、pngは無劣化）して保存する
3. それ以外（HEIC（iPhoneカメラ既定）・GIF・TIFF・BMP等、および`type`空文字）は、同様にデコード →（長辺2048px超なら縮小）→ `canvas.toBlob('image/jpeg', 0.9)`で**JPEGへ再エンコード**して保存する（GIFアニメは先頭フレームの静止画になる）
4. デコード不能な場合は保存を**中止**し、ユーザーへエラー表示（i18nキー`errors.unsupportedImageFormat`: 「対応していない画像形式です」）。部分保存・元Blobのまま保存はしない

これにより`photos`テーブルの全Blobは常に3形式のいずれかとなり、エクスポート時の`dataUrl`は§2.5-20の検証を必ず通過する（HEIC写真を含むレシピをエクスポート→再インポートした際に第3段フル検証で自己拒否するラウンドトリップ破綻を発生源で排除）。正規化は**アップロード時に1回だけ**行い、エクスポート時の再エンコードはしない。

**photoId欠損時フォールバック（指摘12）** — 対象となる参照箇所は`overviewPhotoIds`／`steps[].photoId`／`chipPhotoId`の3種（v2.2: 旧`parts[].photoIds`は廃止）:

- 発生源を2層で潰す:
  1. **インポート正規化**: `photos`同梱配列に実体がないphotoId参照（写真なしエクスポートのインポート等）は文書から除去する（配列参照は要素除去、`steps[].photoId`・`chipPhotoId`は`null`化。§2.7）
  2. **エクスポート時**: `photos`テーブルに実体のないphotoId参照は出力文書から除去する
- それでも残る異常系（DB手動破損等）へのランタイム防御: `photoStore.resolvePhotoUrl(photoId)`は欠損時`null`を返し、UIは「写真なし」プレースホルダを表示する。自動削除・自動修復はしない

---

### 2.7 Dexieテーブル定義とマイグレーション設計

**Dexieテーブル定義**:

```ts
// db/db.ts
class CoatCodexDB extends Dexie {
  recipes!: Table<RecipeDoc, string>;
  photos!: Table<PhotoRecord, string>;
  meta!: Table<MetaRecord, string>;
  userTools!: Table<UserToolRecord, string>;  // v2.6追加（§2.8）
  constructor() {
    super('coat-codex');
    this.version(1).stores({
      recipes: 'id, updatedAt',  // 主キー: id / 一覧ソート用インデックス: updatedAt
      photos:  'id, recipeId',   // 主キー: id / レシピ削除GC・エクスポート収集用: recipeId
      meta:    'key',            // 主キー: key（アプリ状態のKVストア。指摘20）
    });
    this.version(2).stores({
      userTools: 'id, updatedAt',  // v2.6追加: 主キー: id / 一覧ソート用インデックス: updatedAt（§2.8）
    });
  }
}
// PhotoRecord: { id: string; recipeId: string; blob: Blob; createdAt: string }
// mimeフィールドは持たない（Blob.typeで取得。指摘13。typeはアップロード時正規化で
// png/jpeg/webpのいずれかに保証される。§2.6）
// MetaRecord: { key: string; value: string | { requestedAt: string; granted: boolean } }
// UserToolRecord: { id: string; name: string; note: string | null; tags: string[]; createdAt: string; updatedAt: string }（§2.8）
```

**metaテーブルのレコード形状（指摘20）** — レシピ文書に属さないアプリ状態のKVストア。**キー・値型は本表が単一情報源**（利用仕様は§3.5）:

| key | value | 用途 |
|---|---|---|
| `persist` | `{ requestedAt: ISO 8601 UTC, granted: boolean }` | `navigator.storage.persist()`の要求履歴と結果（§3.5） |
| `recipeExport:<recipeId>` | ISO 8601 UTC | 当該レシピの最終JSONエクスポート日時（**レシピ単位**。未バックアップ判定・リマインダー経過判定に使用。グローバルな`lastExportedAt`キーは持たず、全体表示は本キー群の集約で行う） |
| `reminderSnoozedUntil` | ISO 8601 UTC | バックアップリマインダーの再表示抑止期限（「あとで」選択時に設定。Home/Overview共通） |

- metaレコードは**エクスポートファイルに含めない**（端末ローカルの状態であり、レシピデータではない）
- zodのRecipeDoc/RecipeExportFile検証の対象外。キー追加は上表の更新のみで行い、Dexieの`version()`変更は不要（KV形状は不変のため）

- **Dexieの`version()`はインデックス構造の変更専用、および新規テーブルの追加に用いる**（v2.6改訂: `userTools`テーブル新設のため`version(2)`を追加。既存`recipes`/`photos`/`meta`のストア定義は無変更のため`upgrade()`は不要＝新テーブルはDexieが自動的に空で作成する）。文書内容の形状変更はRecipeDocの`schemaVersion`＋lazy migrationで行う（全レコード一括書き換えの`upgrade()`は使わない）。この使い分けは不変: **インデックス構造変更＋テーブル追加＝`version()`／文書内容の形状変更＝`schemaVersion`**。

**ロード時lazy migration（指摘5）**:

```
loadRecipe(id):
  raw = db.recipes.get(id)
  if raw.schemaVersion > CURRENT_SCHEMA_VERSION:
      → UnsupportedSchemaError（UI: 「新しいバージョンのアプリで作成されたデータです」）
  if raw.schemaVersion < CURRENT_SCHEMA_VERSION:
      migrated = migrateRecipeDoc(raw)      // v→v+1の純関数を順次適用
      recipeDocSchema.parse(migrated)       // 検証
      db.recipes.put(migrated)              // 書き戻し（次回以降はmigration不要）
      return migrated
  return recipeDocSchema.parse(raw)         // 破損検知。失敗時はエラー表示（自動削除しない）
```

**一覧経路（listRecipes）のlazy migration（2026-07-05 非破壊クロップ実装時に判明した設計の穴の修正）**: `listRecipes` も各レコードへ同じマイグレーションパイプラインを適用する（in-memoryのみ・**書き戻しはしない**=書き戻しは`loadRecipe`のtx内責務）。ただし一覧の可用性を優先し、未来バージョン文書・migration後もparse失敗する破損文書は**throwせず当該レコードのみスキップ＋console.warn**（1件の異常でHome全体が死ぬのを避ける。個別を開いたときは従来どおり明示エラー）。旧実装は生レコードを返しており、v1文書が残る環境でv2新フィールドへの直アクセスがHome全滅を招いた。

```ts
// models/migrations.ts（v2導入済み: 2026-07-05 非破壊クロップ）
export const CURRENT_SCHEMA_VERSION = 2;
// key = 変換元バージョン。docRegistry[1] = v1→v2（photoCrops:{}付与＋schemaVersion:2）
// photosRegistry[1] = 恒等（photos形状はv1→v2で不変だが、migrateExportFileはphotos部にも
// レジストリを適用し欠落はMissingMigrationErrorを投げるため、恒等でも登録が必須）
const docMigrations: Record<number, (doc: unknown) => unknown> = {};
export function migrateRecipeDoc(raw: unknown): unknown;    // schemaVersionを読みCURRENTまで順次適用
export function migrateExportFile(raw: unknown): unknown;   // recipe部にdocMigrationsを適用＋photos形状の版差分を吸収
```

**インポートの3段検証＋正規化（指摘6, 7, 12, 14, 18）**:

1. `JSON.parse`（失敗→「JSONファイルとして不正」）
2. **第1段: ヘッダ検証** — 最小スキーマ`z.looseObject({ app: z.literal('coat-codex'), kind: z.literal('recipe-export'), schemaVersion: z.int().min(1) })`のみでparse。判定順は (a) `app`不一致→「coat-codexのファイルではありません」 (b) `kind`不一致→「対応していない種類のcoat-codexファイルです」 (c) `schemaVersion > CURRENT`→「新しいバージョンで作成されたファイル」。いずれもこの時点で中断し、**別kindのファイルにrecipe前提の`migrateExportFile`が実行されることはない**（§2.2で宣言した種別判別をヘッダ段で実施。指摘18）
3. **第2段: マイグレーション** — `migrateExportFile(raw)`でCURRENTまで引き上げ
4. **第3段: フル検証** — `recipeExportFileSchema.parse`（§2.5の全不変条件を含む）
5. **正規化（normalizeImport）**:
   - a. **全ID新規採番（指摘7）**: `rcp_/col_/tool_/part_/stp_/ph_`の全IDを新規生成し、旧ID→新IDのMapを作成（既存DBとの衝突有無に関わらず常に実施。同一ファイルを2回インポートすると2レシピになる。上書きインポートはしない）
   - b. **参照リマップ**: `colorId` / `toolIds` / `overviewPhotoIds` / `steps[].photoId` / `chipPhotoId` / `photoCrops`のキーをMapで一括置換（v2.2: 旧`parts[].photoIds`は廃止。photoCropsのMap外キー=danglingクロップは脱落）
   - c. **dangling photo除去（指摘12）**: `photos[].id`に実体がないphoto参照（`photoCrops`のdanglingキー含む）を文書から除去（写真なしエクスポート対応）
   - d. **presetKey降格（指摘14）**: マスタ外の`presetKey`は`{ presetKey: null, label: <旧キー文字列> }`へ降格
   - d′. **palette[].presetId降格（2026-07-03 M5実装時に裁定・明文化）**: `source: "preset"`の色の`presetId`が塗料プリセットマスタに実在しない場合、`{ source: "custom", presetId: null }`へ降格（色名・hex・brand文字列は保持。INV-14整合）。プリセット改廃（AK除外等）後の旧エクスポートJSONを壊さず取り込むための規則。**判定の3分岐**: ①ブランドがプリセットindex（public/paints/index.json）に存在しない→降格 ②ブランドはindexに存在するが色一覧のfetchに失敗（ネットワーク一過性）→降格せずpresetのまま維持（正規色の不可逆劣化を防ぐ） ③index自体が取得不能→降格処理全体をスキップしインポートは続行
   - e. `schemaVersion = CURRENT`、`createdAt`は保持、`updatedAt = now`
6. **書き込み**: Dexieのrwトランザクションで、`photos`（dataUrl→Blob変換、`recipeId`=新ID、`createdAt`=now）を`bulkAdd`→`recipes.add`。失敗時はトランザクションごとロールバック

---

### 2.8 ツールライブラリ（v2.6新設: 2026-07-13ユーザーFB裁定）

レシピ横断でユーザーが使い回す「塗装ツール」（筆・スポンジ・エアブラシ等）を、個々のレシピの`doc.tools[]`とは独立した**端末ローカルのライブラリ**として管理する。管理画面は`/tools`（ToolsPage。§3.1/§3.3）。

**データモデル**:

```ts
// UserToolRecord（db/db.ts。Dexie version(2)。§2.7）
interface UserToolRecord {
  id: string;         // `utool_${crypto.randomUUID()}`（doc.tools側の `tool_` プレフィックスと衝突しないよう区別）
  name: string;       // trim済み・空文字不可
  note: string | null;
  tags: string[];     // 正規化済み（先頭 # なし・trim・大小無視dedupe）。表示時のみ `#` を付与
  createdAt: string;  // ISO 8601 UTC
  updatedAt: string;  // ISO 8601 UTC
}
```

`db/toolStore.ts`（新規）が最小API面を提供する: `listUserTools()`（name昇順）／`findUserToolByName(name)`／`registerUserTool({ name, note?, tags? })`（同名（後述`toolNameKey`一致）が既存なら新規作成せず既存を返す。戻り値`{ tool, created: boolean }`）／`updateUserToolTags(id, tags)`／`deleteUserTool(id)`。Dexie上のレコード自体にzodスキーマは設けない（`packages/recipe-core`の無変更を構造的に保証するため。外部入力を伴うライブラリのエクスポート/インポートファイルのみ後述のzod検証を持つ）。

**正規化規約**:

- `toolNameKey(name)` = `name.normalize('NFC')` → `trim()` → `toLowerCase()`。ツール名の重複判定（登録・自動登録・インポートのマージ）はすべて本キーで行う
- `normalizeTag(tag)` = `tag.normalize('NFC')` → `trim()` → 先頭の `#`（半角・全角 `＃`。正規表現 `/^[#＃]/`）を除去。dedupeは`toolNameKey`同様に大小無視で行う。表示（`TagChipEditor`等）は常に先頭に `#` を付与して描画する

**`doc.tools[]`（RecipeDoc）との関係**:

- レシピの`doc.tools[]`のデータ構造（§2.1）は**変更しない**。ツールライブラリは「新規登録の自動登録先」および「工程での選択候補（サジェスト源）」として機能するのみで、参照関係は持たない
- 工程エディタ（`ToolSelect`）でユーザーがツールを選択・新規追加した際は、ライブラリの`UserToolRecord`から`{ id: "tool_<uuid>"（新規採番）, name, note }`を`doc.tools`へ**コピー**する（参照ではない）。これにより、**ライブラリからツールを削除しても既存レシピの`doc.tools`・工程（`toolIds`）には一切影響しない**
- ツールライブラリは**RecipeDoc・RecipeExportFile（§2.2）・レシピのJSON/Markdown/SNS共有等いずれの公開データ・エクスポート成果物にも搭載しない**。これにより`schemaVersion`は**3のまま不変**（タグはライブラリにしか存在しないフィールドであり、RecipeDocスキーマへの変更が一切発生しないため）
- レシピのJSONインポート・Scriptoriumインポート（インポート経由の新規ツール名）からは、ツールライブラリへ**自動登録しない**（インポートされた見知らぬ大量のツール名でライブラリが汚染されるのを防ぐ。自動登録は工程エディタ／Setupのユーザー操作起点の新規追加に限る。§4.2 T55）

**専用エクスポート/インポートファイル形式**（バックアップ・端末移行手段。レシピのエクスポート形式＝§2.2とは別物）:

```ts
// kind: "tool-library"（RecipeExportFileの "recipe-export" とは異なる種別。ヘッダ検証で判別）
interface ToolLibraryExportFile {
  app: 'coat-codex';
  kind: 'tool-library';
  version: 1;
  exportedAt: string;               // ISO 8601 UTC
  tools: Array<{ name: string; note: string | null; tags: string[] }>;  // id は載せない
}
```

- `id`はエクスポートに含めない。インポート時は常に**新規採番**する（レシピのインポート同様、上書きインポートはしない）
- **マージ規約**（`mergeImportedTools`）: インポート対象の各ツールを`toolNameKey`で既存ライブラリと突き合わせ、①**一致**→タグを**union**（大小無視dedupe）し、既存の`note`が`null`の場合のみインポート側の`note`で補完（既存`note`が非nullなら維持）②**不一致**→新規エントリとして追加。結果は`{ added, merged }`件数で返す

**一括移行（v2.7新設: 2026-07-14ユーザーFB裁定）**:

- `/tools`ページ（ToolsPage）に「レシピから取り込む」ボタンを設け、押下時にDexie上の全レシピの`doc.tools[]`を収集し、`toolNameKey`マージで一括してライブラリ（`userTools`）へ取り込む。マージ規約は上記`mergeImportedTools`（T54）をそのまま再利用する（タグはunion、noteは既存null時のみ補完）。結果は`{ added, merged }`件数のトーストで報告する（0件時もその旨を表示）。本操作はレシピ側`doc.tools`を一切変更しない（片方向の取り込みのみ）
- 再実行しても同じレシピ集合からは新規追加が発生しない（冪等）。既存の登録済みタグ・noteは維持される

**将来方針（v2.7新設）**:

- `doc.tools[]`はツールライブラリ導入前の経過措置であり、レシピ内のツール参照は将来的に**ツールライブラリへの完全移行**を予定している（本改訂時点では`doc.tools`の構造自体は変更しない）。工程エディタ（`ToolSelect`。§3.3・§4.2 T60）にはこの方針を利用者へ示す断り書きを表示する

---

## 3. 画面・コンポーネント分割

### 3.1 ルート構成

react-router v7（declarative mode、`BrowserRouter`。SPAフォールバックは§5.2の方針＝`_redirects`なし・`404.html`非配置）。**全8ルート**で要件の全画面＋ツールライブラリ管理を賄う。

> **v2.6改訂経緯（2026-07-13ユーザーFB裁定）**: v1〜v2.5では「全7ルートで要件の全画面を賄い、これ以上の画面追加はしない」としていたが、ツールをレシピ横断のユーザーデータ（ライブラリ）として管理する要望を受け、管理画面を新ルート `/tools`（ToolsPage）として追加することをユーザーが裁定した。これにより本節のルート数は7から**8**へ改訂する。**「これ以上の画面追加はしない」という従前の制約は本改訂をもって解除し、以降の画面追加は都度本仕様書の改訂（§番号を明示した改訂履歴への追記）を経て行う**こととする。

| パス | 画面 | 役割 |
|---|---|---|
| `/` | HomePage | 保存済みレシピ一覧・新規作成・**JSONインポート**・データ保全ステータス（§3.5） |
| `/recipe/:id/setup` | RecipeSetupPage | 10-1 初期入力（タイトル／全体写真／カラー／ツール登録）＋**JSONインポート導線**（要件10-1どおり新規作成と並置） |
| `/recipe/:id` | RecipeOverviewPage | 10-2 ペイント構成全体表示。パーツカードD&D・ベース工程オーバーレイ・出力アクションバー |
| `/recipe/:id/part/base` | PartEditorPage（baseモード） | **ベース工程の編集（予約ルート）**。`partId = "base"` を予約語とし、パーツIDには使用禁止（パーツIDは `part_` プレフィックス付きで生成される — これは生成規約でありzodでは強制しない。**予約語 `"base"` の拒否はスキーマ§2.5の不変条件17（`parts[].id ≠ "base"`）として定義され、zod（superRefine）で実装される**） |
| `/recipe/:id/part/:partId` | PartEditorPage | 10-3 パーツ工程編集。モバイル＝フルページ、PC幅＝`/recipe/:id` 上のスライドインパネルとして描画 |
| `/recipe/:id/print` | PrintViewPage | 印刷／PDF用レイアウト（`print.css`） |
| `/terms` | TermsPage | **利用規約・免責**。データ消失自己責任（要件1章）の明記場所。全画面フッターからリンク |
| `/tools` | ToolsPage | **v2.6追加**: ツールライブラリ管理（一覧・追加・タグ付け・削除・専用エクスポート/インポート。§2.8/§3.3）。`AppFooter`から常設導線 |

- ルート定義は `/recipe/:id/part/base` を `:partId` より先に記述する（react-routerは静的セグメントを優先マッチするため順序非依存だが、意図を明示するため）。
- 新規作成フロー: Home「新規作成」押下（**このクリックハンドラ直下で `navigator.storage.persist()` を要求**。§3.5）→ ドラフトID発行・**既定タイトルを設定して初回Dexie書き込み** → `/setup` → 「make codex!」→ `/recipe/:id`。
- **ドラフトの既定タイトル規約（正の定義はスキーマ§2.5およびD-8。本節は運用フローの要約）**: ドラフト作成時点でタイトルに既定名（i18nキー `recipe.untitledTitle`。ja「無題のレシピ」／en "Untitled Recipe"）を設定してから書き込む。これによりautosaveされる文書は常にスキーマ§2.5-15（title空文字不可）を満たし、`loadRecipe` のparse失敗は起こらない。以降 `TitleInput` を空にした状態でautosaveが走る場合も、保存時に既定名へ補完して書き込む（UIの入力欄は編集中は空のまま維持し、blur時に補完後の既定名を表示する＝D-8）。デザインパッケージC-2の「タイトル空なら既定名を補完」はこの規約を参照する。

### 3.2 手書きラフ案（要件10章）からの変更提案

要件10章の「より良いUI/UX構成があれば代案提案してよい」との申し送りに基づく変更点。**特に(2)は要件原文からの解釈変更であることを明記する。**

1. **ホーム＝レシピ一覧画面を追加** — IndexedDBに複数レシピが貯まるため、保存済みレシピへの再アクセス導線が必須。
2. **【解釈変更】10-2のD&Dカードの対象を「工程」から「パーツ」に変更する** — 要件10-2原文は「工程（1st paint, 2nd paint...）をカード形式で…D&D並び替え」だが、工程はパーツ数×工程数で数十件になり得て全体画面での直接並び替えは誤操作リスクが高く、全体画面はパーツ単位の俯瞰が主目的であるため。**その代わり工程自体の並び替え手段は10-3の `StepList` をdnd-kit Sortable化して必ず提供し、要件の「工程を並び替えられる」機能は失わない**（§3.3参照）。
3. **ベース工程編集は予約ルート `/recipe/:id/part/base` でPartEditorPageを共用** — 工程・塗料・混合比のUIがパーツ工程と完全同一のため専用画面は不要。遷移経路はOverviewの**BASEカード**（v2.3改訂で外出しカード化。旧BaseStepOverlayは廃止）から明示的に定義（§3.3）。
4. **10-3はモバイル＝フルページ／PC幅＝スライドインパネル** — PCでは全体構成を見ながら編集でき、往復遷移が減る（同一コンポーネント＋レイアウト分岐のみ）。
5. **JSONインポートはHomeと10-1（Setup）の両方に設置**（v1の「Homeに集約」案を撤回）— 要件4章・10-1に「初期入力画面からインポート」と明記されているため。
6. **利用規約・免責ページ `/terms` を追加** — データ消失自己責任（要件1章）を明記する場所が画面構成に必要なため。
7. **データ保全UI（永続化状態・使用量・エクスポート促し）をHome/全体表示に追加** — SafariのITPによる7日間未訪問時ストレージ消去への対策（§3.5）。
8. **全体写真複数枚時は先頭（`overviewPhotoIds[0]`）を代表写真とする規約を明文化** — ベース工程オーバーレイの表示先・SNS合成画像の1枚目・レシピ一覧サムネイルはすべて代表写真を使用し、Setup画面の写真並び替えで代表を変更できる。

### 3.3 画面別コンポーネント表

| 画面 | 主要コンポーネント | 責務 |
|---|---|---|
| **AppShell**（全画面共通） | `LanguageSwitcher` / `AppFooter` / `ToastHost` | ja/en切替（localStorage永続化）／`/terms` へのリンク常設／保存・エラー通知 |
| **HomePage** | `RecipeCardGrid` → `RecipeCard` | updatedAt降順一覧。カードに**未バックアップドット**（Badge dotバリアント。判定は§3.5のレシピ単位鮮度: `recipeExport:<id>` が無い、または `updatedAt` より古い）表示、メニューから「開く／複製／削除／JSONエクスポート」。**一覧ロード中は `Skeleton`（cardバリアント）、レシピ0件時は `EmptyState`（homeバリアント: 新規作成・インポートのCTA付き）を表示** |
| | `NewRecipeButton` / `ImportJsonButton` | 新規作成（**クリックハンドラ直下で `storage.persist()` 要求 §3.5** → ドラフトID発行・既定タイトルで初回保存）→`/setup`。**JSONインポート**（**ファイル選択確定のユーザー操作直下で `storage.persist()` 要求 §3.5** → zod検証→migrations→保存→当該レシピのOverviewへ） |
| | `ImportErrorDialog` | **Dialog error-detailバリアント（デザインB-2/C-1/C-2対応）**。JSONインポートのzod検証・migrations失敗時に、エラー詳細（スキーマパス・メッセージの一覧、schemaVersion不一致の説明）を表示。処理フックはHome/Setup共通（`useJsonImport`）で、本ダイアログも両画面から共用 |
| | `StorageStatusBar` / `ExportReminderBanner` | §3.5参照。永続化状態・使用量・最終エクスポート表示／バックアップ促し |
| **RecipeSetupPage** (10-1) | `TitleInput` / `OverviewPhotoUploader` | タイトル（**空のままautosave時は既定名へ補完して保存。§3.1の既定タイトル規約参照**）／全体写真（複数可・**先頭＝代表写真**・並び替えで代表変更） |
| | ~~PaletteEditor~~ / `ToolListEditor` | **v2.3: 使用カラーの先行登録は廃止**（色は工程のPaintPickerからのみ追加。**参照0のpalette色は保存時に自動GC** — custom色のチップ写真Blobも`deletePhoto`で回収。§2.6の削除ガードはツール側のみ存続）。`ToolListEditor`（使用ツールの先行登録）は維持 — 各行に使用数バッジ・使用中削除不可（スキーマ§2.6）。**v2.6追記: 新規ツール名の追加時、同名（`toolNameKey`一致）がツールライブラリ（§2.8）に無ければ`registerUserTool`で自動登録**（fire-and-forget・失敗はconsole.warnのみ） |
| | `ImportJsonSection` | **要件10-1どおり新規作成と並置のインポート導線**（処理・エラー表示はHomeと共通: `useJsonImport`＋`ImportErrorDialog`。**ファイル選択確定時に `storage.persist()` 要求 §3.5**） |
| | `MakeCodexButton` | Overview（`/recipe/:id`）へ遷移する（純粋なナビゲーション。**永続化要求はここではなく§3.5のとおり最初のDexie書き込みを伴うユーザー操作直下で実施済み**。Setup編集自体が即時autosave対象のため、本ボタンは「保存確定」ではない） |
| **RecipeOverviewPage** (10-2) | `OverviewHeader` ＋ **BASEセクション（v2.3改訂: 2026-07-03ユーザー決定でオーバーレイ廃止・外出しカード化）** | **旧`BaseStepOverlay`（写真上の墨帯チップ列）は廃止**。代表写真の下・PARTSリストの上に見出し「BASE」＋独立カード1枚を表示（PartCardを合成part `{id:"base"〔INV-17予約語〕, name:「ベース工程（全体）」, steps: baseSteps}` で再利用・番号セルなし・SortableContext外）。カードタップで `/recipe/:id/part/base` へ遷移、「工程レビュー」でPartReviewDialogのbaseモード（**共有ボタンなし** — §3.4「ベース単独共有は対象外」維持）。未登録時はカード位置に「＋ベース工程を追加」破線ピル。**将来のモデリング工程等の工程グループ拡張の受け皿**（§7）。代表写真ロード中は `Skeleton`（photoバリアント） |
| | `OverviewPhotoStrip` | 2枚目以降の全体写真サムネイル（ロード中は `Skeleton` photo） |
| | `PartCardList`（dnd-kit Sortable）→ `PartCard` | **パーツカードのD&D並び替え**（§3.2の(2)）。サムネ・工程数・混合バッジ表示、タップで10-3へ。**サムネ＝写真がある最後の工程の写真（なければプレースホルダ）＋`STEP n`タグ**（v2.2: デザイン決定稿§8-A反映）。**混合バッジの文字列は `formatMixBadge` の出力をそのまま表示する（単一情報源）**: 合計100時＝**「60% + 40% (3:2)」**形式（約分不能時は比率省略「55% + 45%」）、合計≠100時＝比率省略＋警告併記（v2.2: §2.3の書式が正）。デザインパッケージのバッジ表記もこの形式に従う。**v2.3: カードに「工程レビュー」ボタンを追加→`PartReviewDialog`（読み取り専用ビュー: 工程番号・技法・スウォッチ/混合バッジ・ツール・メモ・工程写真。モバイル=フルスクリーンシート/PC=モーダル。「このパーツを編集」導線と共有ボタン=X/Bluesky→ShareDialog起動を内包。§3.4）**。カードタップ=編集直行は維持。**パーツ0件時は `EmptyState`（partsバリアント: パーツ追加CTA付き）**。**v2.6追加: controls列（ドラッグハンドル・↑↓移動ボタン）に削除✕ボタンを新設**（44pxタッチターゲット維持）。押下で`RecipeOverviewPage`側の`ConfirmDialog`（title=パーツ名埋込・description=「工程と写真も削除されます」）を起動し、確定でパーツ（`steps[]`含む）を削除、非参照となった`steps[].photoId`のBlobを回収（§2.6「パーツ削除の整合性」）。**v2.7改訂（2026-07-14ユーザーFB裁定・§4.2 T61）: カード高を超えていた左カラム独立controls列は廃止し、操作ボタンをカード内へ統合**する。⋮⋮ドラッグハンドルは行頭（原設計どおり）に残し、↑↓✕はPC(768px〜)ではカード右端の横並びグループ・モバイルではカード右端の縦列として描画する（意匠の正はデザイン仕様書§Card参照）。ボタン領域は`stopPropagation`でカードタップ（編集直行）の誤発火を防ぐ |
| | `AddPartButton` | パーツ追加→10-3へ |
| | `ExportActionBar` | 印刷（**v2.3改訂 2026-07-03ユーザー決定: PDFボタンは廃止し「印刷」へ統合**。挙動が同一〔両方/printへ遷移〕でPDF保存の案内はPrintToolbar側に常設のため。専用PDF生成を将来導入する場合の§6判断は不変）／X共有・Bluesky共有（**v2.3: 全体共有=全体写真ベース候補カード。§3.4**）／note.com向けMD／**JSONエクスポート・素のMarkdownエクスポート（要件どおり隣接配置）**。`SnsTarget`配列登録制。**v2.3改善: モバイルの下部固定バーは廃止し「出力・共有」ボタン→ボトムシート（Dialogボトムシート形態）に整理**（ユーザーフィードバック「下部Post系がダサい」対応。PC幅は従来のピル群）。JSONエクスポート成功時は `meta` の `recipeExport:<recipeId>` を更新（§3.5） |
| | `ShareDialog` | SNS共有の2系統UX（§3.4）。`ShareImagePreview`（**最大4枚**）／`ShareTextEditor`／共有・Intent・DLボタン群。**A系統の主ボタンは合成画像の生成完了までdisabled＋進行表示**（§3.4） |
| | `ExportReminderBanner`（コンパクト帯） | §3.5参照。**当該レシピが未バックアップの場合のみ表示され、当該レシピのエクスポートで消える（Homeのグローバルバナーとは判定粒度が異なる）** |
| **PartEditorPage** (10-3) | `PartEditorHeader` ＋ `StepPhotoStrip` | 通常: `PartNameInput`（**パーツ写真ギャラリーはv2.2で廃止 — 工程写真はStepCard内の`StepPhotoTile`へ。デザイン決定稿§8-A反映**）／**baseモード: 固定見出し「ベース工程（全体）」＋代表写真の読み取り専用サムネ**（全体写真の編集はSetupに誘導）。**モバイルのみヘッダ直下に`StepPhotoStrip`＝写真つき工程のサムネを番号付きで横並び表示し、タップで該当工程（StepCard）へスクロール**（v2.2: §8-A）。工程編集UI以下は両モード完全共通。**v2.6修正: `handleStepDelete`は削除stepの`photoId`を退避し、更新後docで非参照となった場合のみ`deletePhoto`で回収する**（従来は写真Blobが孤児化するバグがあった。§2.6「パーツ削除の整合性」・§4.2 T49） |
| | `StepList`（**dnd-kit Sortable**） | **工程カードのD&D並び替え**。各 `StepCard` にドラッグハンドル、モバイル・アクセシビリティ用に上下移動ボタンを併設。**工程0件時は `EmptyState`（stepsバリアント: 工程追加CTA付き）** |
| | `StepCard` | `TechniqueSelect`（プリセット or 自由入力）／`PaintSlotList`（max5、A〜E）→ `PaintSlot`＝`BrandSelect`+`ColorSelect`+`SwatchChip`+**%入力**／`MixRatioInput`（**%主体入力＋比率入力補助＋「計 n%」表示。合計≠100はerror皮＋メッセージ＋比率欄「—」disabled — §2.3。v2.2: デザイン決定稿§8-B反映**）／`ToolSelect`（**v2.3: 登録済みツールのチェック選択＋その場で新規ツール名を追加登録** — 追加はdoc.toolsへ登録し当該工程に即チェック・既存名はトリム比較で再利用。**v2.6追加: ツールライブラリ（§2.8）からのサジェスト節**（未選択かつライブラリに存在するツール名を候補表示・draft入力の部分一致絞り込み＋タグチップ絞り込み・候補クリックでdoc.toolsへコピー＋当該工程へ即チェック・`/tools`への管理リンクを節フッターに設置・ライブラリ0件時は節ごと非表示）＋**doc.tools各行に削除✕ボタン**（`countToolUsage(doc, id)===0`のときのみ活性。使用中はdisabled＋注記。§2.6。**v2.7改訂（2026-07-14ユーザーFB裁定・§4.2 T60）: 「使用中のため削除できません」の行内注記は廃止し、リスト下の一元ヒント1行に集約する。削除不可（使用中）のツール行は✕自体を非描画とし、削除可能な行のみ✕を表示する（disabledボタンの残置を廃止）。当該ヒント行には「ツールは今後ツールライブラリへ完全移行予定」の断り書きも併記する**）／**下段に`StepPhotoTile`（工程写真1枚: 84pxタイル・`STEP n`タグ・空は破線「＋ 写真 1枚」）＋`MemoField`のペア（v2.2: §8-A）**／工程削除 |
| | `AddStepButton` | 工程追加 |
| **PrintViewPage** | `PrintRecipeSheet` / `PrintToolbar` | 印刷最適化レイアウト。ツールバー（印刷実行・PDF保存案内）は `@media print` で非表示 |
| **TermsPage** | 静的コンテンツ（i18n） | 利用規約・**データ消失自己責任の免責明記**・ブラウザストレージの性質説明・**商標表記（原文=docs/legal/coat-codex_商標表記.md。ブランド名主語の運営元非依存の言い回しを維持）** |
| **ToolsPage**（v2.6新設・§2.8） | `BackLink`／追加行（input＋追加ボタン・Enter確定・重複無視）／一覧（name昇順・各行に`TagChipEditor`＋削除✕）／fileActionsRow（エクスポート／インポート／**v2.7追加: 「レシピから取り込む」ボタン**） | ツールライブラリ（`userTools`）の一覧・追加・タグ付け・削除・専用エクスポート/インポート。削除は`ConfirmDialog`（description=「登録済みレシピからは削除されません」）経由。0件時`EmptyState`。`AppFooter`に常設導線。**v2.7改訂（2026-07-14ユーザーFB裁定・§4.2 T59）: 「レシピから取り込む」ボタン**押下で全レシピの`doc.tools`を`toolNameKey`マージで一括取り込み（§2.8「一括移行」参照）、結果`{ added, merged }`件数をトースト表示 |
| | `TagChipEditor` | `#名`表示のチップ列＋除去✕・追加input（`normalizeTag`・重複無視）。制御コンポーネント |

- 編集はすべて即時autosave（debounce 500ms → Dexie書き込み）。「保存ボタン」は設けない（v1踏襲）。ドラフトは§3.1の既定タイトル規約により最初の書き込み時点からスキーマ適合。
- **状態規約部品の割当まとめ（デザインB-2実装契約との対応）**: `EmptyState` は home（HomePage）／parts（Overview）／steps（PartEditor）の3バリアント、`Skeleton` は card（HomePage一覧）／photo（Overview代表写真・写真ストリップ・StepPhotoTile／StepPhotoStrip（v2.2: 旧PartPhotoGalleryから変更））の2バリアント、`ImportErrorDialog` はDialog error-detailバリアントとして本表のとおり画面に割り当てる（実装タスク側はこの割当を完了条件に含めること）。

### 3.4 SNS共有の2系統UXフロー

> **v2.3改訂（2026-07-03ユーザー決定・同日2起点型へ詳細化）: SNS共有は「全体」と「パーツ」の2起点**。
> **同日追加決定（実機フィードバック起点）**: ①候補カードの**先頭に「まとめカード」を常設**（whole=タイトル・進捗・palette最大12色スウォッチ＋「+N」／part=タイトル・パーツ名・工程リスト最大8行＋「…他N工程」・使用色スウォッチ。写真を持たない「レシピの表紙」で、写真ゼロのレシピでも画像付き共有が成立）②全カードに秘伝書意匠（金罫ヘッダ＋オーバーライン「COAT CODEX — PAINT RECIPE」・明朝タイトル常設・フッタ罫＋#coatcodex・朱の工程番号）③投稿既定テキストは技法の流れ入り（part=「{title} - {partName}の塗装レシピ。{最初}→…→{最後}、全{n}工程。#coatcodex」〔工程3以下は全列挙〕／whole=「{title}を塗り上げました。パーツ{p}・全{s}工程の塗装レシピ。#coatcodex」）。**候補0件のテキストのみ共有パスは対象パーツ不在時のみの縁ケースに縮退**
> **2026-07-05改訂（ユーザーiPhone実機FB・承認済み計画ループA）**: ④カード寸法を**1200×900（4:3横長）→1080×1350（4:5縦長）**へ変更（縦長が多いミニチュア写真の上下切れを大幅減。whole写真領域は約1:1に）⑤DLファイル名を連番`coat-codex-share-N.png`から**「レシピ名＋内容＋ランダム5文字」**へ変更（詳細はB系統5'）
> **2026-07-05改訂（承認済み計画ループB: 非破壊クロップ）**: ⑥カードの写真描画は`photoCrops`（§2.1）を反映する — `computeCoverSourceRect`はクロップ矩形でソース空間を制限してからcover計算（クロップ→その中でcover。未設定時は従来と同一）。アプリ内の写真表示（サムネ・レビュー・印刷）も共通部品`CroppedPhoto`（2段CSS cover・無歪み）で同じ領域を表示する。クロップ編集UI=`PhotoCropDialog`（矩形ドラッグ＋四隅ハンドル・最小10%・単発アップロード直後の自動オープン＋タイル「トリミング」導線。対象は全体写真・工程写真のみ=chipPhotoId対象外）
> ① **全体共有**（`ExportActionBar`起点・従来配置）: 画像は**Codex全体のPhoto** — 全体写真（`overviewPhotoIds`）それぞれ＋レシピ情報（タイトル）を1枚絵にした候補カードから**ユーザーが最大4枚選択**。テキスト既定=タイトル＋概要＋`#coatcodex`
> ② **パーツ共有**（**`PartReviewDialog`（パーツ工程レビュー）内の共有ボタン**起点 — 2026-07-03追加決定: PartCardに「工程レビュー」ボタンを設け、読み取り専用のレビュービューから共有する。共有前に内容を確認できる導線）: 画像は**工程ごとの1枚絵**（全体画像＋工程写真＋工程情報）候補から**ユーザーが最大4枚選択**。テキスト既定=タイトル＋パーツ名＋工程サマリ＋`#coatcodex`
> X・Bluesky共通で**投稿テキストにURLを含めない**（Xのリンク付き投稿リーチ抑制対策）・**`#coatcodex`はトリム対象外**。ベース工程単独の共有は対象外（全体共有でカバー）。

分岐は**UA判定ではなく機能検出**（`navigator.canShare({ files })`）で行う。結果的にモバイルは主にA系統、デスクトップは主にB系統になる。

**共通前処理（ShareDialogオープン時）**
1. 起点は2つ（v2.3）: **全体共有**=`ExportActionBar`の「X」「Bluesky」ボタン／**パーツ共有**=`PartReviewDialog`（PartCardの「工程レビュー」→読み取り専用ビュー）内の共有ボタン。いずれも対象文脈（レシピ全体 or `partId`）を持って `ShareDialog` を開く（`SnsTarget` 登録制は不変）。
2. **ダイアログ表示と同時に** `imageComposer` が投稿用合成画像の**候補カード**を生成開始（v2.3）。**全体共有**: 全体写真（`overviewPhotoIds`）それぞれ＋レシピ情報（タイトル）の1枚絵を写真順に全件生成。**パーツ共有**: 対象パーツの写真つき工程（`steps[].photoId`非null）それぞれについて「全体画像（代表写真）＋パーツ画像（当該工程の写真）＋工程情報（工程番号・技法・塗料スウォッチ/混合バッジ）」の1枚絵を工程順に全件生成。いずれも**ユーザーが`ShareImagePreview`で最大4枚を選択**（既定=先頭4枚を選択済み。選択変更は生成済み`File`の組み替えのみで再生成しない=transient activation維持）。候補0件（全体写真なし／写真つき工程なし）はA系統を「テキストのみで共有」・B系統をIntentのみに切替。`File[]`（image/png）として保持完了させる — **後段の `navigator.share()` をユーザークリック直下（transient activation内）で同期的に呼ぶため、クリックハンドラ内で非同期生成しない**。**生成中はダイアログの `ShareImagePreview` にプレースホルダ＋進行表示（「画像を生成中…」）を出し、A系統の主ボタンとB系統の「合成画像をダウンロード」ボタンは生成完了までdisabledにする**（活性条件＝`File[]` 保持完了）。**生成失敗時**はエラートーストを表示し、A系統では「テキストのみで共有」に主ボタンを差し替え（`navigator.share({ text })`）、B系統ではDLボタンを非活性のままIntentボタンのみ有効とする。
3. 投稿テキストを自動生成（**v2.3: 全体共有=タイトル＋概要＋`#coatcodex`／パーツ共有=タイトル＋パーツ名＋工程サマリ＋`#coatcodex`。いずれもURLは含めない**。編集可）。ターゲット別カウンタを表示: X＝重み付き280字（CJK=2）、**Bluesky＝`Intl.Segmenter` による300 grapheme上限**。超過時は警告＋自動トリムボタン（`#coatcodex`はトリム対象外＝末尾維持）。

**A系統: Web Share API（`navigator.canShare?.({ files }) === true` の環境）**

4. 主ボタン「共有シートで投稿（画像付き）」を表示。**共通前処理2の合成画像生成が完了するまでdisabled＋進行表示とし、完了後に活性化**。押下ハンドラ内では**awaitを挟まず**即 `navigator.share({ text, files })` を呼ぶ（事前生成済み・保持済みのFileを渡す。ハンドラ内でawaitするとtransient activationが失効し、未完成のFile[]を渡すと画像なし共有になるため、どちらも禁止）。
5. OSの共有シートでユーザーがX/Blueskyアプリを選択 → 画像＋テキストが投稿画面に引き継がれる。
6. `AbortError`（ユーザーキャンセル）は無視。`NotAllowedError` 等の失敗時はダイアログ内でB系統UIにフォールバック表示。副導線として「うまく共有できない場合」リンクでB系統を常時開ける。

**B系統: Intent URL＋合成画像DL（canShare不成立の環境。主にデスクトップ）**

4'. ダイアログに手順ガイドを表示: 「① 画像をダウンロード → ② 投稿画面を開く → ③ 画像を手動で添付」。
5'. 各候補カードの**個別保存ボタン**でPNGをDL（**2026-07-04 FB-A改訂: 一括DLは廃止** — iOS「ダウンロードを停止しますか？」ダイアログ根治のため。生成完了まではdisabled＋進行表示）。**ファイル名（2026-07-05ユーザー決定・A系統の`File.name`も共通）**: whole/summary(whole)=`{レシピ名}-{rand5}.png`／part=`{レシピ名}-{工程名（技法ラベル、空ならSTEP n）}-{rand5}.png`／summary(part)=`{レシピ名}-{パーツ名}-{rand5}.png`。rand5=crypto由来`[a-z0-9]`5文字・ファイル名不可文字と制御文字はsanitize（空なら"recipe"）。
6'. 「Xの投稿画面を開く」→ `https://x.com/intent/post?text=...`、「Blueskyの投稿画面を開く」→ `https://bsky.app/intent/compose?text=...`（**300 graphemeをURLエンコード前に強制**）。いずれも新規タブで起動。
7'. **Intent URLは画像添付不可**のため、「開いた投稿画面にダウンロードした画像を手動添付してください」の案内をダイアログに常時表示。

### 3.5 データ保全UX（Safari 7日消去対策）

**metaテーブル（前提の明記）**
- 本節が参照する `meta` はDexieの第3テーブル（primary key: `key` のkey-valueストア）で、**スキーマ§2.7の `db.ts` `version(1).stores()` 定義に `recipes` / `photos` と並んで含める**（レコード形状＝キー一覧・値型の単一情報源はスキーマ§2.7）。本節が必要とするキーは次の3種:
  - `persist`: `{ requestedAt: ISO文字列, granted: boolean }` — persist()の要求履歴と結果
  - `recipeExport:<recipeId>`: ISO文字列 — 当該レシピの最終JSONエクスポート日時（**レシピ単位**。エクスポートJSON文書自体には含めない＝エクスポートがupdatedAtを汚さない）
  - `reminderSnoozedUntil`: ISO文字列 — リマインダーのスヌーズ期限

**永続化要求（storage.persist）**
- 発火条件は**「最初のDexie書き込みを伴うユーザー操作の直下」**と定義する（「make codex!押下時」ではない。Setup編集は即時autosave対象であり、make codex!は保存確定操作ではないため）。具体的な発火点は次の3つで、いずれも `meta.persist` が未記録の場合のみクリックハンドラ直下で `navigator.storage.persist()` を実行する:
  1. HomePage `NewRecipeButton` 押下時（ドラフトID発行・初回書き込みの直前）
  2. HomePage `ImportJsonButton` のファイル選択確定時（**JSONインポートのみで利用を開始するユーザーもここで確実に要求される**）
  3. RecipeSetupPage `ImportJsonSection` のファイル選択確定時
- 結果（granted/denied）とタイムスタンプを `meta.persist` に記録。以後アプリ起動ごとに `navigator.storage.persisted()` で再確認し、**未許可のままの場合は上記3操作のたびに再要求してよい**（許可済みなら何もしない）。

**StorageStatusBar（HomePage上部に常設）**
- **保護状態バッジ**: `persisted=true` →「データ保護: 有効」／`false` →「保護なし — ブラウザにより自動削除される可能性があります」／API非対応→バッジ非表示＋警告文。**Safariで未許可・非対応の場合は「7日間サイトを訪問しないとデータが削除される可能性があります。JSONバックアップを推奨します」を明示**。
- **使用量表示**: `navigator.storage.estimate()` →「使用中: 12.3 MB / 目安: 1.0 GB」（概算値である旨を注記。非対応環境では非表示）。
- **最終バックアップ表示**: **全レシピの `recipeExport:*` の最大値**→「最終エクスポート: 3日前」／1件もなければ「未実施」（グローバル表示はレシピ単位記録の集約とし、単独のグローバル `lastExportedAt` キーは持たない）。
- 健全時（保護有効かつ未バックアップレシピ0件）は1行の控えめ表示に抑え、操作の邪魔をしない。

**バックアップ鮮度の判定（レシピ単位・本節が単一情報源）**
- **未バックアップレシピ** = `recipeExport:<id>` が存在しない、または `recipeExport:<id> < recipe.updatedAt` のレシピ。
- **RecipeCardの未バックアップドット**: 上記判定を満たすレシピに即時表示（猶予なし。控えめなドットのため編集直後から出してよい）。
- **リマインダー対象レシピ** = 未バックアップレシピのうち、(a) 一度もエクスポートされていないもの、または (b) `recipeExport:<id>` から**14日以上**経過しているもの（エクスポート直後の編集で即バナーが出る煩わしさを避けるための猶予）。

**ExportReminderBanner（エクスポート促しリマインダー）**
- **HomePage（全幅バナー）の表示条件**: リマインダー対象レシピが**1件以上**存在し、かつスヌーズ中でない。**判定はレシピ単位の集約であり、特定の1レシピをエクスポートしても、他に対象レシピが残っている限りバナーは消えない**。
- **RecipeOverviewPage（コンパクト帯）の表示条件**: **当該レシピが**未バックアップであり、かつスヌーズ中でない。
- アクション: Overviewでは**当該レシピのJSONエクスポートをワンタップ実行**（成功で `recipeExport:<recipeId>` 更新→**当該レシピのコンパクト帯とドットが消える**。Homeの全幅バナーは他のリマインダー対象レシピが残っていれば表示継続）。Homeでは未バックアップレシピにドット表示し、カードメニューからエクスポート可能（各エクスポート成功が該当レシピの `recipeExport:<id>` を更新し、全対象が解消された時点でバナー消滅）。
- 「あとで」で7日間スヌーズ（`meta.reminderSnoozedUntil`。Home/Overview共通）。

---

## 4. 実装タスク分解（Sonnet着手順）

### 4.0 v1からの変更点（レビュー指摘対応の要約）

| # | 指摘 | v2での対応 |
|---|---|---|
| 1 | バージョン固定未明記 | §4.1に固定バージョン表を明記。React 19×dnd-kit peer依存はM0のスパイクタスク（T2）で実機確認 |
| 2 | MixRatioInputがStepCardより後 | MixRatioInput（T20）をStepCard（T25）より前のM3に前倒し |
| 3 | PaintSlot/PaintSlotList本体タスク欠落 | T21として明示タスク化（結線ではなく本体作成） |
| 4 | techniques.tsタスク欠落 | T8として明示タスク化 |
| 5 | storage.persist/persisted/estimate欠落 | データ層M2にT15（storageHealth）、UI反映はT22/T33（persist要求）・T34（ステータス表示） |
| 6 | 写真リサイズ・Quota対策欠落 | T13（imageProcessing: 長辺2048px縮小・mime正規化。規則は§2.6）、T14（QuotaExceededErrorハンドリング） |
| 7 | print.css必須プロパティ未明記 | T36の完了条件に`print-color-adjust: exact`（+`-webkit-`）・`break-inside: avoid`・`@page`マージンを明記 |
| 8 | 往復テスト・スナップショットテスト欠落 | T31（export→import往復同値性）、T32（exportersスナップショット）を独立タスク化 |
| 9 | base64化のメモリピーク | T29にBlobパーツ連結方式を実装方針として明記 |
| 10 | _redirectsの誤り | §5で全面改訂（_redirects削除・404.html非配置による自動SPAフォールバック） |
| 11 | 利用規約ページ欠落 | T35（TermsPage）をタスク化 |
| 12 | Web Share 2系統欠落 | T39（ShareDialog: 機能検出分岐・A系統share({files})・B系統Intent+DL）をタスク化 |

### 4.0.1 v2検証指摘への対応（依存検算・成果物間整合性の決定事項）

本節の決定はスキーマ（§2）・画面構成（§3）・デザインパッケージと本タスクリストの間の食い違いを解消する**確定事項**であり、他成果物側の記載と矛盾する場合は本節の決定に従って当該成果物を追補・修正する。

**依存検算の修正**:

| # | 問題 | 対応 |
|---|---|---|
| V-1 | T2が「開発用ルート」を前提とするがルータはT3で導入（前方参照） | T2は**scaffold既定の`App.tsx`直下にDndSpikeを一時マウント**して確認する方式に確定（T3非依存のまま実行可能。T2本文に明記） |
| V-2 | T36の依存列に写真表示に必要なT14（resolvePhotoUrl）が欠落 | T36の依存列に14を追加 |
| V-3 | T24の依存列にT9（レシピデータモデル）・T16（編集中レシピの供給元）が欠落 | ToolSelectは編集中レシピの`tools`をT16 useRecipeStoreから取得する設計に確定し、依存列を8, 9, 16に修正 |
| V-4 | §4.1でi18next系・ビルドツール系が「最新安定」のまま固定値未定 | §4.1に全パッケージのメジャー固定値を明記（i18next `^25`／react-i18next `^16`／vite `^7`／typescript `~5.9`／vitest `^4`）。再現ビルドの正は`package-lock.json`（T1でコミット） |
| V-5 | T18 PhotoUploaderの並び替え手段が未指定（dnd-kitなら依存2が漏れる） | **上下移動ボタン（＋「先頭へ」ボタン）で実装し、dnd-kitは使わない**ことに確定（T2非依存）。D&D化はT26/T28安定後の任意改善とし、行う場合は依存に2を追加してから着手 |
| V-6 | T2本文の「T24/T26/T28が依存」が依存表と矛盾（T24はD&D不使用） | T2本文を「T26/T28（Sortable使用箇所）が依存」に修正 |

**成果物間整合性の決定事項**:

| # | 決定 | 担当タスク | 他成果物への修正指示 |
|---|---|---|---|
| D-1 | **混合バッジ表記は`formatMixBadge`（スキーマ§2.3/§2.4）を唯一の正とする**。出力は「60% + 40% (3:2)」（全要素の%を`+`区切りで列挙＋比率併記。要件10-2の「25% + 75%」例とも整合）。**v2.2追記（デザイン決定稿§8-B反映）**: mix再設計後は**合計100時のみ比率併記・約分不能時は比率省略**（例「55% + 45%」）・合計≠100時は比率省略＋警告併記（§2.3の書式が正） | T28 | 画面構成§3.3 PartCard・デザインパッケージA-4/B-2 Badge mixバリアント/C-3ラフの「60% (3:2)」表記を「60% + 40% (3:2)」形式へ修正 |
| D-2 | **DB構造は`recipes`/`photos`/`meta`の3テーブルに確定**。metaのレコード形状は`{ key: string, value: string \| { requestedAt: string; granted: boolean } }`（主キー`key`）で、キーは次の3種のみ（**§2.7・§3.5と同一**）: `persist`（`{requestedAt, granted}`: storage.persist()の要求履歴と結果）／`recipeExport:<recipeId>`（ISO 8601文字列: **レシピ単位**の最終JSONエクスポート時刻）／`reminderSnoozedUntil`（ISO 8601文字列: リマインダースヌーズ期限） | T12, T15 | スキーマ§2.7の`db.ts`（Dexieテーブル定義）に`meta: 'key'`と上記レコード形状・キー一覧を追補 |
| D-3 | **partIdの予約語`"base"`拒否を不変条件17として正式採番**（「`parts[].id`は文字列`"base"`であってはならない」） | T9 | スキーマ§2.5の不変条件リストに17として追加（画面構成§3.1の記述と一致） |
| D-4 | **インポート検証エラー詳細ダイアログを`ImportErrorDialog`（Dialog error-detailバリアント）として実装**。zodのissue一覧（パス・メッセージ）を表示し、トーストは要約のみ | T33 | 画面構成§3.3のコンポーネント表にImportErrorDialogを追補 |
| D-5 | **EmptyState（home/parts/stepsバリアント）・Skeleton（card/photoバリアント）を実装契約どおりタスク割当**。基底部品はT5、適用はT22（home＋card）・T26（steps）・T27（photo）・T28（parts＋photo） | T5, T22, T26, T27, T28 | 画面構成§3.3のコンポーネント表にEmptyState/Skeletonを追補 |
| D-6 | **RecipeCardの未バックアップドット（Badge dotバリアント）の判定規則を確定**（§3.5「バックアップ鮮度」と同一）: `recipeExport:<recipeId>`が存在しない、または`recipeExport:<recipeId> < recipe.updatedAt`のレシピにドット表示（**レシピ単位**。当該レシピのエクスポート成功で`recipeExport:<recipeId>`が更新され、そのカードのドットのみ消える） | T34 | — |
| D-7 | **PaletteEditor/ToolListEditorの使用数バッジ・使用中削除不可**（削除ボタン無効化＋「N工程で使用中」表示。スキーマ§2.6・画面構成§3.3・T23で確定済み）はデザイン要件にも必須として採用 | T23（実装は従来どおり） | デザインパッケージB-2にPaletteEditor/ToolListEditor相当部品・Badge countバリアント・削除ボタンdisabled状態を追加し、C-2のラフ・状態表（無条件削除可の表現）を差し替え |
| D-8 | **ドラフト既定名規約を確定**（不変条件15「title空文字不可」との矛盾解消）: ①新規ドラフト発行時にtitle=既定名で作成（`createDraft(title)`は呼び出し側からi18n解決済み既定名を受け取る） ②autosaveのDexie書き込み直前にtrim後空文字なら既定名へ補完して保存（UIの入力欄は空のまま維持し、blur時に補完後の既定名を表示） ③既定名はi18nキー`recipe.untitledTitle`（ja「無題のレシピ」／en「Untitled Recipe」）。保存文書は常にrecipeDocSchemaを満たす | T12, T16, T22 | スキーマ§2.5-15の補記としてこの補完規約を追記。画面構成§3.1のドラフト作成フロー・デザインC-2の「既定名補完前提」をこの仕様（補完タイミング・既定名）で確定 |

### 4.1 固定バージョン（package.jsonレンジ指定の単一情報源）

| パッケージ | バージョン | 備考 |
|---|---|---|
| react / react-dom | `^19` | |
| react-router | `^7` | **declarative mode（`BrowserRouter`）**。v7は`react-router`単体パッケージからimport（`react-router-dom`は使わない） |
| zod | `^4` | v4 API（`z.looseObject`・`z.int`等）を前提 |
| @dnd-kit/core | `^6` | **新アーキテクチャの`@dnd-kit/react`は見送り**（安定性優先） |
| @dnd-kit/sortable + @dnd-kit/utilities | core 6系互換の最新 | React 19とのpeer依存はT2で実機確認 |
| dexie | `^4` | |
| zustand | `^5` | |
| i18next | `^25` | |
| react-i18next | `^16` | |
| vite | `^7` | |
| typescript | `~5.9` | TSはsemver非準拠のためチルダ固定 |
| vitest | `^4` | devDependenciesに`fake-indexeddb`（`^6`、T12以降のDBテスト用）を含める |

> 再現ビルドの正は`package-lock.json`（T1でインストール成功した解決バージョンをコミットして固定）。本表はレンジ指定の単一情報源であり、T1/T2でインストールまたはpeer依存が通らない場合のみ直近の安定メジャーへ調整し、**本表を更新してから**先へ進む。

### 4.2 タスクリスト

凡例: 「依存」列の番号は先行タスク番号（すべて自番号より小さいことを検算済み）。「テスト」列: ✅=vitestユニット/スナップショット必須、🖐=手動確認、—=なし。

#### M0: 基盤（完了条件: 空の7ルートアプリがCloudflare Pagesにデプロイされ、深いURLの直接リロードが通る。**当時のルート数=7。v2.6のM10 T52で`/tools`が追加され計8ルートとなった — 本セクションはM0完了時点の履歴記述として据え置く**）

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 1 | Vite+React 19+TS scaffold。§4.1の全バージョンをpackage.jsonに固定し`package-lock.json`をコミット。ESLint/Prettier/vitest/fake-indexeddb導入、`npm run test`が空テストで通ること | `package.json` / `package-lock.json` / `vite.config.ts` / `tsconfig.json` / ESLint・Prettier設定 | — | ✅（環境疎通のダミーテスト） |
| 2 | **React 19×@dnd-kit peer依存スパイク（指摘1）**: `@dnd-kit/core@6`+`sortable`をインストールし、最小Sortableデモで動作確認。**ルータ導入（T3）前に実行するため、DndSpikeは開発用ルートではなくscaffold既定の`App.tsx`直下に一時マウントして確認する（T3非依存）**。①peer依存警告なしで`npm install`が通る ②StrictMode下でD&D並び替えが動く（Chrome/Safari/モバイルエミュレータ）。NGならバージョン組合せ変更または`@dnd-kit/react`再検討をユーザーへエスカレーション（**Sortableを使用するT26/T28が依存するためM0で必ず決着**） | `src/dev/DndSpike.tsx`（確認後削除可）＋確認結果をREADMEに記録 | 1 | 🖐 |
| 3 | react-router v7 declarative mode導入。`BrowserRouter`＋§3.1の**全7ルート**（M0時点。v2.6のT52で`/tools`が追加され計8ルートとなった）の空ページと遷移（`/recipe/:id/part/base`は`:partId`より先に定義）。T2の一時マウントを撤去しルータ構成へ置換 | `src/main.tsx` / `src/App.tsx` / `src/router.tsx` / `src/routes/`配下7ページの空実装 | 1 | 🖐（全ルート表示） |
| 4 | react-i18next導入。ja/en切替スケルトン＋localStorage永続化（キーは以降のタスクで随時追加） | `src/i18n/index.ts` / `src/i18n/locales/ja.json`・`en.json` | 1 | — |
| 5 | AppShell共通枠: `LanguageSwitcher`／`AppFooter`（**/termsへのリンク常設**）／`ToastHost`（保存・エラー通知。T14のQuotaエラー等が使用）／**`EmptyState`（home/parts/stepsバリアント）・`Skeleton`（card/photoバリアント）の基底部品（D-5: デザインB-2実装契約）** | `src/components/common/AppShell.tsx`・`LanguageSwitcher.tsx`・`AppFooter.tsx`・`ToastHost.tsx`・`EmptyState.tsx`・`Skeleton.tsx` | 3, 4 | — |
| 6 | デプロイ設定一式（§5）: `wrangler.toml`作成。**`public/_redirects`と`404.html`を作らない**ことを確認し、`npm run build`→`npx wrangler pages dev dist`で`/recipe/x/print`等の直接リロードがindex.htmlにフォールバックすることを検証。GitHub連携で初回デプロイ | `wrangler.toml` / `.nvmrc`（Node 20） | 1, 3 | 🖐（§5.6の検証手順） |

#### M1: 純ロジック層（完了条件: UIなしで全ロジックがテストで検証済み）

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 7 | `lib/mixRatio.ts`: §2.4の**全公開関数**（`parseRatioText`〜`removePaintSlot`。v2.2: デザイン決定稿§8-B反映で`expandRatioToPercents`／`reducePercentsToRatio`／`sumPercents`等の新モデルに全面改訂済み）を純関数で実装。丸め規則（§2.3: 整数化＋剰余の末尾スロット加算）・入力連動規則（§2.3の表）を厳守 | `src/lib/mixRatio.ts` / `src/lib/mixRatio.test.ts` | 1 | ✅（**§2.4記載の全テストケース名をそのまま実装**） |
| 8 | **`lib/techniques.ts`（指摘4）**: `TECHNIQUE_PRESET_KEYS`マスタ10種＋`resolveTechniqueLabel`（preset→i18n解決／自由入力label／マスタ外キーはそのまま表示のフォールバック）。ja/enに`techniques.*`全キー追加 | `src/lib/techniques.ts` / `src/lib/techniques.test.ts` / ja.json・en.json更新 | 4 | ✅（3分岐の解決） |
| 9 | `models/recipe.ts`: RecipeDoc/Step/RecipeExportFileの型＋zodスキーマ。**§2.5の不変条件1〜20を`superRefine`で全実装**（5・6はv2.2で欠番。mix合計100は検証しない — UI有効条件。不変条件2〜4=v2.2の`mix`規約、16=写真参照は`steps[].photoId`を含む3種、17=partIdの予約語`"base"`拒否はD-3でスキーマ§2.5に正式採番済み） | `src/models/recipe.ts` / `src/models/recipe.test.ts` | 1 | ✅（不変条件ごとの受理/拒否ペア） |
| 10 | `lib/recipeRefs.ts`: `countColorUsage`／`countToolUsage`（baseSteps・全parts横断の参照Step数） | `src/lib/recipeRefs.ts` / テスト | 9 | ✅ |
| 11 | `models/migrations.ts`: `CURRENT_SCHEMA_VERSION`／`migrateRecipeDoc`／`migrateExportFile`（§2.7）。現在はv1のみだが順次適用の骨組みをダミーマイグレーションで検証 | `src/models/migrations.ts` / テスト | 9 | ✅（v1恒等・ダミーv0→v1適用順） |

#### M2: データ永続層（完了条件: fake-indexeddb上でCRUD・写真保存・保全APIが全テスト通過）

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 12 | `db/db.ts`＋`db/recipeStore.ts`: Dexie `version(1)`で`recipes: 'id, updatedAt'`／`photos: 'id, recipeId'`（§2.7）に加え**`meta: 'key'`（D-2: レコード形状`{ key, value }`・キーは`persist`/`recipeExport:<recipeId>`/`reminderSnoozedUntil`の3種のみ。スキーマ§2.7へ追補済みの確定構造）**を定義。CRUD（updatedAt降順一覧・**新規ドラフト`createDraft(title)`＝呼び出し側からi18n解決済み既定名を受け取りtitle非空で作成（D-8）**・put・削除）と**ロード時lazy migration**（§2.7のloadRecipe: 上位版→UnsupportedSchemaError／下位版→migrate→parse→書き戻し／破損→エラー表示・自動削除しない） | `src/db/db.ts` / `src/db/recipeStore.ts` / テスト | 9, 11 | ✅（fake-indexeddb: 保存往復・migration書き戻し・上位版エラー） |
| 13 | **`lib/imageProcessing.ts`（指摘6・17）**: 写真保存前の縮小・mime正規化（**規則の正は§2.6**: 3形式かつ長辺2048px以下は無変換／3形式で2048px超は縮小＋同形式再エンコード／HEIC等の他形式はJPEG 0.9へ再エンコード／デコード不能はエラー中止）。`createImageBitmap`（`imageOrientation: 'from-image'`でEXIF回転吸収、失敗時`<img>`+objectURLフォールバック）→canvas縮小（**長辺2048px上限**）。縮尺計算は純関数に分離 | `src/lib/imageProcessing.ts` / テスト | 1 | ✅（縮尺計算の純関数）＋🖐（canvas実機） |
| 14 | `db/photoStore.ts`: `savePhoto(file, recipeId)`（T13のリサイズ経由でBlob保存。mimeフィールドは持たずBlob.type）／`resolvePhotoUrl`（**欠損時null→UIプレースホルダ**、objectURLのrevoke管理）／レシピ削除時GC（recipeIdインデックス）／エクスポート用収集。**`QuotaExceededError`を型付き`StorageQuotaError`に変換**し呼び出し側がToastで「容量不足。写真を減らすかバックアップ後に削除してください」を表示できるようにする | `src/db/photoStore.ts` / テスト | 12, 13 | ✅（保存/解決/GC/Quota例外モック） |
| 15 | **`lib/storageHealth.ts`（指摘5）**: `navigator.storage.persist()`／`persisted()`／`estimate()`のラッパー（API非対応環境はundefined返却）。metaテーブル（D-2の3キー: `persist`・`recipeExport:<recipeId>`・`reminderSnoozedUntil`）への記録と、**リマインダー表示条件の純関数**`shouldShowExportReminder`（§3.5の条件a/b＋7日スヌーズ） | `src/lib/storageHealth.ts` / テスト | 12 | ✅（navigator.storageモック＋表示条件判定） |
| 16 | `stores/useRecipeStore.ts`: Zustand v5。編集中レシピのload（lazy migration経由）・更新・**autosave（debounce 500ms→Dexie書き込み）**・**書き込み直前のtitle既定名補完（D-8: trim後空文字なら`recipe.untitledTitle`のi18n解決値へ置換して保存。保存文書が不変条件15に常時適合）**・保存失敗（StorageQuotaError含む）のToast通知連携 | `src/stores/useRecipeStore.ts` / テスト | 4, 9, 12, 14 | ✅（fakeタイマーでdebounce・空タイトル補完・保存失敗経路） |

#### M3: 塗料プリセット＆入力部品（完了条件: 塗料選択と混合比入力が単体で動作。**StepCardより先に完成させる**）

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 17 | `public/paints/*.json`（Citadel/Vallejo/AK 各主要50〜100色＋hex、`index.json`メタ）＋`lib/paintPresets.ts`（遅延fetch・ブランド絞り込み・名称検索）**※2026-07-03改訂: Citadel/Vallejoはユーザー提供チャート由来（334色/255色・range付き）へ差し替え、AKは除外、レンジフィルタUI追加。§6参照** | `public/paints/index.json`・`citadel.json`・`vallejo.json` / `src/lib/paintPresets.ts` / テスト | 1 | ✅（fetchモックで検索/絞り込み＋実データ整合） |
| 18 | 共通部品: `SwatchChip`（hex or チップ写真表示）／`PhotoUploader`（複数枚・T13リサイズ→T14保存・**並び替えは上下移動ボタン＋「先頭へ」ボタンで実装（先頭=代表写真規約。V-5: dnd-kit不使用のためT2非依存。D&D化する場合は依存に2を追加してから着手）**・削除・Quotaエラー表示・**アップロード中/読込中はSkeleton photoバリアント表示（D-5）**）／`ConfirmDialog` | `src/components/common/SwatchChip.tsx`・`PhotoUploader.tsx`・`ConfirmDialog.tsx` | 5, 13, 14 | 🖐 |
| 19 | `PaintPicker`: `BrandSelect`（プリセット＋自由入力）→`ColorSelect`（ブランドで候補絞り込み）＋自由入力時のHEXカラーピッカー／カラーチップ写真添付。palette要素（§2.1）を返す | `src/components/paint/PaintPicker.tsx`・`BrandSelect.tsx`・`ColorSelect.tsx` | 17, 18 | 🖐 |
| 20 | **`MixRatioInput`（指摘2: StepCardより前に実装。v2.2: デザイン決定稿§8-B反映で仕様改訂）**: **各スロットの%入力（整数0〜100）を主体**とし、比率欄は入力補助（`5:3:2`入力→`commitRatioInput`で%へ展開）＋導出表示（%直接編集時は`reducePercentsToRatio`の約分比率を併記、約分不能は省略）。**「計 n%」インジケータ**（100=success●／≠100=danger●＋全%枠error皮＋メッセージ「合計が100%になるよう調整してください」＋比率欄「—」disabled — §2.3。autosaveは継続）。確定時に`commitPercentInput`／`commitRatioInput`（T7）を呼ぶだけの薄いコンポーネント | `src/components/paint/MixRatioInput.tsx` | 7 | 🖐（ロジックはT7のテストで担保） |
| 21 | **`PaintSlot`／`PaintSlotList`本体（指摘3）**: PaintSlot＝PaintPicker＋SwatchChip＋**%入力（`mix[index]`と連動。単色・塗料0件では%列非表示 — §2.3。v2.2: §8-B）**＋スロット削除。PaintSlotList＝A〜Eラベル付きmax5スロット管理、追加/削除は`addPaintSlot`／`removePaintSlot`（T7）経由、colorId重複選択の防止、**5件到達時は「＋塗料を追加」disabled＋「最大5種まで」表示（残数表示付き — デザイン仕様書§4）** | `src/components/part-editor/PaintSlot.tsx`・`PaintSlotList.tsx` | 7, 19 | 🖐 |

#### M4: 編集画面（完了条件: 新規作成→Setup→Overview→パーツ/ベース工程編集の全フローが手動で一巡できる）

> **M4結線時の必須事項（M3レビューからの申し送り）**:
> ① **pending不変**: `col_pending_*`（未確定スロット）のcolorIdは永続化しない。autosave/エクスポートの手前で`lib/pendingPaints.ts`の`stripPendingPaints`を必ず適用する（適用漏れ=INV-12違反→ロード時CorruptRecipeError）
> ② **palette要素の参照同一性**: PaintPickerのvalue再同期は参照比較。immutable更新やロード後にpalette要素オブジェクトを再生成すると編集中の下書きが上書きされるため、更新時は変更のない要素の参照を保つ（またはPaintPicker側にid+内容比較のスキップ防御を追加してから結線する）
> ③ **palette孤児エントリの方針**: ~~PaletteEditorの使用数0削除で回収~~ → **v2.3で解決方式変更: 保存時自動GC**（PaletteEditor廃止に伴い、参照0のpalette色は`gcUnusedPaletteColors`で自動除去・チップ写真Blobも`deletePhoto`で回収。トレードオフ=一度参照を外したcustom色は再入力が必要になる点は申し送り済み）
> ④ **key={colorId}×blur確定の既知UX事項（Round 3 Low）**: 色内容変更直後のクリックが再マウントで1回吸われる（データ損失なし）。Step編集結線時に体感確認し、問題ならスロット固有の安定keyへ構造変更を検討

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 22 | `HomePage`: `RecipeCardGrid`→`RecipeCard`（updatedAt降順・代表写真サムネ・メニュー「開く/削除」— 複製とエクスポートはT33で結線。**未バックアップドットの表示スロットを確保し結線はT34=D-6**）＋`NewRecipeButton`（**クリックハンドラ直下で`storage.persist()`を要求（§3.5発火点①・T15）**→**`createDraft`にi18n解決済み既定名`recipe.untitledTitle`を渡してドラフト発行（D-8）**→`/setup`）＋**レシピ0件時EmptyState(home)・一覧読込中Skeleton(card)（D-5）** | `src/routes/HomePage.tsx` / `src/components/home/RecipeCardGrid.tsx`・`RecipeCard.tsx`・`NewRecipeButton.tsx` | 5, 12, 14, 15 | 🖐 |
| 23 | `RecipeSetupPage`(10-1): `TitleInput`（**空のまま確定時はD-8の補完規約: 入力欄は空のまま・blur時に補完後の既定名を表示**）／`OverviewPhotoUploader`（T18再利用・先頭=代表）／`PaletteEditor`（PaintPicker＋**使用数バッジ・使用中削除不可**=T10、D-7）／`ToolListEditor`（同削除ガード）／`MakeCodexButton`（Overviewへ遷移する純粋なナビゲーション。**persist()要求はここでは行わない**＝§3.5の発火点は新規作成T22・インポート確定T33）。`ImportJsonSection`は枠のみ設置しT33で結線 | `src/routes/RecipeSetupPage.tsx` / `src/components/setup/`配下 | 10, 16, 18, 19 | 🖐 |
| 24 | `TechniqueSelect`（プリセット=T8 or 自由入力。両非nullにならないUI制御）／`ToolSelect`（**編集中レシピの`tools`（T9データモデル）をT16 useRecipeStoreから取得して参照・複数選択・重複不可**=V-3）／`MemoField` | `src/components/part-editor/TechniqueSelect.tsx`・`ToolSelect.tsx`・`MemoField.tsx` | 8, 9, 16 | 🖐 |
| 25 | `StepCard`組み立て: TechniqueSelect＋PaintSlotList＋MixRatioInput＋ToolSelect＋**下段に`StepPhotoTile`（工程写真1枚: T13リサイズ→T14保存・`STEP n`タグ・✕で解除・空は破線「＋ 写真 1枚」。v2.2: デザイン決定稿§8-A反映）＋MemoFieldのペア**＋工程削除 | `src/components/part-editor/StepCard.tsx`・`StepPhotoTile.tsx` | 13, 14, 20, 21, 24 | 🖐 |
| 26 | `StepList`（**dnd-kit Sortableで工程並び替え**=§3.2(2)の代替保証）＋ドラッグハンドル＋モバイル/a11y用上下移動ボタン＋`AddStepButton`＋**工程0件時EmptyState(steps)（D-5）** | `src/components/part-editor/StepList.tsx`・`AddStepButton.tsx` | 2, 5, 25 | 🖐 |
| 27 | `PartEditorPage`(10-3): `PartEditorHeader`（通常=パーツ名のみ〔**パーツ写真ギャラリーはv2.2で廃止 — 工程写真はT25のStepPhotoTileへ。デザイン決定稿§8-A**〕／**baseモード=固定見出し＋代表写真読み取り専用**）＋**モバイルのみ`StepPhotoStrip`（写真つき工程の番号付きサムネストリップ・タップで該当StepCardへスクロール。v2.2: §8-A）**、`/part/base`予約ルート対応、モバイル=フルページ／PC幅=スライドインパネルのレイアウト分岐、autosave結線。**写真読込中はSkeleton(photo)表示（D-5）** | `src/routes/PartEditorPage.tsx` / `src/components/part-editor/PartEditorHeader.tsx`・`StepPhotoStrip.tsx`（PartPhotoGallery.tsxは作らない） | 5, 16, 18, 26 | 🖐 |
| 28 | `RecipeOverviewPage`(10-2): `OverviewHeader`＋`BaseStepOverlay`（技法名チップ列、タップで`/part/base`、未登録時「＋ベース工程を追加」）／`OverviewPhotoStrip`／`PartCardList`（**dnd-kit Sortableでパーツ並び替え**・**パーツ0件時EmptyState(parts)、サムネ読込中Skeleton(photo)（D-5）**）→`PartCard`（**サムネ=写真がある最後の工程の写真、なければプレースホルダ、`STEP n`タグ付き（v2.2: §8-A）**・工程数・**混合バッジは`formatMixBadge`の出力をそのまま表示（D-1: 「60% + 40% (3:2)」形式が唯一の正。v2.2: 約分不能時は比率省略・合計≠100は警告併記 — §2.3）**）／`AddPartButton`／`ExportActionBar`枠（ボタン配置のみ。結線はT33/T40） | `src/routes/RecipeOverviewPage.tsx` / `src/components/overview/`配下 | 2, 5, 7, 8, 14, 16, 27 | 🖐 |

#### M5: データ保全＆エクスポート/インポート（完了条件: 往復テスト・スナップショットテスト通過、保全UIが動作）

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 29 | JSONエクスポート `lib/exporters/json.ts`: RecipeExportFile生成（§2.2。schemaVersion一致保証・実体なきphotoId参照の除去・写真あり/なし2択）。**base64化のメモリピーク対策（指摘9）**: 写真ごとに`FileReader.readAsDataURL`でdataUrl化し、エクスポートJSON全体を単一巨大文字列にせず**`new Blob([jsonHeadStr, photo1Str, ..., jsonTailStr])`のパーツ配列連結**でファイルBlobを構築する方針を実装コメントにも明記 | `src/lib/exporters/json.ts` / テスト | 9, 12, 14 | ✅（小ダミーBlobで構造・参照除去） |
| 30 | インポートパイプライン `lib/importRecipe.ts`: §2.7の**3段検証**（ヘッダ→migrate→フル検証）＋`normalizeImport`（**全ID新規採番・参照リマップ・dangling photo除去・マスタ外presetKey降格・updatedAt=now**）＋Dexie rwトランザクション書き込み（失敗時ロールバック）。ID再採番＋リマップは`reassignRecipeIds`ヘルパーとして分離エクスポート（T33の複製で再利用）。検証失敗時はzod issue一覧を構造化して返却（T33のImportErrorDialogが表示に使用） | `src/lib/importRecipe.ts` / テスト | 8, 9, 11, 12, 14 | ✅（ヘッダ不正・上位版拒否・正規化a〜e各規則） |
| 31 | **往復ユニットテスト（指摘8）**: fake-indexeddb上で「export→import→ID正規化後のdeep equal同値性＋写真Blobバイト等価」「写真なしexport→importでphoto参照が除去される」「2回importで2レシピになる」 | `tests/roundtrip.test.ts` | 29, 30 | ✅ |
| 32 | 素のMarkdown `exporters/markdown.ts`＋note.com向け `exporters/noteMarkdown.ts`（**v2.3改訂 2026-07-03: noteの実対応記法は`##`/`###`/`-`/`1.`/`>`/```/`---`のみ〔公式ヘルプ「Markdownショートカット」。h1・h4・太字・リンク・表は非変換〕と判明したため、note向け出力はこの記法のみで構成する。タイトル=`##`・工程=実番号付き番号リスト1行形式・太字不使用。禁止記法の不在はnoteMarkdown.test.tsの共通アサーションで固定**）＋**スナップショットテスト（指摘8）**: 代表フィクスチャ（**混色〔合計100・比率併記／約分不能・比率省略／合計≠100・警告併記〕**/単色/塗料0件/**工程写真あり・なし（v2.2）**/ベース工程/複数パーツ/自由入力技法を網羅）で`toMatchSnapshot` | `src/lib/exporters/markdown.ts`・`noteMarkdown.ts` / `tests/exporters.snapshot.test.ts` / `tests/fixtures/recipe.ts` | 7, 8, 9 | ✅（スナップショット） |
| 33 | インポート/エクスポートUI結線: `ImportJsonButton`(Home)＋`ImportJsonSection`(Setup=要件10-1どおり新規作成と並置)＋**`ImportErrorDialog`（Dialog error-detailバリアント=D-4: T30のzod issue一覧をパス・メッセージ付きで表示。トーストは要約のみ）**／`ExportActionBar`の**JSON・素MD隣接配置**＋note MD／RecipeCardメニュー「JSONエクスポート」「複製」（`reassignRecipeIds`＋photos複製で実装）／写真あり・なし選択ダイアログ／**エクスポート成功時に`meta`の`recipeExport:<recipeId>`を更新（§3.5）**。インポートは`ImportJsonButton`/`ImportJsonSection`とも**ファイル選択確定のユーザー操作直下で`storage.persist()`を要求（§3.5発火点②③・T15）** | 各画面コンポーネント更新 / `src/components/home/ImportJsonButton.tsx` / `src/components/setup/ImportJsonSection.tsx` / `src/components/common/ImportErrorDialog.tsx` | 15, 18, 22, 23, 28, 29, 30, 32 | 🖐 |
| 34 | **データ保全UI（指摘5）**: `StorageStatusBar`（persisted状態バッジ／**Safari 7日消去の警告文言**／`estimate()`使用量「使用中: x MB / 目安: y GB」概算注記付き・非対応時非表示／最終エクスポート表示）＋`ExportReminderBanner`（Home全幅・Overviewコンパクト帯、ワンタップエクスポート、「あとで」7日スヌーズ）＋**RecipeCardの未バックアップドット結線（D-6: Badge dotバリアント。`recipeExport:<recipeId>`が無い、または`recipe.updatedAt`より古いレシピに表示）**。起動時`persisted()`再確認 | `src/components/home/StorageStatusBar.tsx`・`ExportReminderBanner.tsx` / `RecipeCard.tsx`更新 / App起動処理更新 | 15, 22, 28, 33 | 🖐（判定ロジックはT15で担保） |
| 35 | **`TermsPage`（指摘11）**: `/terms`静的コンテンツ（i18n）— 利用規約・**データ消失自己責任の免責**・ブラウザストレージの性質と7日消去リスク・バックアップ推奨・**商標表記（長文。原文=docs/legal/coat-codex_商標表記.md §2をi18n化。連絡先=contact@coat-codex.com確定済み）**。あわせて`AppFooter`に商標短文（同§1）を1行追加（/termsリンク既設）。フッターリンクの到達確認 | `src/routes/TermsPage.tsx` / `src/components/common/AppFooter.tsx`更新 / ja.json・en.json更新 | 3, 4, 5 | 🖐 |

#### M6: 印刷・SNS（完了条件: 印刷プレビュー・共有2系統が実機確認済み）

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 36 | `PrintViewPage`＋`print.css`: `PrintRecipeSheet`（全工程・スウォッチ・混合バッジ〔合計≠100の工程は警告表記を継承 — §2.3〕・**写真（T14の`resolvePhotoUrl`で解決=V-2）**。**工程行の右に64×48の工程写真`steps[].photoId`を配置し、写真なし工程は空欄のまま行高を一定に保つ（v2.2: デザイン決定稿§8-A反映）**）／`PrintToolbar`（`@media print`で非表示）。**print.css必須要件（指摘7）**: ①`print-color-adjust: exact`＋`-webkit-print-color-adjust: exact`（スウォッチ/バッジの背景色を印刷で維持）②工程カード・パーツブロックに`break-inside: avoid` ③`@page { margin: 12mm }`。PDFは当面ブラウザ印刷ダイアログ「PDFとして保存」（ExportActionBarの「PDFダウンロード」ボタンは/printへ誘導＋保存手順案内。専用生成は§6未決のまま） | `src/routes/PrintViewPage.tsx` / `src/components/print/PrintRecipeSheet.tsx`・`PrintToolbar.tsx` / `src/styles/print.css` | 3, 7, 8, 12, 14 | 🖐（Chrome/Safari印刷プレビューで背景色・改ページ確認） |
| 37 | `sns/imageComposer.ts`: **v2.3: 2モードの合成カード生成** — **全体**: 全体写真それぞれ＋レシピ情報（タイトル）の1枚絵／**パーツ**: 写真つき工程〔`steps[].photoId`非null〕それぞれを「全体画像（代表写真）＋工程写真＋工程情報（番号・技法・スウォッチ/混合バッジ。合計≠100は警告表記を継承 — §2.3）」の1枚絵に合成。全候補を`File[]`（image/png）で返却し、**最大4枚の選定はユーザー選択（T39）**。候補列挙・カードレイアウト計算は純関数分離（対象文脈を引数に） | `src/lib/sns/imageComposer.ts` / テスト | 14 | ✅（候補列挙・レイアウト純関数）＋🖐 |
| 38 | `sns/types.ts`＋`x.ts`＋`bluesky.ts`: `SnsTarget`IF・**配列登録制**（Mastodon等を1ファイル追加で拡張可）。Intent URL生成（`x.com/intent/post`／`bsky.app/intent/compose`）、文字数カウンタ（**X=重み付き280字: CJK=2・URL=23固定／Bluesky=`Intl.Segmenter`で300 grapheme**）＋超過警告・自動トリム | `src/lib/sns/types.ts`・`x.ts`・`bluesky.ts` / テスト | 1 | ✅（カウンタ・トリム・URL生成） |
| 39 | **`ShareDialog`＝Web Share 2系統（指摘12）**: 分岐は`navigator.canShare?.({ files })`の**機能検出**。ダイアログopen時に合成画像を事前生成しFile[]保持（**クリックハンドラ内で非同期生成しない**=transient activation維持）。**A系統**: 「共有シートで投稿」→ハンドラ内で同期的に`navigator.share({ text, files })`、`AbortError`無視・`NotAllowedError`等はB系統UIへフォールバック、副導線リンク常設。**B系統**: 手順ガイド（①DL②投稿画面③手動添付）＋候補カード個別保存（FB-A改訂。ファイル名は§3.4 B系統5'）＋Intent新規タブ（**Intent URLは画像添付不可の案内を常時表示**）。`ShareImagePreview`（**v2.3: 選択式** — 工程順の候補カード一覧からチェックで最大4枚選択・既定=先頭4枚・選択数表示・5枚目はdisabled）／`ShareTextEditor`（ターゲット別カウンタ）。**v2.3: 対象文脈（レシピ全体 or partId）を受け取る2起点ダイアログ。テキスト既定は§3.4手順3（全体/パーツで異なる）・URLなし・タグはトリム対象外。候補0件はテキストのみ共有に切替（§3.4）** | `src/components/overview/ShareDialog.tsx`・`ShareImagePreview.tsx`・`ShareTextEditor.tsx` | 28, 37, 38 | ✅（canShareモックの分岐unit）＋🖐（iOS Safari/Android Chrome/デスクトップの3環境） |
| 40 | 共有導線の最終結線（v2.3・2起点）: `ExportActionBar`のX/Bluesky→全体共有ShareDialog／`PartCard`メニュー「このパーツを共有」→パーツ共有ShareDialog（いずれも→T39、SnsTarget配列駆動）／印刷・PDF（→T36）・note MD・JSON・素MD（T33済みの確認） | `src/components/overview/PartCard.tsx`・`ExportActionBar.tsx`更新 | 33, 36, 39 | 🖐 |

#### M7: 仕上げ（完了条件: 通しQAチェックリスト全項目パス）

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 41 | i18n全キー棚卸し（ja/en欠落ゼロ、`techniques.*`・`recipe.untitledTitle`・**`mix.totalWarning`（合計≠100警告。§2.3）・工程写真UI文言（「＋ 写真 1枚」等。v2.2）**含む）、言語切替永続化の最終確認 | ja.json / en.json | 22〜40 | ✅（キー網羅の機械チェック） |
| 42 | レスポンシブ最終調整（モバイル/PC均等・10-3のパネル/フルページ分岐）＋秘伝書テイストのテーマ変数受け口（実デザインはClaude Design待ち） | `src/styles/theme.css` | 22〜40 | 🖐 |
| 43 | 通しQA: ①UI経由のエクスポート→インポート往復 ②Pages本番URLで全7ルート直接リロード（M7時点。v2.6のT52で`/tools`追加により計8ルートへ拡張。8ルート化後の再検証はM10/T52・M11出口実機に引き継ぐ） ③印刷プレビュー（Chrome/Safari: 背景色・改ページ） ④共有A/B系統実機 ⑤persist拒否時の警告表示 ⑥Quota超過模擬（DevTools）でのエラー表示 ⑦色/ツール使用中削除不可の動作 ⑧マスタ外presetKeyインポートの降格表示 ⑨タイトル未入力のままautosave→リロードで既定名レシピが正常に開ける（D-8） ⑩未バックアップドットのエクスポート後消灯（D-6） ⑪工程写真の付け外し→PartCardサムネ（写真がある最後の工程＋STEP nタグ）・印刷64×48・共有2枚目以降への反映（v2.2: §8-A） ⑫合計≠100のMIXエラー中もautosaveが継続し、バッジ・印刷・共有へ警告が継承される（v2.2: §8-B） | QAチェックリスト結果（README追記） | 全タスク | 🖐 |

#### M8: 公開前仕上げ（2026-07-03新設。M0〜M7完走後の積み残し解消。完了条件: T44〜T46がレビューPASS＋実機検証済み、コード外チェックリスト消化）

> M8は各マイルストーンのレビューで「独立タスク推奨」と裁定された持ち越し事項の受け皿。**T45はM3確定物（PaintSlot/PaintSlotList）への構造変更**のためリグレッション面が広く、単独ループ・実機スパイク検証・M3観点の再レビューを必須で扱う。

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 44 | **PC幅パネル背面のOverview描画**（M4レビューR1指摘2・Medium持ち越し）: `/recipe/:id` を親ルート化し `<Outlet>` で PartEditorPage をネスト描画（§3.1「PC幅＝/recipe/:id 上のスライドインパネル」の完全充足）。モバイル=フルページの現行挙動・`/part/base` 予約ルート・close遷移は維持。背面Overviewのスクロール固定・`inert`/aria-hidden の要否も判断 | `src/router.tsx` / `src/routes/RecipeOverviewPage.tsx`・`PartEditorPage.tsx` | 27, 28 | ✅（ルーティング）＋🖐（背面描画・close・768px境界） |
| 45 | **PaintSlotのスロット固有安定key導入**（M4レビューR1指摘5・必須事項④持ち越し）: key={colorId}×blur確定による「色内容変更直後のクリック1回吸われ＋中断編集の孤児palette生成」を解消。スロットにUI専用の安定id（永続化しない）を持たせ再マウントを排除。M3スパイク相当の実機検証＋M3レビュー観点（value再同期・pending・重複ガード）の再レビュー必須 | `src/components/part-editor/PaintSlot.tsx`・`PaintSlotList.tsx`（最小限） | 19, 21 | ✅＋🖐（吸われ再現手順の消滅確認） |
| 46 | **全ダイアログ共通フォーカストラップ**（M6レビュー指摘・横断）: ConfirmDialog／ImportErrorDialog／ExportPhotoChoiceDialog／PartReviewDialog／ShareDialog に Tab循環・Escape close・初期/復帰フォーカスを共通フック（`useFocusTrap`等）で導入 | `src/components/common/useFocusTrap.ts` ＋ 各ダイアログ | 5 | ✅（Tab循環・Esc）＋🖐 |
| 47 | （任意Low）summary(whole)使用カラー「+N」の視覚干渉解消（13色以上かつ12色目の色名が極端に長い場合のみ発生）: 12色目のlabelMaxWidthを+N実測幅ぶん縮める分岐 | `src/lib/sns/imageComposer.ts` | 37 | ✅（幾何検算） |

**コード外チェックリスト（ユーザー作業。公開前）**:
- [ ] T43③ Chrome/Safari 実印刷ダイアログ（背景色 print-color-adjust・改ページ break-inside・A4 15mm・「PDFとして保存」）
- [ ] T43④ iOS Safari / Android Chrome の Web Share A系統（画像付き共有シート投稿）
- [ ] contact@coat-codex.com の受信転送設定（Cloudflare Email Routing。/terms 記載連絡先の実効化）
- [ ] （任意）空Worker `coat-codex` の削除（`npx wrangler login` 後 `npx wrangler delete --name coat-codex`）

**v1後バックログ（§7参照。M8には含めない）**: 多言語対応（Warhammer展開言語 fr/de/it/es）／生成AI相談レシピの取り込み（AI相談テンプレート.md＋T30インポート受け皿・v2.4候補）／工程グループ拡張（モデリング等・BASE外出しカードが受け皿・v2.4候補）

#### M9〜M11: ツールライブラリ＋パーツ削除（v2.6新設: 2026-07-13ユーザーFB裁定。§2.8/§2.6/§3.1/§3.3反映）

> M8完走後の追加機能3点セット。**既存T47（M8・任意Low「summary(whole) +N視覚干渉解消」）は2026-07-04に見送り裁定済み**（`docs/state.md`記録）のため、新規タスクは**T48から採番**する。3ループ=3PRで実施（Loop1=M9独立即価値・Loop2=M10 DB基盤を単独隔離・Loop3=M11はLoop2のtoolStoreに依存）。各タスクの完了条件は「`npm run build`・`npm run lint`・ルート`npm test`が全てexit 0（新規テスト含む）」を共通前提とし、個別の実機検証項目を付記する。

##### M9: パーツ削除＋工程削除の写真孤児修正＋仕様書v2.6改訂（完了条件: T48〜T50がreview PASS＋出口実機でパーツ追加→削除確認ダイアログ→削除→一覧から消失＋Dexie photos行の消滅を実測）

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 48 | **仕様書v2.6改訂**（本タスク・docs only）: §3.1を8ルート化・§2.7にuserTools＋version(2)追記・**新設§2.8ツールライブラリ**・§2.6にパーツ削除/工程削除の写真回収規則を追記・§3.3にToolsPage/ToolSelect/ToolListEditor/PartCardList/PartEditorPageの記述更新・本§4.2にM9〜M11追加・改訂履歴にv2.6行。あわせて`docs/design/coat-codex_デザイン仕様書.md`に/toolsページ・タグチップ・PartCard削除ボタンの意匠節を追加 | `docs/coat-codex_技術計画_v2.md` / `docs/design/coat-codex_デザイン仕様書.md` | 43, 46 | — |
| 49 | **写真参照ヘルパー＋工程削除の写真孤児修正**: `lib/photoRefs.ts`の`collectReferencedPhotoIds(doc): Set<string>`（overviewPhotoIds＋baseSteps/parts全step.photoIdを収集。`chipPhotoId`は含めない＝chip削除判定への流用禁止をコメント明記）。`useRecipeStore.ts`内の同等ロジックは本関数へ置換（重複排除）。`PartEditorPage.tsx handleStepDelete`を修正: 削除stepの`photoId`を退避→更新後docで参照が残らなければ`void deletePhoto(id)`（失敗はconsole.warn） | `src/lib/photoRefs.ts` / `src/stores/useRecipeStore.ts`更新 / `src/routes/PartEditorPage.tsx`更新 / テスト | 14, 16 | ✅（純関数＋PartEditorPage: 写真付き工程削除でdeletePhoto呼び出し／写真なしは非呼び出し。photoStoreはvi.mock） |
| 50 | **パーツ削除UI**: `PartCardList.tsx`のcontrols列（↑↓の並び）に削除✕＋新prop`onRequestDelete(partId)`（`aria-label`にパーツ名含む）。`RecipeOverviewPage.tsx`に`pendingDeletePart` state＋`ConfirmDialog`（title=パーツ名埋込・description=「工程と写真も削除されます」）。`handleDeletePart`: ①対象part全step.photoId退避→②`updateRecipe`でparts filter→③新docで非参照のidを`void deletePhoto`。i18n 7ロケールに`overview.deletePart`/`deletePartTitle`/`deletePartMessage` | `src/components/overview/PartCardList.tsx` / `src/routes/RecipeOverviewPage.tsx`更新 / ja/en/fr/de/it/es/ko.json更新 / テスト | 28, 49 | ✅（ボタン発火・確認→確定でparts減少＋deletePhoto／キャンセル不変・複製回帰: duplicate後の元レシピphotos行が残る） |

##### M10: ツールライブラリ基盤＋/toolsページ（完了条件: T51〜T54がreview PASS＋出口実機で「/tools直URL 200＋root実在・追加→タグ付与→削除の往復＋Dexie userTools行実測・エクスポート→全削除→インポート復元（タグ含む）往復・375/768/1280全幅ヒットテスト真・既存レシピ/写真の非破壊（昇格後の一覧表示）」）

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 51 | **Dexie version(2)＋toolStore.ts**: `db.ts`にUserToolRecord＋`version(2)`追加（§2.7の冒頭方針コメントも改訂）。新規`db/toolStore.ts`（§2.8のAPI面） | `src/db/db.ts`更新 / `src/db/toolStore.ts` / テスト | 12 | ✅（fake-indexeddb: CRUD往復・register重複でcreated:false・updatedAt更新・**昇格テスト**=version(1)相当DBを別インスタンスで作成→close→本番dbで開き直し→既存recipes/photos/meta無傷＋userTools使用可。recipeStore/photoStore既存テスト全pass=昇格の副作用なし） |
| 52 | **/toolsルート＋ToolsPage（一覧・追加・削除）＋導線**: `router.tsx`に`/tools`追加。新規`routes/ToolsPage.tsx`（BackLink→`/`・説明文・追加行・一覧（name昇順・手動load＋変異後再list）・削除✕→ConfirmDialog→`deleteUserTool`・0件時EmptyState）。`AppFooter.tsx`に`/tools`リンク追加。i18n 7ロケール`nav.tools`/`tools.*` | `src/routes/ToolsPage.tsx` / `src/router.tsx`更新 / `src/components/common/AppFooter.tsx`更新 / ja/en/fr/de/it/es/ko.json更新 / テスト | 3, 5, 51 | ✅（空・追加・重複無視・削除フロー）＋🖐（全ブレークポイントの直URLリロード＋ヒットテスト） |
| 53 | **タグ管理**: 新規`lib/toolTags.ts`（`normalizeTag`/`addTag`/`collectAllTags`）。新規`components/tools/TagChipEditor.tsx`（制御コンポーネント）。ToolsPage各行に組込み→`updateUserToolTags` | `src/lib/toolTags.ts` / `src/components/tools/TagChipEditor.tsx` / `src/routes/ToolsPage.tsx`更新 / テスト | 52 | ✅（付与・除去・`#筆`正規化・重複無視＋ToolsPage統合） |
| 54 | **ライブラリ専用エクスポート/インポート**: 新規`lib/toolLibraryFile.ts`（zodスキーマ・`buildToolLibraryExport`/`parseToolLibraryFile`/`mergeImportedTools`。§2.8のファイル形式・マージ規約）。ToolsPageにエクスポートボタン（`downloadBlob`再利用・ファイル名`coat-codex-tools.json`）／インポート=file input→parse→zod検証→merge→結果トースト。i18n`tools.export`/`import`/`importSuccess`/`importInvalid` | `src/lib/toolLibraryFile.ts` / `src/routes/ToolsPage.tsx`更新 / テスト | 52, 53 | ✅（往復roundtrip・mergeのnameKey dedupe/タグunion・version不一致/形式不正の拒否＋ToolsPage統合） |

##### M11: エディタ統合（完了条件: T55〜T57がreview PASS＋既存ToolSelect/ToolListEditorテスト無改変pass＋出口実機で「工程エディタで新規ツール追加→/toolsに自動登録実測・別レシピの工程エディタでサジェスト表示→タグ絞り込み→選択でdoc.toolsコピー＋チェック・使用数0ツールの削除・JSONインポートで非自動登録」）

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 55 | **新規追加時のライブラリ自動登録**: `ToolSelect.tsx`/`ToolListEditor.tsx`の新規Tool生成経路で`void registerUserTool({name})`（重複はregister内部が吸収・失敗warn）。回帰テスト: JSON/Scriptoriumインポート後にuserToolsが空のまま=自動登録はUIハンドラ限定を固定 | `src/components/part-editor/ToolSelect.tsx`更新 / `src/components/setup/ToolListEditor.tsx`更新 / テスト | 30, 51 | ✅（既存ToolSelect/ToolListEditorテスト無改変pass＋新規各2件: 新名称追加でregister呼び出し／既存同名選択で非呼び出し） |
| 56 | **ToolSelectライブラリサジェスト＋タグ絞り込み＋管理導線**: マウント時`listUserTools`手動load。候補=doc.toolsに同名（`toolNameKey`）が無いライブラリツール・絞り込み=draft入力の部分一致＋タグチップ単一選択トグル・候補クリックで`{id: tool_新規, name, note}`をdoc.toolsへコピー＋当該工程toolIdsへ即チェック・節フッターに`/tools`へのLink・空ライブラリ時は節ごと非表示。i18n`editor.toolSuggestLabel`/`toolTagFilterLabel`/`toolManageLink` | `src/components/part-editor/ToolSelect.tsx`更新 / ja/en/fr/de/it/es/ko.json更新 / テスト | 51, 55 | ✅（サジェスト表示・クリックでコピー＋チェック・同名dedupe非表示・絞り込み・管理リンク） |
| 57 | **ToolSelect削除ボタン（doc.tools削除）**: 各doc.tools行に✕。`countToolUsage(doc, id)===0`のときのみ活性（§2.6）。チェック中=使用中はdisabled＋注記。削除は`ToolListEditor`と同じfilter（確認ダイアログなし） | `src/components/part-editor/ToolSelect.tsx`更新 / テスト | 10, 56 | ✅（使用数0で活性・削除でdoc.toolsから消失・チェック中disabled） |

##### M12: ツールライブラリ仕上げ＋パーツ操作列カード内統合（v2.7新設: 2026-07-14ユーザーFB裁定。§2.8/§3.3反映）

> M11完走後の仕上げ4点セット。ユーザーFB裁定4点（①レシピ→ライブラリ一括移行ボタン ②ToolSelect注記の一元化＋削除不可ツールの✕非表示 ③「今後ツールライブラリへ完全移行予定」の断り書き ④パーツ操作列のカード高はみ出し解消＝カード内統合）に対応する。各タスクの完了条件は「`npm run build`・`npm run lint`・ルート`npm test`が全てexit 0（新規テスト含む）」を共通前提とし、個別の実機検証項目を付記する。

| # | タスク | 成果物ファイル | 依存 | テスト |
|---|---|---|---|---|
| 58 | **仕様書v2.7改訂＋デザイン仕様書改訂**（本タスク・docs only）: 改訂履歴にv2.7行・§2.8に一括移行/将来方針を追記・§3.3のToolsPage/ToolSelect/PartCardList/PartCardの記述更新・本§4.2にM12追加。あわせて`docs/design/coat-codex_デザイン仕様書.md`にPartCard操作ボタンのカード内統合・ToolSelect注記一元化・ToolsPage一括移行ボタンの意匠改訂を反映 | `docs/coat-codex_技術計画_v2.md` / `docs/design/coat-codex_デザイン仕様書.md` | 54, 57 | — |
| 59 | **レシピ→ライブラリ一括移行ボタン**: `ToolsPage.tsx`に「レシピから取り込む」ボタンを追加。押下時に全レシピを読み出し`doc.tools[]`を収集→`mergeImportedTools`（T54再利用）でuserToolsへマージ→結果`{ added, merged }`件数をトースト表示（0件時もその旨）。i18n`tools.importFromRecipes`/`tools.importFromRecipesResult`等 | `src/routes/ToolsPage.tsx`更新 / i18n 7ロケール更新 / テスト | 54 | ✅（複数レシピ横断・重複名のマージ・note先勝ち・タグ温存・0件時トースト・再実行冪等） |
| 60 | **ToolSelect注記一元化＋✕非表示＋完全移行断り書き**: doc.tools各行の行内「使用中のため削除できません」注記を廃止し、リスト下に一元ヒント1行（削除条件＋「ツールは今後ツールライブラリへ完全移行予定」の断り書き）を新設。`countToolUsage(doc, id)===0`の行のみ✕を描画（disabled運用を廃止し非描画に変更）。i18n`editor.toolListHint` | `src/components/part-editor/ToolSelect.tsx`更新 / i18n 7ロケール`editor.toolListHint` / テスト（既存3件改変） | 57 | ✅（使用中行に✕非表示・削除可能行のみ✕表示・一元ヒント文言の表示） |
| 61 | **パーツ操作列カード内統合**: `PartCard.tsx`/`PartCardList.tsx`の左カラム独立controls列（⋮⋮/↑↓/✕の縦積み188px）を廃止し、⋮⋮ハンドルはカード内行頭・↑↓✕はPC(768px〜)はカード右端の横並びグループ／モバイルはカード右端の縦列としてカード内に統合する。新設の操作ボタン領域は`stopPropagation`でカードタップ（`onOpen`誤発火）を防止 | `src/components/overview/PartCard.tsx`更新 / `PartCardList.tsx`更新 / 両CSS更新 / 両テスト（既存19+9件無改変pass＋新規） | 50 | ✅（props未指定時は操作ボタン非描画・ボタン押下は`stopPropagation`で`onOpen`不発・既存19+9件pass）＋🖐（375/768/1280全幅でカードはみ出し0＋ドラッグ/開く/↑↓✕の誤発火なしヒットテスト） |

**M12完了条件**: T58〜T61がreview PASS＋出口実機で「一括移行のuserTools増加＋タグ温存＋再実行冪等・使用中ツールの✕非表示＋一元ヒント・パーツ一覧の操作列はみ出し0＋ドラッグ/開く/↑↓✕の誤発火なし・375/768/1280横はみ出し0」

### 4.3 指摘→タスク対応表（網羅性検算）

**v1レビュー指摘（1〜12）**:

| 指摘 | 担当タスク | | 指摘 | 担当タスク |
|---|---|---|---|---|
| 1 バージョン固定/peer確認 | §4.1, T1, T2 | | 7 print.css必須要件 | T36 |
| 2 MixRatioInput順序 | T20（<T25） | | 8 往復/スナップショット | T31, T32 |
| 3 PaintSlot本体 | T21 | | 9 Blob連結base64 | T29 |
| 4 techniques.ts | T8 | | 10 デプロイ | §5 |
| 5 persist/estimate | T15, T22/T33(要求), T34(UI) | | 11 利用規約 | T35, T5(リンク) |
| 6 リサイズ/Quota | T13, T14 | | 12 Web Share 2系統 | T39 |

**v2検証指摘（V-1〜V-6／D-1〜D-8）**:

| 指摘 | 担当箇所 | | 指摘 | 担当箇所 |
|---|---|---|---|---|
| V-1 T2前方参照 | T2（App直下マウント明記） | | D-2 metaテーブル定義 | T12, T15＋スキーマ§2.7追補 |
| V-2 T36依存漏れ | T36（依存に14） | | D-3 不変条件17 | T9＋スキーマ§2.5追補 |
| V-3 T24依存漏れ | T24（依存に9, 16） | | D-4 ImportErrorDialog | T33 |
| V-4 バージョン固定 | §4.1 | | D-5 EmptyState/Skeleton | T5, T22, T26, T27, T28 |
| V-5 T18並び替え手段 | T18（上下ボタン確定） | | D-6 未バックアップドット | T34 |
| V-6 T2依存記述矛盾 | T2（T26/T28に修正） | | D-7 削除ガードのデザイン欠落 | デザインパッケージ追補要求（実装はT23） |
| D-1 混合バッジ表記 | T28＋画面構成/デザイン修正 | | D-8 ドラフト既定名 | T12, T16, T22, T23, T43⑨ |

**v2.2デザイン決定稿反映（§2.0の#25/#26）**:

| 変更 | 担当箇所 |
|---|---|
| #25 提案A 工程写真1枚紐づけ | スキーマ§2.1/§2.2/§2.5-16/§2.6/§2.7、UI=T25（StepPhotoTile）・T27（StepPhotoStrip・ギャラリー廃止）・T28（PartCardサムネ規約）、印刷=T36、共有画像=§3.4/T37、QA=T43⑪ |
| #26 提案B MIX%再設計 | スキーマ§2.3/§2.4/§2.5-2〜6・10、ロジック=T7、UI=T20（MixRatioInput）・T21（PaintSlot %入力）・T28（バッジ）、出力=T32/T36/T37、i18n=T41、QA=T43⑫ |

---

## 5. Cloudflare Pagesデプロイ設定

### 5.1 確定事項

- **デプロイ先はCloudflare Pagesで確定（ユーザー決定済み）**。Workers／Functions／D1／R2／KV／環境変数シークレットはすべて不使用。純粋な静的アセット配信のみ。
- プリセット塗料JSONは`public/paints/`配下の静的アセットとして配信（CDNキャッシュに乗る）。

### 5.2 SPAフォールバック方針（v1からの訂正）

- **v1の`public/_redirects`（`/* /index.html 200`）は削除する。Cloudflare Pagesではこの書き方は誤り**（catch-allの200リライトはアセット配信と干渉し、Pagesの想定する設定ではない）。
- 正しい方式: **Cloudflare Pagesは、ビルド出力ルートに`404.html`が存在しない場合、未知のパスへのリクエストに自動で`index.html`（HTTP 200）を返すSPAフォールバックを行う**。これを前提とし、
  1. `public/_redirects`を**作成しない**
  2. `404.html`を**配置しない**（配置するとSPAフォールバックが無効化され404.htmlが返るようになる）
- 守るべき不変条件として、T6・T43で「`dist/`直下に`404.html`と`_redirects`が存在しないこと」「深いURL（例: `/recipe/xxx/print`）の直接アクセスがアプリを表示すること」を検証する。

### 5.3 wrangler.toml（全文）

```toml
# wrangler.toml — Cloudflare Pages用設定（この3行のみ。Functions等は使用しない）
name = "coat-codex"
compatibility_date = "2026-07-01"
pages_build_output_dir = "dist"
```

> **注意（指摘10）**: `pages_build_output_dir`をwrangler.tomlに記載すると、当該Pagesプロジェクトは「wrangler.toml管理」に切り替わり、**Cloudflareダッシュボード上のビルド出力ディレクトリ等の同項目がロックされ編集不可になる**。以後この設定を変更する場合はリポジトリのwrangler.tomlを修正してpushする（この一元管理は意図した挙動として採用する）。

### 5.4 ビルド設定

| 項目 | 値 |
|---|---|
| ビルドコマンド | `npm run build`（= `tsc -b && vite build`） |
| 出力ディレクトリ | `dist`（wrangler.tomlの`pages_build_output_dir`と一致させる） |
| Nodeバージョン | 20（リポジトリに`.nvmrc`=`20`を置き、Pages側環境変数`NODE_VERSION=20`も設定して二重化） |
| フレームワークプリセット | Vite |
| 環境変数・シークレット | なし |

### 5.5 GitHub連携手順

1. GitHubに`coat-codex`リポジトリを作成し、M0完了時点のコードをpush（デフォルトブランチ: `main`）。
2. Cloudflareダッシュボード → **Workers & Pages → Create → Pages → Connect to Git** → リポジトリ`coat-codex`を選択。
3. ビルド設定: Framework preset=Vite／Build command=`npm run build`／Build output directory=`dist`（wrangler.tomlがあるため出力先はtoml側が正となり、ダッシュボード側はロックされる。§5.3注意参照）。
4. 環境変数に`NODE_VERSION=20`を設定（Production/Preview両方）。
5. 以後、**`main`へのマージで本番自動デプロイ、Pull RequestごとにPreview環境**（`*.pages.dev`のプレビューURL）が自動発行される。
6. 手動デプロイが必要な場合: `npm run build && npx wrangler pages deploy dist`（プロジェクト名はwrangler.tomlの`name`で解決）。
7. カスタムドメインは取得可否確認後、Pagesの「Custom domains」から追加（コード変更不要）。

### 5.6 デプロイ検証手順（T6・T43で実施）

1. ローカル: `npm run build` → `dist/`直下に`404.html`・`_redirects`が**ない**ことを確認 → `npx wrangler pages dev dist`で`/`・`/terms`・`/recipe/dummy/part/base`等を直接開き、すべてアプリが表示されることを確認。
2. 本番/Preview URL: 全8ルートパターン（v2.6で`/tools`追加。§3.1）の直接リロードが200＋アプリ表示になることを確認。
3. `public/paints/index.json`が正しく配信されること（Content-Type: application/json）を確認。

### 5.7 注意点

- **404.htmlを生成するプラグイン・コピー処理を将来も導入しない**こと（SPAフォールバック無効化の事故防止。§5.2の検証をQAチェックリストに恒久掲載）。
- `_headers`ファイルは現時点で不要（Viteのハッシュ付きアセットはPagesのデフォルトキャッシュで十分）。必要になった場合のみ追加検討。
- Pagesの静的アセット制限（1ファイル25MiB・プロジェクト2万ファイル）は本構成では実質無関係（ユーザー写真はブラウザのIndexedDBに保存されるためデプロイ資産に含まれない）が、プリセット塗料JSONを大幅拡充する際はファイル分割（ブランド別遅延fetch構成を維持）で自然に回避できる。
- `compatibility_date`はFunctions不使用のため実挙動への影響はないが、wranglerの要求に従い設定しておく。
- サーバー側に一切のデータを持たないため、デプロイのロールバック・削除がユーザーデータに影響しないことを利用規約（T35）の説明と整合させる。

---

## 6. 未決事項（実装フェーズでの判断待ち）

- **PDFダウンロードの実現方式**: 機能としてのPDF導線は確定済み（§3.3 `ExportActionBar`）。まず印刷CSS＋ブラウザ「PDFとして保存」への誘導UI（`PrintToolbar`）で出荷し、専用生成ライブラリ（jsPDF等。日本語フォント同梱で+2〜3MBのバンドル増）まで踏み込むかはユーザー確認後に判断する
- ~~プリセット塗料DBの収録範囲~~ **解決済み（2026-07-03）**: 収録は**Citadel（334色・公式サイト由来）／Vallejo（255色・変換チャート由来）／Coat d'arms（150色・公式チャート由来）の3ブランド**で確定。全色range付き＋レンジフィルタUI対応。AKはチャート入手不可のため除外（自由入力で記録可。マスタ入手次第 docs/paints/ 方式で復活可能）。マスタはすべて docs/paints/*-master.json
- **JSONエクスポートの写真同梱デフォルト**: スキーマ・インポート処理は写真あり／なしの両形式に対応済み（§2.2／§2.7）。UI上のデフォルトをどちらにするかは、同梱時のファイルサイズ実測後に判断する

---

## 7. 将来拡張（バックログ。v1スコープ外）

- **多言語対応の拡張（2026-07-03ユーザー要望）**: **実装済み（2026-07-05・fr/de/it/es対応、同日koも追加=計7言語）**。韓国語の判断記録: Warhammer Community公式言語は en/de/es/fr/it/ja/ko（2026-07-05実見確認）で**koは公式展開言語・zhは非対応** → 基準「Warhammer展開言語に合わせる」によりkoを追加し、**中国語（簡体）は見送り**（公式基準外。需要が立てば再検討。その際の推奨案=調査済み: `"EB Garamond", "Noto Serif SC", "Songti SC", SimSun, serif` のハイブリッド＋Google Fontsスライス配信・`:lang`トラッキング分岐へのzh追加要否〔漢字なので付与側が自然〕を再判断）。koフォント戦略はデザイン仕様書§2参照（見出しのみNoto Serif KR Webフォント・本文システムゴシック・keep-all・トラッキングなし）。着手時判断の記録: 翻訳=機械翻訳（Sonnet impl）＋opusレビュー校正／glossは各言語訳（en前例踏襲。terms.*とfooter.trademarkNoticeの法的文面のみ英語流用=ユーザー裁定）／切替UI=カスタムドロップダウン（ユーザー裁定）／和文gloss用トラッキング解除の`:lang(en)`特例は5言語列挙式へ拡張（中国語追加時はトラッキング要否を再判断）。対象言語は**Warhammer（Games Workshop）の主要展開言語に合わせる** — 現行のja/enに加え、**フランス語・ドイツ語・イタリア語・スペイン語**（Warhammer Community公開言語準拠。中国語簡体は需要を見て検討）。設計メモ:
  - i18n基盤（react-i18next・全文言のキー分離）は対応済みのため、拡張作業は `locales/{fr,de,it,es}.json` の追加が中心
  - `LanguageSwitcher`はja/enの2セグメント→**6言語ではドロップダウン or メニュー化**が必要（デザイン改訂1点）
  - EN見出し（EB Garamondのdisplay・"YOUR CODEX"等）は**i18n対象外の意匠**（デザイン仕様書§2）で全言語共通。差し替わるのはgloss側 — ja以外の第3言語でglossをどう扱うか（各言語訳 or 非表示）はデザイン判断
  - プリセット塗料の`nameJa`に相当する各言語名は**持たない**（英名が正。和名はCoat d'arms公式チャート由来の例外）
  - 既知の注意点と接続: i18n永続化キーが独自`coat-codex:lang`のため、言語自動検出（LanguageDetector）導入時は整合確認（state.md申し送り済み）／欧州言語はInterでカバー可・中国語追加時のみフォント検討
  - 翻訳の作成方法（機械翻訳＋校正の運用等）は着手時に判断

- **モデリング等の工程グループ拡張（2026-07-03ユーザー要望。v2.4候補）**: Overviewの工程グループを現行の「BASE＋PARTS」から拡張し、塗装前のモデリング（組み立て・改造・下処理）等のセクションを追加できる構造にする。設計メモ:
  - UI側の受け皿はv2.3のBASE外出しカード化で確立済み（工程グループ=見出し＋カードのセクション。PartCard合成方式で追加セクションも同型に並べられる）
  - データ側はスキーマ変更が必要（案: `baseSteps`型の名前付き工程グループ配列、またはpartsへの`kind`属性追加）。schemaVersionインクリメント＋lazy migration（§2.7）＋エクスポート/インポート（§2.2）＋印刷（T36）＋共有（§3.4の対象範囲）への波及を要設計
  - 着手時にBASEの扱い（工程グループの一種へ統合するか、独立のまま並置か）を決定する

- **生成AI相談レシピの取り込み（2026-07-03ユーザー要望。v2.4候補）**: 外部の生成AI（ChatGPT/Claude等）でカラースキームを相談し、結果をエクスポートJSON形式（§2.2）で出力させて既存インポートで取り込むワークフロー。設計メモ:
  - **受け皿は既存インポートパイプライン（T30・§2.7）を無改変で使う**: 全ID再採番が適当なIDを吸収／マスタ外presetId・presetKeyのcustom降格が生成AIの幻覚キーを吸収／検証失敗時のzod issue一覧（ImportErrorDialog）をユーザーがそのまま生成AIに貼り戻して修正させるループが成立する。写真なしインポートの範囲内で完結（相談ベースのレシピは写真を持たない）
  - **成果物①: AI相談テンプレート .md** — 役割指示＋§2.2のJSON構造説明＋制約ルール＋few-shot例1〜2件＋「相談確定後にJSONのみをコードブロックで出力」指示。**渡すのは.md、受け取るのはJSON**の分担（Markdownを取り込みフォーマットにはしない — 独自パーサーが必要になり3段検証基盤も使えないため）。schemaVersion追従が必要なため、テンプレートはスキーマから再生成可能な2層構成（原本→配信）で管理する
  - **成果物②（アプリ内導線）**: SetupのImportJsonSection付近に「AI相談用テンプレートをコピー」ボタン（クリップボード経由でチャットAIに貼る）
  - **発展（§2.7への仕様変更）**: 「ブランド＋色名」で書かれた塗料をマスタと名前照合し、custom降格ではなく正規プリセットへ自動リンクする正規化拡張。初期リリースは「色は名前＋hexでcustomとして書かせる」方針が堅実（プリセット全739色の語彙をプロンプトに含めるのはトークン過大）
