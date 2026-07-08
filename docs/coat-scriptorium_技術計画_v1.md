# Coat Scriptorium（coat書庫）技術計画 v1.3

作成日: 2026-07-06
本書は Coat Scriptorium（レシピ共有プラットフォーム）の**仕様の正**である。coat-codex 本体の仕様の正は `docs/coat-codex_技術計画_v2.md` のまま変わらない（monorepo 移行・recipe-core/recipe-ui 切り出し・RecipeDoc v3 など codex 本体に波及する変更は、実装時に v2 側へも改訂を入れる）。

前提資料: ユーザー提供の調査資料「coat書庫（仮）— レシピ共有プラットフォーム構想 調査資料 v2」（2026-07-06。§11 の確定構成が本書の要件源）。原典 `docs/coat-codex_要件定義.md` は編集禁止のまま。

---

## §0 目的とスコープ

- coat-codex（local-first・アカウント不要）のレシピを、**匿名投稿・自動公開・事後モデレーション**で共有できる公開サイト Coat Scriptorium を `scriptorium.coat-codex.com` に構築する
- スコープ内: 閲覧（一覧/詳細/OGP）・投稿（codex アプリから）・本人削除（削除パスワード）・通報・モデレーション（自動非公開/承認制切替/管理画面）・codex へのインポート（ディープリンク・画像あり/なし）
- スコープ外（§10 バックログ）: 検索・タグ・いいね・コメント・多言語 UI の 7 言語化（初期は EN+JA）

### 確定済み決定（調査資料 §11 ＋ 2026-07-06 セッション裁定）

| 項目 | 決定 |
|---|---|
| バックエンド | Cloudflare Workers + D1 + R2（Turnstile 必須）＝調査資料 案B |
| ドメイン | scriptorium.coat-codex.com（Cloudflare DNS レコード追加＋Pages カスタムドメイン） |
| 投稿者識別 | 匿名＋ハンドル自己申告＋削除パスワード。サーバーは **PBKDF2-SHA256 ハッシュのみ**保存 |
| 画像 | Cover 1 枚のみ/レシピ。クライアント側で crop 焼込→長辺 1600px WebP 200–400KB＋400px サムネ |
| 公開スキーマ | フルバックアップより情報削減（§2.2）。倉庫化防止・私的情報保護 |
| 公開粒度 | 自動公開＋事後モデレーション。**全承認制フラグを最初から実装**（settings 1 値で即切替） |
| UI 言語 | EN + JA（codex の i18n 資産から流用） |
| リポジトリ | monorepo **一括フル移行**（npm workspaces・既存アプリを `apps/codex` へ git mv） |
| 部品共有 | `packages/recipe-core`＋`packages/recipe-ui` 切り出し。codex 側も同パッケージから import |

---

## §1 リポジトリ構成（monorepo）と移行

### §1.1 目標構成

```
coat-codex/                          # リポジトリルート
├─ package.json                      # workspaces ルート（private・scripts 委譲）
├─ package-lock.json                 # 単一 lockfile（ルートのみ）
├─ tsconfig.base.json                # 共通 compilerOptions（現 tsconfig.app.json から抽出）
├─ eslint.config.js                  # ルート flat config（全 workspace 対象）
├─ vitest.config.ts                  # test.projects で全 workspace を束ねる（vitest 4 の projects 方式）
├─ docs/ / tasks/ / scripts/         # ルート残置（移動しない）
├─ apps/
│  ├─ codex/                         # 既存アプリ一式を git mv:
│  │                                 #   src/ public/ tests/ index.html vite.config.ts
│  │                                 #   tsconfig.app.json tsconfig.node.json wrangler.toml
│  └─ scriptorium/
│     ├─ src/                        # SPA（Vite+React。codex と同型）
│     ├─ src/server/                 # Hono アプリ本体（functions から独立させ unit test 可能に）
│     ├─ functions/                  # Pages Functions アダプタ（[[path]].ts / r/[id].ts）
│     ├─ migrations/                 # D1 マイグレーション SQL
│     └─ wrangler.toml               # D1/R2/AI bindings ＋ pages_build_output_dir
└─ packages/
   ├─ recipe-core/                   # zod スキーマ・migrations・交換フォーマット・純ロジック
   └─ recipe-ui/                     # 表示アトム（CroppedPhoto=無改変・SwatchChip=注入化・新設アトム）
```

`workers/` ディレクトリは作らない。API は apps/scriptorium の Pages Functions に同居する（§4.1）。

### §1.2 共通化方式

- **TypeScript**: `tsconfig.base.json` に現 `tsconfig.app.json` の compilerOptions（strict 系・`moduleResolution: "bundler"`・noEmit 等）を移し、各 workspace は `extends` する。packages は**ビルドせずソース直接 export**: `packages/recipe-core/package.json` に `"name": "@coat-codex/recipe-core"`・`"exports": { ".": "./src/index.ts" }`。TS 5.9（bundler 解決）と Vite 7 は exports の `.ts` 参照を解決できるため、d.ts ビルド・composite 参照が不要。トレードオフ（npm 外部公開不可・app ごとの重複型検査）はこの規模では許容
- **ESLint**: 現 flat config をルートへ移し ignores（dist・.wrangler 等）維持。`apps/scriptorium/{functions,src/server}` には `globals.worker` のオーバーライドブロックを追加
- **Prettier**: 設定なし（デフォルト）のまま。ゲートは `npx prettier --check apps packages`
- **Vitest**: ルート `vitest.config.ts` の `test.projects` に列挙 — apps/codex・packages/recipe-ui = jsdom＋setup、packages/recipe-core = node、apps/scriptorium = jsdom（UI）＋node（server。D1/R2 は手製フェイク §4.7）。ルート `npm test` 1 コマンドで全件

### §1.3 Cloudflare Pages 設定変更手順（codex 本番を壊さない手順）

1. monorepo 化 PR を作成。**PR 段階では main の Pages ビルドは従来設定のまま動き続ける**（Pages はビルド失敗時も直近成功デプロイを配信し続けるため本番は無傷）
2. マージ直後に coat-codex プロジェクトの dashboard 設定を変更（ユーザーアクション §9）:
   - Root directory: `/` → `apps/codex`（wrangler.toml は apps/codex 配下へ移動済み。Pages は Root directory 配下の wrangler.toml を読む）
   - Build watch paths: `apps/codex/*`・`packages/*`・`package-lock.json`（scriptorium 変更での codex 再ビルド抑止。**ワイルドカードは `*` のみ・パス区切りを跨いでマッチが公式仕様** — `**` は未定義記法で全コミットがskippedになる実害を2026-07-07に確認・是正）
