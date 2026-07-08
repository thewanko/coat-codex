# 公開前セキュリティ硬化（S8統合・技術計画v1.6）

2026-07-08 ユーザー提供の公開前セキュリティチェックリスト（11節）を実装と突き合わせ、ギャップを S8 に統合。
ユーザー裁定: ①新規マイルストーンは立てず S8 リリース仕上げに統合 ②コード硬化4点すべて今回スコープ。
仕様の正 = `docs/coat-scriptorium_技術計画_v1.md`（v1.6・S8節／付録A・B）。

進捗: **ST-36 実装完了**（R2 PASS・実機CSP検証全通過・PR提出）。次=ST-37 プライバシーポリシー。

## 実装済み・確認済み（対応不要）

3体 Explore で全11節を実コード照合。入力検証・SQLi・レート制限・PBKDF2・Turnstile fail-closed・
XSS sink・画像マジックバイト・EXIF除去・シークレット衛生は**実装済み＆テスト済み**（技術計画 付録A）。

## ST-36: セキュリティ応答ヘッダー（CSP等） [優先: 高] — ✅実装完了（2026-07-08・R2 PASS C0/H0/M0/L0）

- [x] scriptorium=`securityHeaders.ts`新設＋`worker.ts` ラップ（ASSETS.fetch HTML＋handleRecipePage HTML。/api・/img 非ラップ）
- [x] codex=`apps/codex/public/_headers` 新設（`connect-src` に scriptorium 追加）
- [x] CSP フルセット＋Referrer-Policy・X-Frame-Options: DENY・Permissions-Policy
- [x] script に `'unsafe-inline'` なし（両 dist のインラインscriptゼロ実測）
- [x] 🖐 両アプリ pages dev で主要フロー通し=コンソール CSP 違反ゼロ（scriptorium: Feed/Detail/通報の実Turnstile完全往復/削除/Fonts/OGP ・ codex: PublishDialog=Turnstileトークン実発行/SNS共有/Fonts。レビューH2件=connect-src指摘はCF公式docs＋実機で棄却確定）
- [ ] **マージ後**: 本番/プレビュー URL の応答ヘッダー実在を curl（正例＋非APIルート HTML 200＋root 実在）＋実機ブラウザ再確認

## ST-37: プライバシーポリシーページ [優先: 高]

- [ ] `apps/scriptorium/src/routes/PrivacyPage.tsx`（Terms/ContentPolicy 同型・LegalPage.module.css 再利用）＋route `/privacy`＋footer リンク
- [ ] 記載必須（§10）: IPハッシュ一時保持（生IP非保存・保持期間）／削除PW（PBKDF2・復元不可）／Cloudflare（D1/R2/Turnstile）／トラッキング無し／cover保存／contact@coat-codex.com
- [ ] `privacy.*` i18n（en/ja 実訳＋他5 en placeholder）・i18n.test 構造一致
- [ ] RTL レンダーテスト（heading・contactリンク・内部Link）
- [ ] 🖐 /privacy 描画・フッター導線。**最終文面はユーザー確認**
- [ ] （任意）codex PublishDialog から scriptorium プライバシーポリシーへのリンク1行

## ST-38: flagged 化時の R2 画像削除 [優先: 中]

- [ ] `report.ts`: published→flagged 実遷移時のみ（changes>0）cover/thumb を R2 best-effort 削除（deleteRecipe 同型・失敗は console.warn 継続）
- [ ] キーは flagged 前 SELECT or RETURNING で取得
- [ ] 復帰トレードオフ（画像は復帰しない）を §8-11・プライバシーに記載済み
- [ ] 回帰テスト（遷移時削除・未満は非削除・R2失敗でも通報成功）
- [ ] 🖐 threshold=1→通報→flagged→/img 直URL 404

## ST-39: robots.txt／*.pages.dev noindex [優先: 中]

- [ ] 両アプリ `public/robots.txt`（本番 index 許可）
- [ ] scriptorium=`worker.ts` で hostname が `.pages.dev` 終端なら `X-Robots-Tag: noindex`（ST-36 と同一ファイル）
- [ ] codex 分の pages.dev noindex は Transform Rule（§9 ユーザーアクション）
- [ ] 🖐 /robots.txt 200・pages.dev 応答に noindex（scriptorium）

## ST-33 拡張（S8仕上げ・S7後）

- [ ] i18n 棚卸しに `privacy.*` を含めた en/ja 網羅機械チェック＋エラーメッセージ最終

## ST-34 拡張（S8仕上げ・S7後）＝攻撃者視点E2E（技術計画 付録B）

- [ ] 巨大JSON/巨大画像/偽MIME（.jpg名乗るHTML・SVG）→拒否
- [ ] `<script>`/`onerror` 投稿→禁止パターン拒否・通過分は一覧/詳細/codexインポート後の3画面で非発火
- [ ] 削除PW総当たり→429・Turnstileなし/使い回し→拒否・通報連打→閾値flagged・削除済み画像URL 404
- [ ] （S7後）未ログイン管理URL直叩き→拒否
- [ ] gitleaks 履歴スキャン（`gitleaks git`）→検出時キーローテーション

## ユーザーアクション（Cloudflareダッシュボード・§9に一覧化済み）

- [ ] HTTPS強制＋HSTS ／ WAF無料ルール＋Bot Fight Mode
- [ ] codex分 *.pages.dev noindex Transform Rule（hostname contains .pages.dev → X-Robots-Tag: noindex）
- [ ] 使用量アラート（Workers/D1/R2）／D1バックアップ（Time Travel＋定期エクスポート）文書化
- [ ] Secret設定確認（TURNSTILE_SECRET/MAIL_API_KEY/IP_HASH_SECRET・VITE_TURNSTILE_SITEKEY・NOTIFY_EMAIL_*）
- [ ] バインディング最小権限 ／ gitleaks を CI/git hook 統合（推奨）

## ループ運用

- 1 ST = 1 impl委譲 = 1 PR。ST-36→37→38→39 順次。ブランチはスタック（state.md/lessons.md の3-way衝突回避）・PR本文にマージ順明記
- 完了条件に build(tsc)/lint/test。セッションは裁定で build/lint 独立再実行
- ST-33/34 は S7 完了後の S8 仕上げで実施
