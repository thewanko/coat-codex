# coat-codex

Chronicle your painting rituals — a modern codex for miniature and model paint recipes.

ミニチュア・プラモデル・ガンプラの塗装レシピ作成・保存・出力ツール（クライアントサイド完結SPA）。
仕様は [docs/coat-codex_要件定義.md](docs/coat-codex_要件定義.md) と [docs/coat-codex_技術計画_v2.md](docs/coat-codex_技術計画_v2.md) を参照。

**本番**: https://coat-codex.com （Cloudflare Pages。mainマージで自動デプロイ、PRごとにプレビューURL）

## 動作検証記録

- **2026-07-02 T2（React 19×@dnd-kit peer依存スパイク）**: `@dnd-kit/core@6.3.1`＋`@dnd-kit/sortable@10.0.0`を採用確定。`npm install`でpeer依存警告なし。StrictMode下でKeyboardSensor経由の並び替え動作をブラウザ実機（Chrome/dev server）で確認、コンソール警告ゼロ。Safari・モバイル実機での追確認は任意（採用判断には影響しない）
- **2026-07-02 T6（SPAフォールバック）**: `wrangler pages dev dist`で `/`・`/terms`・`/recipe/xxx/print`（深いURL直接アクセス）すべて200＋index.htmlフォールバックを確認。`dist/`に`_redirects`・`404.html`が無いことを確認（wrangler 4.106.0）

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
