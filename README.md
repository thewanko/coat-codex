# coat-codex

Chronicle your painting rituals — a modern codex for miniature and model paint recipes.

ミニチュア・プラモデル・ガンプラの塗装レシピ作成・保存・出力ツール（クライアントサイド完結SPA）。
仕様は [docs/coat-codex_要件定義.md](docs/coat-codex_要件定義.md) と [docs/coat-codex_技術計画_v2.md](docs/coat-codex_技術計画_v2.md) を参照。

**本番**: https://coat-codex.com （Cloudflare Pages。mainマージで自動デプロイ、PRごとにプレビューURL）

## 動作検証記録

- **2026-07-02 T2（React 19×@dnd-kit peer依存スパイク）**: `@dnd-kit/core@6.3.1`＋`@dnd-kit/sortable@10.0.0`を採用確定。`npm install`でpeer依存警告なし。StrictMode下でKeyboardSensor経由の並び替え動作をブラウザ実機（Chrome/dev server）で確認、コンソール警告ゼロ。Safari・モバイル実機での追確認は任意（採用判断には影響しない）
- **2026-07-02 T6（SPAフォールバック）**: `wrangler pages dev dist`で `/`・`/terms`・`/recipe/xxx/print`（深いURL直接アクセス）すべて200＋index.htmlフォールバックを確認。`dist/`に`_redirects`・`404.html`が無いことを確認（wrangler 4.106.0）

### 2026-07-03 M7 T43 通しQA（黒狼実データ＋合成検証レシピで実施）

検証データ: ユーザー提供の黒狼2.json（黒狼: 1パーツ6工程＋ベース3工程・palette 11色・写真2枚）と、そこから合成した「黒狼検証」（マスタ外presetId・brand nullのcustom色・0工程パーツ・MIX工程入り）。dev server（preview）＋本番URLで実施。

| # | QA項目 | 結果 | 実機確認内容 |
|---|---|---|---|
| ① | UI経由export→import往復 | ✅ | JSONエクスポート（2.65MB・写真含む）→再インポートで黒狼が2件・ID再採番（別ID）・構造（パーツ/工程/palette/tools/写真数）一致・photosテーブル4→6件。T31の本番read-back経路をUI実機でカバー |
| ② | 本番URL全7ルート直接リロード | ✅ | coat-codex.com の `/`・`/setup`・`/recipe/:id`・`/part/base`・`/part/:id`・`/print`・`/terms` すべて200＋index.htmlフォールバック（`/404.html`もindex返却＝§5.2） |
| ③ | Chrome/Safari実印刷プレビュー | ⏳ユーザー | preview経由で実印刷ダイアログを開けないため未検証（下記「ユーザー依頼事項」参照） |
| ④ | 共有A系統 iOS/Android実機 | ⏳ユーザー | canShare成立環境がデスクトップpreviewに無いため未検証。B系統（手順ガイド・連番DL・Intent）はデスクトップ実機で検証済み |
| ⑤ | persist拒否時の警告表示 | ✅ | persisted()=false時にStorageStatusBarが「保護なし — ブラウザにより自動削除される可能性があります」＋Safari 7日警告を表示 |
| ⑥ | Quota超過模擬のエラー表示 | ✅ | photos書き込みをQuotaExceededErrorでスタブ→写真追加で「容量不足です…」トースト表示・onChange不発 |
| ⑦ | 使用中削除ガード | ✅ | ツール: 使用中は削除✕disabled＋「工程で使用中のため削除できません」注記、未使用ツールは削除可。色はv2.3でSetup先行登録廃止＋保存時自動GCに移行済み（手動削除UI非存在＝ガード対象外） |
| ⑧ | マスタ外presetKeyインポート降格 | ✅ | presetId `citadel:nonexistent-color-zzz` の色がsource=custom・presetId=nullへ降格、brand/hexは保持（§2.7 d′）。brand nullのcustom色もそのまま保持 |
| ⑨ | D-8既定名 | ✅ | 新規作成→タイトル未入力のままautosave→リロードで「無題のレシピ」として正常に開く（loadエラーなし） |
| ⑩ | D-6未バックアップドット消灯 | ✅ | JSONエクスポート後、当該レシピ（黒狼）のドットが data-visible=false へ消灯。未エクスポートの黒狼検証・無題は点灯継続 |
| ⑪ | 工程写真付け外しの3出力反映 | ✅ | 工程7に写真追加→PartCardサムネ＝写真がある最後の工程＋「STEP 7」タグ・印刷64×48セル・共有候補の2枚目以降（STEP 6/STEP 7）に反映 |
| ⑫ | 合計≠100の警告継承＋autosave継続 | ✅ | MIX 70/20（計90%）に変更→autosave継続（DB保存[70,20]）・PartCardバッジ「⚠ 計90%」・印刷「⚠ 計90%」・共有合成画像（1200×900）に「⚠ 計90%」＋色名ブランド併記を実ピクセル目視で確認 |

**レスポンシブ（T42）**: PC(1280)/モバイル(375)/768px境界で全7ルートをヒットテスト（elementFromPoint併用）。ヒットミス0・横スクロールなし。モバイルのタッチターゲット不足（工程↑↓ 32px・写真✕ 24px・各種✕/menu 28px・addButton 40px 等）を44px化（視覚拡大 or 不可視ヒット領域拡張）。768px境界でフルページ↔スライドインパネル・StepPhotoStripモバイル限定表示を確認。

