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

## 開発ループ運用（goal loop）

goal loop engineering で開発している。セッション（Opus 5.5）が設計・実装・裁定を行い、並列にできる独立タスクだけ `impl`（Sonnet 5.5）へ委譲し、マイルストーンの diff は `review`（Opus 5.5、読み取り専用）が独立にレビューする。手順は `goal-loop` skill、曲げられない規則は hook・ESLint・permissions で強制する。

### 構成

```
CLAUDE.md                     # 毎セッション読まれる最小限の事実（コマンド・仕様の正・禁止事項・役割）
.claude/
  agents/impl.md              # model: sonnet / effort: medium  並列タスク用の実装担当（Stop hook で型検査）
  agents/review.md            # model: opus / effort: high      静的レビュー（読み取り専用）
  skills/goal-loop/SKILL.md   # ループの手順と規律（着手・委譲・/goal・出口のときに読み込まれる）
  skills/ui-verify/SKILL.md   # ブラウザ preview での実機検証の手順と既知の罠
  rules/deploy.md             # Cloudflare デプロイ構成の規則（該当ファイルを触ったときだけ読み込まれる）
  hooks/format-lint.sh        # PostToolUse: 編集したファイルを prettier で整形し、ESLint の指摘を渡す
  hooks/typecheck-gate.sh     # impl の SubagentStop: 自分が編集した TS に型エラーがあれば差し戻す
  settings.json               # hook の登録、共有の許可、stash/restore 系の確認
  loop/lessons.md             # good/bad の教訓（過去分は loop/archive/ を Grep）
docs/state.md                 # 現在地・次の候補・決定事項・申し送り（過去の履歴は docs/archive/）
scripts/goal_loop.sh          # usage limit で止まった /goal を自動再開する wrapper
```

### 通常のループ

- ループ前に `/usage` で5時間枠と週次枠を確認する。
- 新しい種類のループは `or stop after 2 turns` で1度回してから本番の条件にする。
- 1ループ終わったら `/clear`。
- effort は既定の medium。他人のコードのバグ・flaky・スキーマ移行は `/effort high`。

### limit 自動再開（無人運転）

/goal を仕掛けた状態でセッションを抜け、`./scripts/goal_loop.sh` を手動で起動すると、`claude --continue -p` で active goal の再開を試し続ける（再試行上限つき、既定モデルは opus）。rate-limit 専用の exit code はないため、クラッシュと limit は区別できない。
