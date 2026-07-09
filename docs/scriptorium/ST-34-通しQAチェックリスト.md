# ST-34 通しQAチェックリスト（攻撃者視点E2E＋gitleaks履歴スキャン）

仕様の正: `docs/coat-scriptorium_技術計画_v1.md` §ST-34（表 L408）＋付録B（L489-498）
実施日: 2026-07-09 / ブランチ: `impl/scriptorium-st33-i18n`
凡例: ✅=機械照合（実装＋回帰テスト）で固定済み ／ 🖐=実機検証（各ST出口で実施済み・証跡はstate.md） ／ 📱=iPhone実機の最終通しはユーザー引き渡し

## 0. 全ゲート（ST-34実施時に独立再実行）

| ゲート | 結果 |
| --- | --- |
| `npm run build`（tsc全workspace） | exit 0 ✅ |
| `npm run lint`（ESLint） | exit 0 ✅ |
| `npm test`（vitest全workspace） | **1678 passed / 139 files** exit 0 ✅ |

## 1. gitleaks 履歴スキャン（ST-34新規・付録B）

```
gitleaks git --no-banner --redact
→ 190 commits scanned. scanned ~4.11 MB
→ no leaks found  (exit 0, report=[])
```

✅ 全190コミット履歴にシークレット混入なし。ローテーション不要。
（S8任意項目: gitleaksのCI/git hook継続統合は技術計画 L452 の別タスク＝本ST対象外）

## 2. 攻撃者視点E2E（付録B）

| # | 攻撃ベクトル | 防御実装 | 証跡（回帰テスト／実機） |
| --- | --- | --- | --- |
| 1 | 巨大JSON/巨大画像→413拒否 | `postRecipe.ts` Content-Length粗チェック `COARSE_MAX_BYTES=640KB`（parse前）＋cover 450KB/thumb 80KB上限 | ✅ postRecipe「cover寸法超過(1601px)で400」「payload too large 413」 |
| 2 | 偽MIME（.jpgを名乗るHTML・SVG）拒否 | `images/imageHeader.ts` 実バイトのマジックバイト検査（JPEG SOFn走査／WebP RIFF）。content-type宣言非依存 | ✅ imageHeader 40+件（SOI/SOF/RIFF境界・切詰・ゴミバイト全null）＋postRecipe「cover不正バイト列で400 invalid cover image」「thumb不正バイト列で400」 |
| 3 | `<script>`/`onerror`のXSS投稿 | `recipe-core/schema/published.ts` `FORBIDDEN_TEXT_PATTERNS`＝`<`(山括弧)/`https?://`/`javascript:` を title・palette.name/brand・tools.name/note・parts.name・steps等**全自由テキスト**に適用 | ✅ published.test.ts（各禁止パターンでissue）。`<`禁止により`<script>`も`<img onerror>`も入口400 |
| 3b | 通過分の一覧/詳細/codexインポート後 非発火 | 全描画がReactテキストノード＝自動エスケープ。`dangerouslySetInnerHTML`/`innerHTML` **使用箇所ゼロ**（scriptorium・codex・recipe-ui全src grep） | ✅ 静的照合（sink不在）＋🖐各画面render検証（state.md S4/S5/S6出口） |
| 4 | 削除PW総当たり→429 | `deleteRecipe.ts` レート制限 del 5回/日/(ip+recipeId) | ✅ deleteRecipe「同一ip+recipeIdで誤PW5回まで403・6回目429」＋🖐S6出口実機（誤PW403逐語→seed PW削除） |
| 5 | Turnstileなし/使い回し→拒否（fail-closed） | `guards/turnstile.ts` 空token/空secret/fetch throw/HTTP500/不正JSON→全false | ✅ turnstile.test 8件＋postRecipe/report「空secretでTurnstile 403（fetch非依存）」＋🖐S6出口 実トークン往復（テストキー） |
| 6 | 通報連打→レート制限＋閾値flagged | `report.ts` report 10/日/IP 429（存在確認より前）＋distinct IP COUNT→閾値で条件付きUPDATE flagged（冪等） | ✅ report「11回目429が404より先」「threshold=3で3件目flagged＋notify 1回」「flagged後の再通報notify再発火なし」＋🖐S6出口（threshold=1でflagged D1実測） |
| 6b | （S7後）管理者による復帰 | `routes/admin.ts` flagged→published（`COALESCE(published_at)`保持・cover空復帰§8-11） | ✅ admin「flagged→published」「published_at既存値保持」＋🖐S7出口（flagged復帰D1実測） |
| 7 | 削除済み投稿の画像URL・APIが404 | `deleteRecipe.ts` status=deleted＋R2 cover/thumb best-effort削除／flagged時も`report.ts`でR2削除（ST-38） | ✅ deleteRecipe「R2削除」「既deletedは404」＋report「flagged遷移時R2削除」＋🖐S6/S8出口（/img直URL 404・詳細API 404秘匿） |
| 8 | 未ログインで /admin・/api/admin 直叩き→拒否 | `routes/admin.ts` `isAuthorizedAdminRequest`＝`Cf-Access-Jwt-Assertion`ヘッダ検証（defense-in-depth。本認証=CF Access edge） | ✅ admin「ヘッダ無し401」「空文字ヘッダ401」（GET/PUT両方）＋🖐S7出口（bypass無効化して401負例全通過） |
| 9 | 投稿制限429（per-IP日次） | `postRecipe.ts` daily_post_limit | ✅ postRecipe「daily_post_limit=2で3回目429」 |
| 10 | circuit breaker自動open→503 | `guards/circuitBreaker.ts` `openCircuitIfClosed`（closed→open単発検出・冪等）＋postRecipe結線 | ✅ circuitBreaker 6件＋postRecipe「global超過でcircuit open化＋notify1回」「open時503」＋🖐S6出口（hourly_global_limit=1でopen D1実測） |
| 11 | CORS（同一オリジン専用・ACAO固定） | `app.ts`/`postRecipe.ts`/`deleteRecipe.ts`/`feed.ts` ACAO=`coat-codex.com`固定（本番） | ✅ 各ルート「正常系/失敗系レスポンスにACAOヘッダ」 |
| 12 | OGP | `server/ogp.ts`/`recipePage.ts` | ✅ ogp.test.ts/recipePage.test.ts＋🖐各出口（og:title実在curl） |
| 13 | 深リンクリロード（SPAフォールバック） | codex純静的SPAフォールバック／scriptorium worker catch無し | ✅ 🖐S8 ST-36出口（codex深いURL直リロードにフルCSP＋root実在） |
| 14 | 重複インポート（codex側） | `codex/lib/importFromScriptorium.ts` 重複警告 | ✅ 🖐S5出口（duplicateNotice＋画像なし複製）＋📱S5 iPhone通しQA通過（2026-07-08） |