**ユーザー依頼事項（セッションから検証不能）**:
- ③ Chrome/Safari の実ブラウザ印刷ダイアログで「背景色（スウォッチ/バッジ/封蝋の print-color-adjust）」「改ページ（break-inside: avoid）」「A4 15mmマージン」「PDFとして保存」を確認
- ④ iOS Safari / Android Chrome の実機で Web Share A系統（`navigator.share({ files })`＝共有シートで画像付き投稿）を確認。デスクトップでは canShare が files 非対応のため B系統フォールバックのみ検証済み

---

## 開発ループ運用（fable-loop-starter）

まっさらなリポジトリで goal loop engineering を始めるための最小キット。
役割分離: **design / 裁定 = セッション (Fable 5)、impl = Sonnet、selfcheck = Haiku、review = Opus**。
将軍制 (Agent Team) は含まない — ルールは lessons.md で事故が起きてから育てる設計。

要件: Claude Code v2.1.170 以上 (Fable 5 / /goal 対応)。

### 構成

```
CLAUDE.md                  # ループの定義そのもの (毎セッション自動で読まれる)
.claude/
  agents/
    impl.md                # model: sonnet  実装担当
    selfcheck.md           # model: haiku   機械的事前確認 (判断しない)
    review.md              # model: opus    静的レビュー (read-only)
  hooks/lint.sh            # PostToolUse: 編集 file の即時 lint (hint 用)
  settings.json            # 上記 hook の登録のみ (禁止系 hook はあえて無し)
  loop/lessons.md          # good/bad メモリ (毎ループ出口で追記)
docs/state.md              # 何が済んで何が次か = ループの背骨
scripts/goal_loop.sh       # usage limit 自動再開 wrapper
```

### セットアップ (5 分)

1. この中身を新規リポジトリ直下にコピーして `git init && git add -A && git commit -m "loop harness"`
2. `chmod +x scripts/goal_loop.sh .claude/hooks/lint.sh` (zip 展開で権限が落ちた場合)
3. **CLAUDE.md 末尾「プロジェクト固有」を編集** — テスト/lint コマンドと禁止パターンを自分のプロジェクトに合わせる
4. `claude --model fable` で起動 (`/init` は不要 — CLAUDE.md は本キットが提供済み)

### 最初の /goal — コードより先に検証装置を作る

/goal は「検証可能な終了条件」が全て。最初のループは機能ではなく、以後の条件に
「テスト exit 0」と書けるようにするための足場づくりに使う:

```
/goal python3 -m pytest -q が exit 0 で終了し (sample test 1 件以上)、
ruff check . が 0 件で、
docs/state.md の「完了」に本ループの entry が追記され全文表示済みで、
.claude/loop/lessons.md に本ループの entry が追記され全文表示済みである。
or stop after 8 turns
```

### 2 回目以降の通常ループ

- ループ前に `/usage` で 5h 枠・週次枠を確認 (Fable 5 利用時は週間枠 50% キャップの残りも — 上記「利用条件」参照)
- 新種のループは `or stop after 2 turns` で 1 度回し、引数なし `/goal` でターンあたり token 消費を実測 (calibration) してから本番条件に切り替える
- 1 ループ終わったら `/clear`
- 条件の書き方・役割分離の詳細は CLAUDE.md 参照

### limit 自動再開 (無人運転)

/goal を仕掛けた状態でセッションを抜け、`./scripts/goal_loop.sh` を手動起動すると、
`claude --continue -p` で active goal の再開を試行し続ける (再試行上限つき)。
rate-limit 専用の exit code は無いため、クラッシュと limit は区別できない点に注意。

### Fable 5 の利用条件 (2026-07 プロモーション、変わり得るので /model 画面で最新を確認)

- **2026-07-01〜07-07 (太平洋時間)**: Pro 以上のプランで、**週間利用上限の最大 50% まで** Fable 5 をプラン枠内で利用可能。別枠ではなく週間枠の内数で、Fable 5 は Opus 4.8 より枠の消費が速い
- 50% キャップ超過分と **2026-07-08 以降**は Usage Credits (従量課金) 消費のみ。**節約優先なら credits の自動チャージをオフ**にしておくと、キャップで止まる (勝手に課金へ流れない)
- ループ運用への含意: `/usage` 確認時は「週間枠の残り」だけでなく「**Fable 5 に割ける残り (週間枠の 50% - 消費済)**」を意識する。重いループを週前半に Fable で回すと、週後半の他モデル分まで圧迫する

### Fable がプラン枠外になったら (2026-07-08 以降)

CLAUDE.md はモデル名を固定していないので、`claude --model opus` /
`GOAL_LOOP_MODEL=opus ./scripts/goal_loop.sh` に変えるだけで同型のまま継続できる。

### 育て方

- 毎ループの出口で lessons.md に GOOD/BAD を 1 entry — **同一根本原因 2 回目で CLAUDE.md に昇格**
- 禁止系 hook・worktree 並列・別ベンダー review (Codex 等) は、必要性が lessons.md に
  2 回現れてから足す。最初から作らない