3. Retry deployment → 本番 URL で全ルート直リロード検証（SPA フォールバック仕様 = `404.html`/`_redirects` を**置かない**、は不変）
4. **フォールバック**（Root directory 配下で workspace の lockfile 解決に失敗する場合）: Root directory を `/` に戻し、dashboard で Build command `npm run build -w apps/codex`・Output directory `apps/codex/dist` を直接指定。この場合ルートに wrangler.toml を置かないことで `pages_build_output_dir` の衝突を回避（設定の正が dashboard に移ることを docs/state.md に記録）

> **実証結果（2026-07-07 ST-03・v1.1改訂）**: Root directory=`apps/codex` 方式は**失敗が確定**（apps/codex 配下からの `npm install` はルート devDeps〔vitest 等〕をインストールせず、`tsc -b` が src 内 `*.test.tsx` の型検査で `Cannot find module 'vitest'`。フレッシュクローンで再現確認済み）。**上記フォールバックを本採用構成とする**（ルート lockfile による workspace 一括インストール＝ローカルゲートと同一経路。本番検証済み: 全ルート200・バンドルハッシュがローカルビルドと完全一致）。**今後の Pages プロジェクト（ST-12 の scriptorium 含む）も同方式**: Root directory=`/`・Build command `npm run build -w apps/<name>`・Output directory `apps/<name>/dist`・Build watch paths=自ワークスペース `apps/<name>/*`＋`packages/*`＋`package-lock.json`（`*`のみが公式記法・`**`は不可）

### §1.4 切り出しのリファクタ順序（コアが先・UI が後）

1. **S0**: ディレクトリ移動のみ（import パス無変更 = apps/codex 内部で完結）。差分を「移動」に限定し既存 1104 テストで不変性を証明
2. **S1 recipe-core**: 依存の無い順に (a) `models/recipe.ts`・`models/migrations.ts` → (b) `lib/mixRatio.ts`・`lib/techniques.ts`・`lib/recipeRefs.ts`・`lib/cropGeometry.ts` → (c) `lib/exporters/json.ts` の純関数部（`stripDanglingPhotoRefs`/`buildExportPlan`/`assembleExportBlob`。Dexie 依存の `exportRecipeToBlob` は codex 残留）→ (d) `lib/importRecipe.ts` の分割: ヘッダスキーマ・3 段検証・`reassignRecipeIds`・`normalizeImport`（`NormalizeImportDeps` 注入は実装済みのため移動可能）を core の `exchange/importPipeline.ts` へ。Dexie tx 書き込みだけを codex の `importRecipe.ts` に残す
3. **S2 recipe-ui**: CroppedPhoto（純 props・無改変移動）→ SwatchChip（注入化）→ 新設アトム＋codex 側参照張替えの順（移動対象と注入要否の分離は §5.2）

---

## §2 公開用交換フォーマット

### §2.1 PublishedRecipe スキーマ（packages/recipe-core/src/schema/published.ts）

```ts
export const SCRIPTORIUM_SCHEMA_VERSION = 1;

// paletteColorSchema から chipPhotoId を除外（INV-14: source='preset' ⇔ presetId 非null は維持）
publishedPaletteColorSchema = { id, source, brand, name, presetId, hex }
publishedToolSchema         = { id, name }                              // note 除外
publishedStepSchema         = { id, technique, paints, mix, toolIds }   // photoId・memo 除外
publishedRecipeSchema = z.object({
  scriptoriumSchemaVersion: z.literal(1),
  title, palette, tools, baseSteps, parts,
})
// 参照整合の不変条件（INV-2/7/9/11/12/13/14/17 相当）は recipe.ts の superRefine を流用
```

### §2.2 削減規則（RecipeDoc → PublishedRecipe）

除外: `Step.photoId`・`PaletteColor.chipPhotoId`・`createdAt`/`updatedAt`・`overviewPhotoIds`・`photoCrops`。
**`Step.memo`・`Tool.note` は公開に含める**（2026-07-08 ユーザー裁定で改訂。工程メモ・ツールノートは共有価値の高いテキストのため公開・共有する。published スキーマで memo/note を optional に追加〔旧レコード後方互換〕・strict 検証で 2000 字上限＋禁止パターン〔URL・`<`・javascript:〕を適用・scriptorium 詳細で表示〔memo は StepListView・note は RecipeDetailPage〕）。
写真は cover 1 枚のみで **recipe_json の外**（API レスポンス envelope の `coverUrl`/`thumbUrl`）に置く。この形式単体では（写真を含まないため）フルバックアップとして機能しない（倉庫化防止）。投稿 UI に「バックアップ用途には使えない」旨を明記する（§6-1）。

### §2.3 strict 検証（サーバーと codex 投稿 UI で共有）

`publishedRecipeStrictSchema = publishedRecipeSchema.superRefine(...)`:
- 文字数上限: title ≤120 / name 系 ≤80 / technique.label ≤60 / handle ≤40
- 構造上限: parts ≤50・steps 合計 ≤200・palette ≤100
- 全自由テキストで `https?://`・`<`・`javascript:` を拒否
- シリアライズ後 64KB 上限（D1 の 1MB/行制限への多重防御。**この上限は payload の JSON 部にのみ効く**。画像パートのサイズ検査は §4.4 で別途行う）

Workers は同じ `@coat-codex/recipe-core` を import して zod 検証（zod 4 は Workers で動作・追加ランタイム不要）。**codex の投稿 UI も同じ strict スキーマで送信前検証**する。JSON Schema は `z.toJSONSchema(publishedRecipeSchema)`（zod 4 標準）で `docs/scriptorium/published-recipe.schema.json` を生成する副産物とし、検証の正は常に zod。

### §2.4 変換関数（packages/recipe-core/src/convert/）

- `toPublishedRecipe(doc: RecipeDoc): PublishedRecipe` — 削減規則の純関数
- `publishedToExportFile(pub, meta: { scriptoriumId, author, importedAt }, coverDataUrl?): RecipeExportFile` — **既存 importRecipe パイプラインをそのまま再利用するためのブリッジ**。memo=""・note=null・chipPhotoId=null・timestamps=now を補完し、coverDataUrl があれば `photos:[{id:"ph_cover", dataUrl}]`＋`overviewPhotoIds:["ph_cover"]` を生成、`source` を埋めて schemaVersion=CURRENT の RecipeExportFile を返す