## 3. 実機引き渡し（📱 iPhone最終通し＝ST-34完了条件「🖐 iPhone含む」）

以下は各STの出口でpages dev実機検証済み（証跡=state.md）だが、**本番環境固有のギャップ**（本番CORS `coat-codex.com`固定・https・実Turnstileトークン・iOS Safari実タッチ・Resend実メール受信）はpreviewが代表しない。ユーザーのiPhone実機での最終通しQAで確認する項目:

- [x] 投稿→閲覧→通報→（自己通報でflagged）→削除の一連フローをiPhone Safariで実タッチ通し
- [x] 実Turnstileウィジェット（本番sitekey）でトークン発行→投稿/通報が成立
- [x] flagged化時のResend実メール受信（threshold=1にすると自己通報で手軽・確認後戻す）
- [x] 本番 /admin をCF Access越しでログイン→承認/復帰/削除の管理フロー（要CF Accessアプリ作成＝§9・未設定なら未認証302も確認）
- [x] 削除済みレシピの /img 直URLが本番で404

補足: S5のコア通しQA（投稿→閲覧→インポート→再編集）は2026-07-08にユーザーiPhoneで通過済み（state.md）。**上記5項目は2026-07-09にユーザー実機で全完了**（CF Accessアプリ作成・HSTS含む§9必須項目も同日完了。実施中の「flaggedレシピ削除が公開中へ移動」報告は復帰ボタンの押し間違いと確定＝delete実装は正常）。さらにcodex分pages.dev noindex（PR #68・`_headers`ホスト指定方式）もマージ後の本番curlで期待値を確認＝**ST-34完全クローズ・全マイルストーン完了**。
