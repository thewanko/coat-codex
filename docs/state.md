# state — ループの背骨

セッションは毎ループの入口で本ファイルを読み、出口で更新する。
書き方: 「最終更新」は最新と前回の2件だけ残し、古い行は `docs/archive/state-history-2026.md` の「更新ログ」の先頭へ移す。各項目は3行以内。経緯や証跡は PR 本文とコミットへ書く。
2026-07-14 までの完了履歴（codex M1〜M14、Scriptorium S0〜S8）は `docs/archive/state-history-2026.md` にある。必要なときに Grep する。

最終更新: 2026-11-04 scriptorium の削除パスワード照合でハッシュ長を検査（ブランチ `fix/password-hash-length`）。改ざんテストが base64 末尾の `=` を置き換えて33バイト化しており、約1/256で一致して落ちていた。照合は長さが32バイト以外なら false（切り詰め・空のハッシュも一致していた）。残: PR のマージ。

前回更新: 2026-11-03 impl の型検査ゲート（終了時の hook）を廃止。デスクトップアプリでは impl が報告を返してから終了するため、SubagentStop の hook の exit 2 が届かなかった。型エラーは裁定でセッションが `npx tsc -b`・`npm run lint` を再実行して見つける。PR #78 マージ済み。

## 進行中

- なし

## 次の候補 (優先順)

1. /help のスクリーンショットの撮り直しが要るか確認する（M14 で Home のアクション行と Setup の画面が変わった。申し送りの /help 残置を参照）
2. codex: 一覧で破損・未来バージョンの文書をスキップしたときの UX 改善（エラーカード表示など。B-4 レビュー L-1 の残件。i18n と技術計画 §2.7 のエラー提示方針との整合が必要）
3. codex: ShareDialog テストの既知の flake（起票済み task_f1598bc3）
4. Scriptorium の任意項目（技術計画 v1 §9）: WAF、使用量アラート、D1 バックアップの文書化、gitleaks の CI 統合。検索や7言語化などは §10 のバックログ
5. v1 後のバックログ（技術計画 v2 §7）: 生成 AI 相談レシピの取り込み、工程グループの拡張

## 決定事項 (変更には理由が要る)

- 仕様の正 = docs/coat-codex_技術計画_v2.md。ビジュアルの正 = デザイン仕様書＋決定デザインdc.html＋theme.css（**無改変**で src/styles/ へコピー済み。改変は決定稿の改訂を経ること）
- @dnd-kit/core@6.3.1 + @dnd-kit/sortable@10.0.0 で確定（新@dnd-kit/reactは見送り）
- プリセット塗料ブランドは**Citadel（334色）／Vallejo（255色）／Coat d'arms（150色）の3種**（2026-07-03改訂: 全色チャート由来・range付き。AKはチャート入手不可で除外=自由入力で記録可、入手次第マスタ方式で復活）。マスタ=docs/paints/*-master.json、収録数未決は解消
- レビュー運用: マイルストーンの diff は出口で独立した review（Opus）に通す。selfcheck は 2026-11-03 に廃止（hook と ESLint で機械化）
- **Setupの使用カラー先行登録は廃止**（2026-07-03決定、v2.3）: 色は工程のPaintPickerからのみ追加。参照0のpalette色は保存時に自動GC（チップ写真Blob含む）。トレードオフ: 参照を外したcustom色は再入力が必要（プリセットは再検索で復元可）
- **工程ツールは「その場追加＋登録済み選択」**（2026-07-03決定、v2.3）: ToolSelectで新規ツール名をその場登録→doc.toolsへ追加＋即チェック。SetupのToolListEditorは2026-07-14のM14で廃止（Setupはツールライブラリ /tools への誘導のみ）
- **パーツ共有の起点はPartReviewDialog**（2026-07-03決定）: PartCard「工程レビュー」→読み取り専用ビュー→共有ボタン（M6結線）
- **OverviewのBASEは外出しカード表示**（2026-07-03ユーザー決定、v2.3）: BaseStepOverlay廃止。PARTS同型の独立セクション（PartCard合成方式・id:"base"予約語）。ベース単独のSNS共有対象外は維持。将来の工程グループ拡張（モデリング等）の受け皿
- **SNS共有は「全体」「パーツ」の2起点**（2026-07-03決定、v2.3）: 全体=ExportActionBar起点・全体写真＋タイトルの1枚絵候補／パーツ=PartCardメニュー起点・工程ごとの1枚絵（全体画像＋工程写真＋工程情報）候補。**いずれもユーザーが最大4枚選択**（既定=先頭4枚）。投稿テキストにURL非掲載（Xリーチ抑制対策）・`#coat-codex`必須（トリム対象外）。モバイルの下部固定バーは「出力・共有」→ボトムシートへ改善。詳細は計画§3.4冒頭とT37/T39/T40