### §2.5 RecipeDoc v3（codex 側スキーマ変更）

- `source: { scriptoriumId: string, author: string, importedAt: ISO8601 } | null` を追加
- `CURRENT_SCHEMA_VERSION = 3`・`docRegistry[2] = doc => ({...doc, schemaVersion: 3, source: null})`・**`photosRegistry[2]` 恒等を必ず登録**（migrateExportFile は photos 部にもレジストリ適用・欠落 throw。photo-crop ループの既知の罠）。**既存の `docRegistry[1]`（v1→v2）・`photosRegistry[1]`（恒等）は保持したまま `[2]` を追記する**（キー n = vn→vn+1 の既存パターン）
- 採番が必須な理由: zod は未知キーを strip するため、スキーマに載せない限り `source` はインポート時に消える
- **タイミング制約**: v3 エクスポートファイルは v2 アプリで読めない（未来バージョン拒否）。**S1 を codex 公開アナウンス前に完了させるのが最安全**（§8-9）

---

## §3 データストア

### §3.1 D1 スキーマ（apps/scriptorium/migrations/0001_init.sql）

```sql
CREATE TABLE recipes (
  id             TEXT PRIMARY KEY,                 -- 'scr_' + UUID
  status         TEXT NOT NULL DEFAULT 'published'
                 CHECK (status IN ('published','pending','flagged','deleted')),
  handle         TEXT NOT NULL,                    -- 自己申告ハンドル
  title          TEXT NOT NULL,                    -- 一覧表示用に非正規化
  lang           TEXT,                             -- 'en'|'ja'|NULL（表示ヒント）
  schema_version INTEGER NOT NULL DEFAULT 1,       -- scriptoriumSchemaVersion
  recipe_json    TEXT NOT NULL,                    -- PublishedRecipe 丸ごと（平均 ~10KB）
  cover_key      TEXT,                             -- R2: covers/<id>.webp
  thumb_key      TEXT,                             -- R2: thumbs/<id>.webp
  delete_pw_hash TEXT NOT NULL,                    -- 'pbkdf2-sha256$<iter>$<saltB64>$<hashB64>'
  report_count   INTEGER NOT NULL DEFAULT 0,
  ip_hash        TEXT NOT NULL,                    -- HMAC-SHA256(ip, IP_HASH_SECRET)
  created_at     TEXT NOT NULL,
  published_at   TEXT,                             -- pending 中は NULL
  deleted_at     TEXT
);
CREATE INDEX idx_recipes_feed ON recipes(status, published_at DESC); -- 一覧 keyset
CREATE INDEX idx_recipes_ip   ON recipes(ip_hash);                   -- abuse 追跡

CREATE TABLE reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id  TEXT NOT NULL REFERENCES recipes(id),
  reason     TEXT NOT NULL CHECK (reason IN ('spam','nsfw','copyright','other')),
  detail     TEXT,
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (recipe_id, ip_hash)                       -- 同一IPの多重通報を無効化
);
CREATE INDEX idx_reports_recipe ON reports(recipe_id);

CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
-- 初期値: moderation_mode='auto' | circuit_breaker='closed' | report_threshold='3'
--        daily_post_limit='5' | hourly_global_limit='30' | nsfw_screening='off'

CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,   -- 'post:<ip_hash>' | 'report:<ip_hash>' | 'del:<ip_hash>:<recipeId>' | 'global-post'
  period TEXT NOT NULL,   -- '2026-07-06'（日次）| '2026-07-06T14'（時間次: global）
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, period)
);
```

rate_limits の古い行は投稿ハンドラ内で lazy delete（`DELETE ... WHERE period < ?`。Pages Functions に cron が無いための設計）。

### §3.2 R2 レイアウト

- `covers/<recipeId>.webp`（長辺 ≤1600px・≤450KB）／`thumbs/<recipeId>.webp`（長辺 ≤400px・≤80KB）
- キーはレシピ id 固定・上書きなし（immutable キャッシュの前提）。削除時（本人削除・管理者削除）に cover/thumb を同時削除

### §3.3 容量見積もり（無料枠）

- D1 500MB/DB: recipe_json 平均 ~10KB → インデックス込みでも 2〜3 万レシピで余裕
- R2 10GB: cover 400KB＋thumb 40KB ≒ 0.45MB/件 → ~2 万件。egress 無料のためインポートの画像 DL は何回でもコスト 0
- Workers 10 万 req/日・D1 読み 500 万/日: 閲覧は Cache API 併用（§4.5）で十分収まる

---

## §4 API 設計（Hono / Pages Functions）

### §4.1 配信形態: Cloudflare Pages + Pages Functions（同一オリジン）

SPA と API が 1 プロジェクト・1 デプロイになり、既存運用（Git 連携 main 自動デプロイ・PR プレビュー URL）が API 込みで効く。閲覧系は同一オリジンで CORS 不要。Cloudflare Access のパス保護（`/admin`・`/api/admin`）も同一ドメインで完結する。

比較検討した単一 Worker + Static Assets は Cloudflare の戦略的本流で cron trigger・観測性で優位だが、Git 連携ワークフローを wrangler deploy ベースに組み直すコストがあり、本件で cron が必須になる要素は lazy delete（§3.1）で回避済み。**移行保険として Hono アプリ本体を `src/server/app.ts` に置き、`functions/[[path]].ts` は `hono/cloudflare-pages` の `handle(app)` を呼ぶだけの薄いアダプタにする**（将来 Worker+Assets へ移す場合はアダプタ差し替えのみ）。

### §4.2 エンドポイント一覧