## 申し送り (次セッションの自分へ)

- **S2 recipe-ui切り出しの残置（2026-07-07・全PASS済み・対応任意）**: ①recipe-uiの`react`はdependencies（peerDependencies化はscriptoriumが別React版を持つ設計になったら。現monorepo hoistで単一インスタンス確認済み）②apps/codexのtsconfigにpackagesへのreferencesなし（recipe-core時代からの既存方式。型崩れはルート`tsc -b`ゲートで捕捉）③usePhotoUrlはphotoId切替時に旧URLを新解決まで表示継続（SwatchChip旧挙動の忠実移植。大型表示に流用する場合はCroppedPhotoのsrc照合方式と同水準の配慮を検討）④i18n.test.tsのデッドキー走査globはrecipe-ui側`*.test.*`を既存isTestフィルタで除外（`*.spec.*`等の命名規約外が入ると混入）⑤PartCardのバッジ表示ガード条件（formatMixBadge/isMixTotalValid）はMixBadge内部計算と二重（片側だけ変更すると乖離。R1 L3残置=fix案は空badgeRow spanのDOM変化を伴うため不採用）⑥**≠100警告バッジ（mixErrorBadge）の実機描画は未確認**（unit+CSS逐語一致で担保。次に警告ケースを触るループで、検証用シードデータに≠100工程を含めて実機確認すること）⑦CroppedPhoto.tsxのclassName合成は旧`${} ${?? ""}`型のまま（アトム3種はfilter/join型。統一は任意）

- **ST-12（scriptorium Pagesプロジェクト新設）への必須申し送り（2026-07-07）**: 計画§9の「Root directory=apps/scriptorium」方式は**S0で実証失敗した経路**（ルートdevDeps未インストール）。scriptorium新設時は最初から「Root directory=`/`・Build command `npm run build -w apps/scriptorium`・Output directory `apps/scriptorium/dist`」のdashboard直接指定方式を使うこと（計画v1.1改訂済み）。Build watch pathsはプロジェクト毎に自ワークスペース＋packages/**を指定
- **S0 monorepo移行の残置（2026-07-07・対応任意）**: ①docs/tools/capture-og-image.mjs（出力先`../../public/`）とcapture-help-screenshots.mjs（OUT絶対パス`.../coat-codex/src/assets/help`）が旧パスのまま=**次回スクショ/OG再生成時に要修正**（レビューST-01 L1/L2）②apps/codexの2 tsconfigはcomposite未設定でルート`tsc -b`が毎回full rebuild（noEmitのため実害なし・増分化するならleaf側にcomposite:true）③.gitignoreに`.vite/`×3・`.wrangler/`×2の重複行（機能影響なし）④prettierゲートは`--check apps "./*.{js,ts,json}"`へ拡張済み・packages/新設時（S1）にappsの後へ`packages`を追加すること⑤ルート`npm run dev`は`-w apps/codex`委譲で.claude/launch.jsonは無変更で動作（port 5173はViteデフォルト依存）

- **/helpページの残置（2026-07-05・レビューL2件・対応任意）**: ①`help.intro`が「共有・印刷まで」でバックアップ項（ステップ7）に言及しない軽微なコピー齟齬（直すなら7言語一括）②PC版スクショJPEG（250〜312KB×6）に圧縮余地（`<picture>`+lazyで実害なし）。スクショ再生成は docs/tools/capture-help-screenshots.mjs（黒狼JSON=node_modules/.verify-tmp/kurookami.json が前提。gitignore内なので消えたらユーザーの黒狼2.jsonを再インポートしてエクスポートで再生成）。**UIを変えたらスクショが陳腐化する**点に注意（特にHome/Overview/共有ダイアログの意匠変更時は撮り直し推奨）

- **非破壊クロップの残置（2026-07-05・全PASS済み・対応任意）**: ①変更なしで「適用」すると全面クロップ{0,0,1,1}が保存される（無害だが冗長データ。全面矩形はnull扱いにする改善は任意）②一覧の破損/未来Ver文書スキップは黙殺（console.warnのみ・個別を開くと明示エラーの非対称。「次の候補2」に独立タスク化済み）③PhotoCropDialogフレームのborder 1pxがgetBoundingClientRect正規化に~0.3%の系統誤差（EPSILON＋6桁丸めの防御内・R3で裁定支持）④テスト内インラインfixtureにschemaVersion:1が約30箇所残存（機能無害・マイグレーション経路も不通過）⑤dangling crop判定がexport/保存GC=chipPhotoId除外 vs インポートremap=chipPhotoId込みの3経路非対称（chip写真にcropは実データで発生しないため実害なし）⑥ハンドル44pxヒット領域は極端な縦横比画像（フレーム極細）で重なり増の理論リスク（実機8/8成立確認済み・将来の極端比実機テスト推奨）⑦listRecipesが全件safeParseするコスト新規発生（mount時のみ・doc軽量で無害=R2 L-2）

- **共有カード縦長化の残置（2026-07-05・対応任意）**: ①summary(part)は工程数が少ないと下部余白が縦長化でさらに広がる（既存申し送り「行間の均等配分はユーザー反応を見て判断」の継続。実害なし）②generateRandomSuffixの`byte % 36`剰余写像はa–d,0がわずかに高頻度（レビューL3・4枚/回の用途に実用十分・rejection samplingは不採用と記録）③長大タイトルのファイル名は切り詰めなし（OS側で扱える範囲・実害未確認）