| Method/Path | 内容 | ガード |
|---|---|---|
| `POST /api/recipes` | 投稿。multipart: `payload`(JSON: handle/lang/recipe/deletePassword/turnstileToken)・`cover`・`thumb` | Turnstile → circuit breaker → rate limit(post: 5/日/IP・global-post: 30/時) → strict zod → WebP 検査 → NSFW フック → PBKDF2 → R2 put → D1 insert（moderation_mode='approval' なら status='pending'）。CORS: `https://coat-codex.com` のみ許可 |
| `GET /api/recipes?cursor&limit` | 公開一覧（status='published'・published_at DESC・keyset cursor=`published_at,id`） | Cache API 60s |
| `GET /api/recipes/:id` | 詳細（published のみ 200）。envelope: `{id, handle, lang, publishedAt, coverUrl, thumbUrl, recipe}` | Cache API 60s・CORS: coat-codex.com（codex のインポート fetch 用） |
| `GET /img/:key` | R2 画像プロキシ（covers/・thumbs/ のみ） | `Cache-Control: public, max-age=31536000, immutable`＋Cache API・CORS: coat-codex.com（画像ありインポートの fetch→dataURL 化用） |
| `POST /api/recipes/:id/report` | 通報 {reason, detail?, turnstileToken}。UNIQUE(recipe_id, ip_hash)・distinct IP 数 ≥ report_threshold で status='flagged'＋メール通知 | Turnstile＋rate limit(report: 10/日/IP) |
| `DELETE /api/recipes/:id` | 本人削除 {deletePassword}。PBKDF2 照合（定数時間比較）→ status='deleted'・deleted_at・R2 cover/thumb 削除 | 照合試行 rate limit(del: 5/日/IP/レシピ) |
| `GET/POST /api/admin/*` | `GET recipes?status=`・`POST :id/approve`・`:id/restore`・`:id/delete`（R2 同時削除）・`GET/PUT settings` | Cloudflare Access（`/api/admin*`・`/admin*` にポリシー。Functions 側でも `Cf-Access-Jwt-Assertion` ヘッダ存在を defense-in-depth 検証） |
| `GET /r/:id` | SPA の index.html を取得し HTMLRewriter で `og:title/og:description/og:image/og:url`＋`twitter:card` を注入して返す（直リンク/クローラ対応。SPA 動作は不変。取得手段は §4.6） | Cache API 300s |

### §4.3 サーバー実装ファイル構成（apps/scriptorium/src/server/）

- `app.ts` — Hono ルート定義。Bindings 型: `{ DB: D1Database; BUCKET: R2Bucket; AI?: Ai; TURNSTILE_SECRET; IP_HASH_SECRET; MAIL_API_KEY; ADMIN_EMAIL }`
- `auth/password.ts` — `hashDeletePassword` / `verifyDeletePassword`
- `guards/turnstile.ts` / `guards/rateLimit.ts` / `guards/circuitBreaker.ts`
- `images/webpHeader.ts` — WebP マジックバイト（RIFF/WEBP）＋ VP8/VP8L/VP8X ヘッダから寸法を読む純関数
- `moderation/screenImage.ts` / `moderation/notifier.ts`
- `ogp.ts` — HTMLRewriter メタ注入
- `routes/postRecipe.ts`・`deleteRecipe.ts`・`report.ts`・`admin.ts`・`feed.ts`

> **実証結果（2026-07-07 S3出口・v1.2改訂）**: Pages Functions のアダプタは**ルート直下の catch-all（`functions/[[path]].ts`）にしてはならない**。catch-all は静的アセット配信と SPA フォールバックを遮蔽し、`/`・`/terms` 等の全 SPA ルートが 404 になる（wrangler pages dev で実証）。