- **M8前半の残Low（全PASS済み・対応任意）**: ①AppFooter.test.tsxの`getByAltText("")`は「空altのimgがフッター内に1つ」前提の脆いセレクタ（R2 L2。将来装飾img追加時に`querySelector("img[aria-hidden]")`等へ）②useFocusTrapの2 effect定義順（capture→初期フォーカス）はStrictMode二重mountでの正しさに寄与する順序依存（R3 L1。コメント明文化済み・入れ替え禁止）③inert付与はuseEffectのため直接URL初回ペイントに未適用の1フレームが理論上あり（R2 L3・Skeletonのみで実害なし）④favicon `?v=2`は再発時に`?v=3`へ上げるだけでよい
- **M7前半の残Low＋検証環境**: ①summary(whole)使用カラーの「+N」は「13色以上かつ12色目の色名が極端に長い」限定条件で12色目ラベル末尾と視覚干渉しうる（R3 Low・幾何は静的検算済み・機能無影響。最小修正=12色目のみlabelMaxWidthを+N実測幅ぶん縮める分岐）②T41裁定: レンジ表記は小文字キー維持（表示名変換はユーザー反応待ち）③印刷パレット行スウォッチ16pxは**デザイン仕様書§6「16px（工程行）」に適合と確定**（M6申し送りの「dc.html規定30×30」は誤記。対応不要）④検証用データ: previewのIndexedDBに黒狼実データ（ユーザー指定 Obsidian vault の黒狼2.json＝毎回ユーザーが `@` で添付）と合成「黒狼検証」（0工程パーツ・混合色・brand null・**マスタ外presetId・70/30 MIX工程**入り）をインポート済み。JSON原本は node_modules/.verify-tmp/（gitignore内・再生成可能）⑤summary(whole)「+N」視覚干渉（①）はM7で未対応のまま残置（限定条件・機能無影響。将来のカラー数UX調整時に一括対応推奨）
- **共有カードv2系の残Low申し送り（全PASS済み・対応任意）**: ①まとめカード工程行のブランド・レンジ併記は幅分配の予約対象外のため、色名が極端に長い行では併記側が「…」化する非対称あり（優先度「色名＞併記」はユーザー要望どおりの意図的設計）②工程数が少ないレシピではまとめカード下部に余白が残る（行間の均等配分調整はユーザー反応を見てM7で判断）③レンジ表記は小文字キーのまま（RangeFilterの既存表示方式と一貫。表示名変換の導入はM7 T41と同時判断）
- **M6残Low申し送り（全PASS済み・対応任意、多くはM7で自然回収）**: ①印刷パレット行スウォッチが16px（dc.html規定は30×30。hexテキスト併記で可読性担保。**T42レスポンシブ最終調整と同時に判断**）②ShareImagePreviewの候補カード表示は元写真サムネで、共有・DLされる実体（1200×900合成PNG）と見た目が異なる（機能は正・「合成後プレビュー」化はM7判断）③選択0枚時のB系統DLボタンが活性のまま（押してもno-opで無害）④全ダイアログ共通のフォーカストラップなし（次の候補3に独立タスク化済み）⑤ビューポート767px境界を跨ぐリサイズで共有中のダイアログ状態が失われる（分岐別ツリーの本質的挙動・稀）⑥ShareDialogを開いたまま背後でrecipeが更新されても候補は再生成されない（recipe.id依存・導線上起きにくい）⑦`partReview.share`キーが未使用のまま残置（**T41 i18n棚卸しで回収**）
- **M6のQA持ち越し（セッション実機検証の限界）**: ブラウザの実印刷ダイアログ（背景色・改ページ・PDF保存）はpreviewツールから開けないため未確認 → **T43③（Chrome/Safari印刷プレビュー）で必ず確認**。Web Share A系統（canShare成立環境）はデスクトップpreviewでは検証不能 → **T43④のiOS Safari/Android Chrome実機で確認**（B系統・機能検出分岐・candidate0件切替はデスクトップ実機で検証済み）
- **M5レビューLow申し送り（全PASS済み・対応任意）**: ①Homeバナーの`reminderTargets[0]`は並行エクスポートで対象が差し替わるレースあり（最悪DL2回・データ不整合なし=記録のみ）②`loadBrandColorsResult`は「正規に0色のブランド」が将来現れるとfetch失敗と誤判定（現行3ブランド非空で実害なし・コメント補足推奨）③~~Homeボタン行のヒーロー行移設とImportJsonSection破線カード意匠~~（**T42で対応済み**）④~~T31往復テストのDB read-back経路~~（**T43①のUI実機往復でカバー済み: export→import後ID再採番・構造一致・photos 4→6件を確認**）⑤import側dataUrl→Blob変換のPromise.all逐次化は任意
- **M5送り①（M4レビューR1指摘2・Medium）**: PC幅のPartEditorパネル背面にOverviewが描画されず無地（§3.1は「/recipe/:id 上のパネル」）。機能・データは正常。対応はネストルート＋`<Outlet>`化（router.tsx構造変更）— 影響範囲が広いため独立タスクで
- **M5送り②（M4レビューR1指摘5・必須事項④）**: PaintSlotのkey={colorId}×blurクリック吸われ（実機再現済み: 1クリック吸われ＋中断編集がpalette孤児を生成。確定データ損失なし・孤児はSetupの未使用削除で回収可）。対応はPaintSlot/PaintSlotList（M3確定物）へのスロット固有安定key導入 — M3リグレッション面が開くため独立タスクで
- **M4レビューLow申し送り**: `color-mix()`をRecipeCard.module.cssで初導入（Baseline 2023、Safari 16.2+が実質のブラウザ下限に）／写真表示系のobjectURL未revokeはphotoStore共有キャッシュ設計と整合した意図的挙動／pagehideのflushAutosaveはbest-effort（非同期完了非保証）
- **商標表記**（docs/legal/coat-codex_商標表記.md、2026-07-02ユーザー納品）: T35でTermsPage長文＋AppFooter短文として実装。連絡先=**contact@coat-codex.com**確定済み。受信転送は**設定済み**（2026-07-04ユーザー確認）。商用要素追加前は専門家レビュー推奨の注記あり
- ~~M4結線の必須事項3点~~（M4で充足済み: ①ストアのstripStepPending ②updater参照同一性（テストでtoBe検証） ③PaletteEditor未使用削除UI。④は実機確認の上M5送り②へ）
- ToastHost: successの自動消滅タイマーがclearTimeout管理されていない（レビューLow）。手動閉じUI追加時に対応（M5以降）
- favicon: vite.svg参照は削除済み。正式には封蝋logo.svg（デザイン仕様書§7=唯一のSVG供給アセット）を作成してindex.htmlへ結線（M4/M7）
- i18n永続化キーは独自の `coat-codex:lang`。LanguageDetector導入時は標準`i18nextLng`との整合に注意（レビューLow）
- devサーバープレビューは .claude/launch.json の `coat-codex-dev`（port 5173）
- **Worker側 `coat-codex` の削除は当面見送り**（2026-07-04ユーザー裁定。Git接続解除済みで実害なし。消す場合は `npx wrangler login` 後に `npx wrangler delete --name coat-codex`）