> **実証結果（2026-07-07 本番デプロイ・v1.3改訂）**: さらに **`functions/` ディレクトリ方式自体が本番 Git ビルドでは機能しない**ことが判明（Root directory=`/` 構成では Pages はリポジトリルート直下の `functions/` しか検出せず、`apps/scriptorium/functions/` は無視される。バンドルハッシュ一致の本番デプロイで /api が SPA フォールバック HTML を返すことで実証。**ローカル `wrangler pages dev` は wrangler.toml 隣接の functions/ を拾うため、この差はローカルでは検出できない**）。ルート直下への functions/ 配置は同じ Root=`/` の codex プロジェクトにも載ってしまうため不可。**本採用構成 = ビルド出力 `dist/_worker.js`（advanced mode）**: `src/server/worker.ts`（/api/*・/img/* → `app.fetch`／GET /r/:id → `recipePage.ts`／それ以外 → `env.ASSETS.fetch(request)` 明示フォールバック）を esbuild で `dist/_worker.js` へバンドル（`build:worker`）。出力ディレクトリ内のため Root 設定と無関係に必ず有効化される。Hono アプリ本体（app.ts）は無改変＝§4.1 の移行保険どころか **Worker+Static Assets と同型の最終形**になった

### §4.4 ガード群の設計要点

- **PBKDF2**: WebCrypto ネイティブ PBKDF2-SHA256・**100,000 iterations**・salt 16B・key 32B。bcrypt/argon2 は純 JS 実装しかなく無料枠 10ms CPU では現実的でない（PBKDF2 も実測依存のため ST-18 で確定）。ハッシュ文字列に iteration 数を自己記述させ将来増強可能に（§8-1）
- **Turnstile ガードのテスト可能性**: `guards/turnstile.ts` は siteverify の fetch を**注入可能**にし、unit test は成功/失敗レスポンスのスタブで書く（**実サイトキー/シークレットは ST-18 の unit test には不要**・実疎通は ST-21 の実機で確認）。`IP_HASH_SECRET` もテストでは固定値注入
- **multipart 受信の制約**: Workers は request body 全体をメモリに載せる。検査は二段 — ①リクエスト全体の `Content-Length` ヘッダで粗チェック（合計上限超過を parse 前に拒否）②`parseBody` 後に各パートの実バイト長で精チェック（cover ≤450KB・thumb ≤80KB・payload ≤64KB。個別パート境界は parse 後にしか判明しないため）
- **レート制限**: `INSERT ... ON CONFLICT DO UPDATE SET count=count+1 RETURNING count` の原子的 UPSERT。IP は生値を保存せず HMAC ハッシュ
- **circuit breaker**: settings.circuit_breaker='open' で投稿全拒否（503）。global-post 時間バケット超過で自動 open＋メール通知
- **WebP 検査**: Workers 内で画像デコードは不能のため、ヘッダ検査（形式・寸法・サイズ上限）に限定。偽装画像は表示崩れ止まり（Content-Type 固定＋`X-Content-Type-Options: nosniff` で XSS 面を遮断）
- **NSFW フック**: `(bytes) => Promise<{verdict: 'ok'|'flag'|'unavailable'}>` の注入可能インターフェース。既定実装は Workers AI 画像分類、settings.nsfw_screening='off' なら素通し。'unavailable' は fail-open（投稿は通し flagged にしない・ログのみ）

### §4.5 キャッシュ戦略

一覧・詳細・OGP は `caches.default` に 60〜300s TTL（`s-maxage` 併用）。Cache API の delete は colo 単位でしか効かないため、**削除/flagged の反映は TTL 失効に委ねる**（最大 5 分の残留を仕様として許容し、法務ページに明記 §5.4）。画像は immutable キーで 1 年キャッシュ。

### §4.6 OGP メタ注入

`functions/r/[id].ts` が D1 から title/handle/cover_key を引き（og:image は cover_key から `/img/:key` URL を組む）、index.html の `<head>` へ og タグを HTMLRewriter で注入。codex 本体の「SPA のため全ルート共通 OGP」制約（meta/OGP ループの既知課題）を scriptorium ではレシピ単位で解決する。

index.html の取得手段は 2 案あり ST-16 の curl 検証で確定した（v1.2改訂）: **①`context.env.ASSETS.fetch()` が機能することを wrangler pages dev で実証し本採用**（デバッグヘッダ計装で assets-fetch 経路を確認）。②`context.next()` はフォールバックとして実装に残置（catch-all アダプタ廃止後は /r/:id に他の Function がないため到達時はアセット配信へ落ちる）。

### §4.7 テスト戦略

- `src/server` は Hono の `app.request()` で unit test。D1/R2 は手製の in-memory フェイク（`tests/fakes/d1.ts`・`r2.ts`）
- `@cloudflare/vitest-pool-workers` は vitest 4 互換を確認の上で任意採用（§8-8）
- 結合確認は `npx wrangler pages dev`（ローカル D1/R2 エミュレーション）＋出口の実機 QA タスク

---

## §5 scriptorium フロントエンド

### §5.1 ルート構成（apps/scriptorium/src/router.tsx）

```
/                → FeedPage（新着一覧・サムネグリッド・「もっと見る」cursor 継ぎ足し）
/r/:id           → RecipeDetailPage（cover・palette・tools・baseSteps・parts・
                    「coat-codexにインポート」・通報ボタン・ハンドル表示）
/post-guide      → PostGuidePage（投稿は codex アプリから行う導線＋ポリシー要約）
/terms           → TermsPage（EN/JA）
/content-policy  → ContentPolicyPage（EN/JA）
/admin           → AdminPage（CF Access 保護。pending/flagged キュー・設定トグル）
*                → / へ redirect
```

### §5.2 recipe-ui 再利用の形

**移動対象と注入要否を明確に分離する**（`resolvePhotoUrl` を直 import する部品は codex 内にテストを除いても 12 以上あり〔RecipeCard・StepPhotoTile/Strip・PartEditorHeader・PrintRecipeSheet・PhotoUploader・PhotoCropDialog・OverviewHeader/PhotoStrip・ShareImagePreview 等〕、これらを一括注入化はしない）:

- **recipe-ui へ移す部品（この範囲だけが S2 のスコープ）**:
  - `CroppedPhoto` — 既に純 props（`src: string` を受ける）のため**無改変で移動**。注入不要
  - `SwatchChip` — 唯一の実質的な注入化対象。`db/photoStore.resolvePhotoUrl` 直 import をフック経由へ書き換え
  - 新設アトム: `MixBadge`・`TechniqueChip`・読み取り専用 `StepListView`
- **注入機構**: `packages/recipe-ui/src/PhotoSource.tsx` に `PhotoSourceProvider`（`resolvePhotoUrl: (photoId) => Promise<string|null>` を context 注入）＋`usePhotoUrl(photoId)` フックを新設。codex は `photoStore.resolvePhotoUrl` を注入、scriptorium は `async () => null`（公開形式に工程写真・chip 写真が無いため常にプレースホルダ/hex 表示）
- **codex に残す部品（注入化しない）**: PartCard・PartReviewDialog を含む上記 12+ の直依存部品は codex 残留のまま `photoStore` 直 import を維持し、recipe-ui のアトム（SwatchChip 等）を package から import するよう参照だけ張り替える。codex 固有のメニュー/Dexie 結線もそのまま
- scriptorium の RecipeDetailPage はアトム＋recipe-core のロジック（技法ラベル解決・MIX 表記）を組んで**新実装**（ページ層は共有しない。RecipeOverviewPage/PrintViewPage は Zustand+Router 密結合のため再利用対象外 — 調査確認済み）
- テーマ: `theme.css`（無改変の正）を recipe-ui 経由で両アプリから参照し、ビジュアル一貫性を維持

### §5.3 i18n（EN/JA）

- codex の `src/i18n/index.ts` と同型の初期化を scriptorium に新設（localStorage キー `scriptorium:lang`・fallbackLng `en`・初期値は navigator.language が ja 系なら ja）
- locales は codex の en.json/ja.json から recipe-ui/recipe-core が要求するキー（`techniques.*`・`paint.*`・`mix.*` 等）をコピーし、scriptorium 固有キーを追加
- **recipe-ui は要求キー一覧を `REQUIRED_I18N_KEYS` として export し、両アプリの locale 網羅を機械テスト**（codex T41 と同じ流儀）。`REQUIRED_I18N_KEYS` は**言語非依存のキー名集合**（codex は 7 言語・scriptorium は 2 言語と対象ロケール数が異なるため、各アプリが自分の全ロケールに対して網羅を検証する）

### §5.4 法務ページ（EN/JA）

- 利用規約: 投稿物の権利は投稿者・表示許諾・削除フロー（削除 PW / contact@coat-codex.com）・**削除反映は最大 5 分（キャッシュ TTL）の明記**
- コンテンツポリシー: **自分で撮影した写真のみ**（公式アート・ボックスアート転載 NG）・通報手続・商標免責（docs/legal/coat-codex_商標表記.md を流用）
- 投稿 UI 側注記: 「バックアップ用途には使えない」（§2.2）

---

## §6 codex 側の追加変更（apps/codex）

1. **PublishDialog**（`src/components/overview/PublishDialog.tsx`・ExportActionBar 起点）:
   - `toPublishedRecipe` で変換し「メモ・ツールnote・チップ写真・工程写真は公開されません」の削減内容プレビュー
   - cover 選択: `overviewPhotoIds` から 1 枚（CroppedPhoto プレビュー）。新設 `src/lib/coverComposer.ts` が photoCrops を canvas 焼込 → 長辺 1600px WebP（品質二分探索で 200–400KB）＋400px サムネ生成（`imageProcessing.ts` の縮尺純関数・`cropGeometry.ts` を再利用）
   - handle 入力・削除 PW 入力（自動生成サジェスト付き）・Turnstile ウィジェット（サイトキー `VITE_TURNSTILE_SITEKEY`）
   - `publishedRecipeStrictSchema` で送信前検証 → `POST https://scriptorium.coat-codex.com/api/recipes`
   - 完了画面: 公開 URL＋削除 PW を「再表示不可」警告付きコピー可能表示。Dexie meta に `scriptoriumPost:<recipeId>` = {scriptoriumId, url, postedAt} を記録（**PW は保存しない**）
2. **`?import=` ディープリンク**（`src/lib/useImportDeepLink.ts`・App 結線）:
   - `coat-codex.com/?import=<URL>` の URL を **`https://scriptorium.coat-codex.com/api/recipes/<id>` パターンの allowlist で厳格検証**（任意 URL fetch を拒否）
   - 確認ダイアログ `ImportFromScriptoriumDialog.tsx`: タイトル・作者・**画像あり/なし選択**（容量表示）→ 選択に応じ cover を fetch→dataURL 化
   - 重複検出: `source.scriptoriumId` 一致で「インポート済み。再インポートしますか」確認
   - `publishedToExportFile(...)` → 既存 `importRecipe()` をそのまま呼ぶ（3 段検証・ID 再採番・preset 降格・persist() 要求は既存 UI インポートの流儀を踏襲）→ Overview へ遷移
3. **出典表示**: RecipeOverviewPage に `source` 非 null 時「Scriptorium: @handle」＋元 URL リンクの小行

---

## §7 マイルストーン・タスク分解

- タスク番号は codex の T1〜T46 と衝突しない **ST-nn** 採番
- 「ゲート緑」= ルートで `npm test` / `npm run lint` / `npx prettier --check apps packages` / `npm run build -ws --if-present` すべて exit 0
- 🖐 = 実機検証（preview または iPhone。CLAUDE.md 実機検証の規律に従う）
- **リリース可能な最小構成 = S5 完了**（閲覧＋投稿＋インポート）。ただし**パブリックローンチのゲートは S6 完了**（自動公開の安全装備）。S5 時点は限定公開（自分のみ投稿）で運用可

### S0: monorepo 移行（完了条件: ゲート緑＋coat-codex.com 本番デプロイ機能不変）

| # | タスク | 成果物 | 依存 | 完了条件 |
|---|---|---|---|---|
| ST-01 | npm workspaces 化。既存アプリ一式を git mv で `apps/codex/` へ（docs/ 等はルート残置）。ルート package.json・lockfile 再生成 | `package.json` / `apps/codex/**` | — | `npm test -w apps/codex` 1104 件緑 |
| ST-02 | 共通設定: `tsconfig.base.json` 抽出・**ルート `tsconfig.json`（references 方式）の再構成**・ルート eslint/vitest（test.projects）・prettier ゲート更新・ルート build | ルート設定 4 ファイル | ST-01 | ゲート緑 |
| ST-03 | Pages 設定切替（§1.3。ユーザーアクション込み）→ 本番検証 → 結果を docs/state.md に記録 | dashboard 設定 / `apps/codex/wrangler.toml` | ST-02 | 🖐 本番全ルート直リロード＋新規デプロイ機能不変 |

### S1: recipe-core 切り出し＋公開スキーマ（完了条件: codex が @coat-codex/recipe-core を import・PublishedRecipe v1 確定）

| # | タスク | 成果物 | 依存 | 完了条件 |
|---|---|---|---|---|
| ST-04 | recipe-core scaffold＋`models/recipe.ts`・`migrations.ts` 移動・codex import 張替え | `packages/recipe-core/src/schema/*` | ST-02 | ゲート緑 |
| ST-05 | 純ロジック移動: mixRatio/techniques/recipeRefs/cropGeometry＋exporters/json.ts 純関数部 | `packages/recipe-core/src/logic/*`・`exchange/exportFile.ts` | ST-04 | ゲート緑 |
| ST-06 | import パイプライン分割: 3 段検証・reassignRecipeIds・normalizeImport を `exchange/importPipeline.ts` へ。codex 側は Dexie 書込のみ残す | `packages/recipe-core/src/exchange/importPipeline.ts` | ST-05 | ゲート緑（tests/roundtrip 含む） |
| ST-07 | RecipeDoc v3: `source` 追加・CURRENT_SCHEMA_VERSION=3・docRegistry[2]＋photosRegistry[2] 恒等・v1/v2→v3 テスト | schema/migrations 更新 | ST-06 | ゲート緑＋v1/v2 エクスポートファイルのインポート回帰 |
| ST-08 | `schema/published.ts`（通常＋strict）＋`convert/*`＋RecipeDoc→Published→ExportFile→importRecipe 往復テスト＋JSON Schema 生成スクリプト | `published.ts`・`convert/*`・`scripts/emit-json-schema.ts` | ST-07 | `npm test -w packages/recipe-core` 緑（削減規則・上限・URL 拒否の受理/拒否ペア） |

### S2: recipe-ui 切り出し（完了条件: codex が注入化部品で機能不変）

| # | タスク | 成果物 | 依存 | 完了条件 |
|---|---|---|---|---|
| ST-09 | recipe-ui scaffold＋PhotoSourceProvider/usePhotoUrl＋CroppedPhoto 移動 | `packages/recipe-ui/src/PhotoSource.tsx`・`CroppedPhoto.tsx` | ST-02 | ゲート緑 |
| ST-10 | SwatchChip 注入化移動＋codex App に Provider 結線 | `packages/recipe-ui/src/SwatchChip.tsx` | ST-09 | ゲート緑＋SwatchChip 既存テスト緑 |
| ST-11 | 表示アトム新設（MixBadge・TechniqueChip・StepListView）＋codex の PartCard/PartReviewDialog 等がアトムを package import するよう参照張替え（photoStore 直依存は維持 §5.2）＋REQUIRED_I18N_KEYS＋locale 網羅テスト | `packages/recipe-ui/src/*` | ST-05, ST-10 | ゲート緑＋🖐 codex Overview/印刷不変 |

### S3: scriptorium 基盤＋閲覧（完了条件: シード済み D1 の一覧/詳細がプレビュー URL で閲覧可）

| # | タスク | 成果物 | 依存 | 完了条件 |
|---|---|---|---|---|
| ST-12 | apps/scriptorium scaffold（Vite+React+router+i18n en/ja+AppShell/テーマ）＋Pages プロジェクト作成・カスタムドメイン（ユーザーアクション） | `apps/scriptorium/src/**`・`wrangler.toml` | ST-02 | 🖐 プレビュー URL で空ルート表示＋直リロード |
| ST-13 | D1/R2 provisioning（ユーザーアクション）＋`0001_init.sql`＋settings 初期値＋シードスクリプト | `migrations/0001_init.sql`・`scripts/seed.mjs` | ST-12 | `npx wrangler d1 migrations apply`（local/remote）成功・シード 3 件 |
| ST-14 | Hono 骨格＋GET 一覧/詳細/img（keyset・Cache API）＋D1/R2 フェイク unit test | `src/server/app.ts`・`functions/[[path]].ts`・`tests/fakes/*` | ST-13 | `npm test -w apps/scriptorium` 緑＋`wrangler pages dev` で API 応答 |
| ST-15 | FeedPage＋RecipeDetailPage（recipe-ui 組成・インポートリンク生成） | `src/routes/FeedPage.tsx`・`RecipeDetailPage.tsx` | ST-11, ST-14 | 🖐 シードの一覧→詳細表示 |
| ST-16 | OGP メタ注入 `functions/r/[id].ts` | 同左・`src/server/ogp.ts` | ST-14 | curl で og:title/og:image を含む HTML・SPA 動作不変 |
| ST-17 | 法務ページ EN/JA（§5.4）＋フッター | `TermsPage.tsx`・`ContentPolicyPage.tsx`・locales | ST-12 | 🖐 全ルート到達＋i18n 切替 |

### S4: 投稿（完了条件: codex から実レシピを Turnstile 込みで投稿→公開表示）

| # | タスク | 成果物 | 依存 | 完了条件 |
|---|---|---|---|---|
| ST-18 | POST /api/recipes フル実装（全ガード＋PBKDF2 実測含む。Turnstile guard は siteverify スタブ注入で実キー不要 §4.4） | `routes/postRecipe.ts`・`auth/password.ts`・`guards/*`・`images/webpHeader.ts` | ST-08, ST-14 | unit test（各ガードの拒否/受理・multipart サイズ上限・ハッシュ往復・5 件/日超過 429）＋PBKDF2 CPU 実測記録 |
| ST-19 | DELETE /api/recipes/:id（PW 照合・R2 削除・試行制限） | `routes/deleteRecipe.ts` | ST-18 | unit test |
| ST-20 | codex `coverComposer.ts`（crop 焼込→WebP 品質二分探索＋thumb。既存 `encodeFromSource` は quality 0.9 固定のため再利用不可 — coverComposer 内で `canvas.toBlob(_, "image/webp", q)` を直接呼ぶか quality 引数を追加。`calcTargetSize`・`cropGeometry.ts` は再利用） | `apps/codex/src/lib/coverComposer.ts`＋テスト | ST-05 | 純関数テスト緑＋🖐 canvas 実機 |
| ST-21 | codex PublishDialog（§6-1 全量）＋ExportActionBar 結線＋Turnstile ホスト許可（ユーザーアクション） | `PublishDialog.tsx` ほか | ST-08, ST-18, ST-20 | 🖐 プレビュー環境へ実投稿→公開表示・完了画面 URL/PW コピー |
| ST-22 | /post-guide（codex への導線・ポリシー要約） | `PostGuidePage.tsx` | ST-12 | 🖐 |

### S5: インポートフロー（完了条件: scriptorium→codex 往復が iPhone 実機で通る = **最小リリース構成**）

| # | タスク | 成果物 | 依存 | 完了条件 |
|---|---|---|---|---|
| ST-23 | useImportDeepLink＋ImportFromScriptoriumDialog（allowlist・画像あり/なし・重複検出・importRecipe 再利用） | `useImportDeepLink.ts`・`ImportFromScriptoriumDialog.tsx` | ST-08, ST-15 | unit test（allowlist 拒否・source 付与・重複検出）＋🖐 往復 |
| ST-24 | 出典表示（Overview の source 行） | `RecipeOverviewPage.tsx` 更新 | ST-07, ST-23 | 🖐 |
| ST-25 | 通し QA（iPhone Safari: 投稿→閲覧→インポート→再編集） | QA 記録 | ST-21, ST-23 | 🖐 実機ゲート |

### S6: モデレーション（完了条件: 通報→自動非公開＋通知・承認制/遮断フラグ即時反映 = **パブリックローンチのゲート**）

| # | タスク | 成果物 | 依存 | 完了条件 |
|---|---|---|---|---|
| ST-26 | POST /api/recipes/:id/report（UNIQUE ip・distinct 閾値→flagged） | `routes/report.ts` | ST-18 | unit test（多重通報無効・閾値遷移） |
| ST-27 | notifier.ts メール通知（flagged・circuit open。**プロバイダは §8-4 を先に裁定**） | `moderation/notifier.ts` | ST-26 | unit test＋🖐 実受信 |
| ST-28 | 承認制モード（pending 化・一覧/詳細除外）＋global-post 超過で自動 circuit open＋通知 | `guards/circuitBreaker.ts`・postRecipe 更新 | ST-18, ST-27 | unit test（両モード・自動遮断） |
| ST-29 | screenImage.ts NSFW フック（Workers AI・settings on/off・fail-open） | `moderation/screenImage.ts` | ST-18 | unit test（3 分岐）＋🖐 実画像疎通 |
| ST-30 | 通報ボタン UI（詳細ページ・理由選択・Turnstile） | `ReportDialog.tsx` | ST-15, ST-26 | 🖐 |

### S7: 管理（完了条件: CF Access 越しに承認/削除/設定切替）

| # | タスク | 成果物 | 依存 | 完了条件 |
|---|---|---|---|---|
| ST-31 | /api/admin/*（一覧・approve/restore/delete・settings）＋CF Access ポリシー（ユーザーアクション）＋JWT ヘッダ検証 | `routes/admin.ts` | ST-19, ST-26, ST-28 | unit test＋🖐 Access 越し（未認証 302） |
| ST-32 | /admin UI（キュー・プレビュー・操作・設定トグル） | `AdminPage.tsx` | ST-31 | 🖐 pending 承認→公開反映 |

### S8: リリース仕上げ

| # | タスク | 成果物 | 依存 | 完了条件 |
|---|---|---|---|---|
| ST-33 | i18n 棚卸し（en/ja 網羅機械チェック）＋エラーメッセージ最終 | locales＋テスト | ST-11〜ST-32 | `npm test` 緑 |
| ST-34 | 通し QA: 投稿制限 429・PW 削除・通報→非公開→TTL 反映・承認制切替・circuit・OGP・CORS・深リンクリロード・重複インポート・Access 保護・R2 削除確認 | QA チェックリスト（docs 追記） | 全タスク | 🖐（iPhone 含む） |

---

## §8 リスクと未決事項

1. **PBKDF2 と無料枠 10ms CPU**: WebCrypto PBKDF2 はネイティブだが CPU 時間に計上される。100,000 iterations で設計し ST-18 で実測。超過時は 50,000 へ後退（削除 PW という低価値シークレットの脅威モデルでは許容）。自己記述形式のため後から増強可能
2. **NSFW スクリーニング**: Workers AI に専用 NSFW 分類モデルが確実にあるか未確認（汎用分類では精度不足の恐れ・無料 Neuron 枠も小さい）。**既定 off・注入可能フック・通報ベース運用を正**とし、ST-29 は「挟める設計」の実装に留める（調査資料の決定と整合）
3. **D1 recipe_json TEXT 保存**: 現スコープ（一覧非正規化列・詳細丸ごと返却・内部検索なし）では最適。将来の検索/タグで FTS5 or 生成列を追加する拡張余地は migrations 方式が担保。1MB/行制限には 64KB 上限検証で多重防御
4. **メール通知プロバイダ未決**: MailChannels の Workers 無料連携は終了済み。Cloudflare Email Routing は受信専用で送信不可のため不採用。候補 = Resend（無料 100 通/日）。**ST-27 着手前にユーザー裁定**。初週は report_threshold=1 で保守的に運用開始できる（settings ノブ）
5. **CORS/サブドメイン間フロー**: POST /api/recipes・GET /api/recipes/:id・GET /img/:key に `Access-Control-Allow-Origin: https://coat-codex.com`。プレビュー URL からのテスト投稿は許可リスト拡張 or プレビュー専用 env var で制御。Turnstile サイトキーのホスト名許可に coat-codex.com（＋*.pages.dev）を登録
6. **Pages monorepo ビルド**（最大の移行リスク）: Root directory 設定下での npm workspaces install（workspace link 解決）。ST-03 でプレビュー検証を先行し、フォールバック（§1.3-4）を用意済み
7. **Cache API の削除反映遅延**: colo 単位 delete しかできないため完全反映は TTL（60〜300s）待ち。法務ページに反映時間を明記して仕様化（§5.4）
8. **vitest 4 × @cloudflare/vitest-pool-workers 互換**: pool-workers はメジャー追従が遅れがち。手製 D1/R2 フェイク＋`wrangler pages dev` 手動結合を正とし、pool-workers は互換確認後の任意追加
9. **RecipeDoc v3 bump と codex リリースの順序**: v3 エクスポートは v2 アプリで読めない。**S1 を codex 公開アナウンス前に完了させるのが最安全**。間に合わない場合は「v3 配布後、旧アプリ利用者はリロードで更新される（SPA・キャッシュバスト）」旨を周知
10. **画像検証の限界**: Workers 内で実デコード不能のため WebP ヘッダ検査＋サイズ上限のみ（§4.4）

---

## §9 ユーザーアクション一覧（Claude Code が直接実行できない作業）

| タイミング | 作業 |
|---|---|
| ST-03 | Cloudflare dashboard: coat-codex Pages の Root directory 変更＋Build watch paths 設定 |
| ST-12 | Pages プロジェクト `coat-scriptorium` 新規作成（Git 連携・**Root directory=`/`＋Build command `npm run build -w apps/scriptorium`＋Output directory `apps/scriptorium/dist`**=§1.3実証結果の本採用方式。Root directory=apps/scriptorium は使わない）＋DNS: scriptorium.coat-codex.com レコード＋カスタムドメイン登録 |
| ST-13 | D1 データベース・R2 バケット作成（`npx wrangler` ログイン済みならセッション実行可・要確認） |
| ST-18/21 | Turnstile ウィジェット作成（サイトキー/シークレット発行・ホスト名許可） |
| ST-27 前 | メール通知プロバイダの裁定・契約（候補 Resend）・API キー発行 |
| ST-31 | Cloudflare Access アプリケーション作成（/admin*・/api/admin* ポリシー・管理者メール許可） |
| 各シークレット | TURNSTILE_SECRET / IP_HASH_SECRET / MAIL_API_KEY を Pages の環境変数（Secret）に設定 |

---

## §10 将来拡張（バックログ）

- 検索・タグ・いいね（調査資料 §8 Phase 3。D1 FTS5 or 生成列で recipe_json から抽出）
- scriptorium UI の 7 言語化（codex の locales 資産流用で拡張容易）
- 投稿の更新（現仕様は削除→再投稿。削除 PW 照合による上書き API は将来検討）
- Workers + Static Assets への移行（アダプタ薄層化済みのため差し替えのみ）

---

## 改訂履歴

- v1.3（2026-07-07）: 本番デプロイ実証を反映。`functions/` ディレクトリ方式は Root=`/` 構成の本番 Git ビルドで検出されない（ローカル pages dev では検出できない差）ため廃止し、**`dist/_worker.js`（advanced mode）を本採用**（§1.1・§4.3。src/server/worker.ts＋recipePage.ts・esbuild バンドル）。Build watch paths の記法誤り（`**`）を公式仕様（`*` のみ・path separator 跨ぎマッチ）へ是正（§1.3。`**` 設定下では apps/codex 変更コミットまで全て skipped になっていた）
- v1.2（2026-07-07）: S3 実証結果を反映。①Functions アダプタは catch-all 禁止・パススコープマウント本採用（§4.3。catch-all は静的アセット/SPA フォールバックを遮蔽し全ページ404＝S3出口実機検証で検出）②OGP の index.html 取得は `ASSETS.fetch()` 確定（§4.6）③ST-13 シードは分岐網羅目的で5件（published 3＋pending/flagged。仕様の「3件」は下限）
- v1.1（2026-07-07）: ST-03実証結果を反映。Pages ビルドは Root directory 方式を廃し「Root=`/`＋Build command 直接指定」を本採用（§1.3・§9 ST-12）。ビルド設定の正は dashboard へ移行
- v1（2026-07-06）: 初版。調査資料 v2 §11 の確定構成＋セッション裁定（一括フル移行・recipe-core/recipe-ui 切り出し）を統合
