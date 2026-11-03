---
paths:
  - "apps/*/public/**"
  - "apps/*/wrangler.toml"
  - "apps/*/package.json"
  - "apps/scriptorium/src/server/**"
  - "apps/scriptorium/functions/**"
  - "**/_headers"
  - "**/_redirects"
  - "**/_worker.js"
---

# Cloudflare Pages のデプロイ構成

- 本番は Git 連携ビルドで、Root directory は `/`（例: Build command `npm run build -w apps/scriptorium`、Output directory `apps/scriptorium/dist`）。ローカルの `wrangler pages dev` は本番を代表しない。pages dev は wrangler.toml の隣の `functions/` を拾うが、本番は Root directory からの相対でしか探さない。
- scriptorium のサーバーは `dist/_worker.js` 方式（advanced mode）だけ。`src/server/worker.ts` を esbuild でバンドルする。`functions/` ディレクトリと、静的アセットを遮る catch-all ルートは使わない。
- codex の `public/_redirects` と `404.html` は作らない（SPA フォールバックは技術計画 §5.2）。
- セキュリティ応答ヘッダーは、scriptorium は worker が注入し、codex は `public/_headers`。`*.pages.dev` の noindex は、scriptorium は worker が判定し、codex は `_headers` のホスト指定 `https://:project.pages.dev/*`。自ゾーン外の `*.pages.dev` には Transform Rule が効かないので使わない。
- `/admin` の本認証は Cloudflare Access（edge）。worker は `Cf-Access-Jwt-Assertion` ヘッダーがなければ 401 を返す多重防御だけ。ローカルの UI 検証用に `.dev.vars` で使う `ACCESS_DEV_BYPASS=on` は本番に設定しない。
- 通知メールの env は `MAIL_API_KEY`・`NOTIFY_EMAIL_TO`・`NOTIFY_EMAIL_FROM`。
- デプロイ構成に触れた変更は、マージ後の本番 URL で確かめるまで完了にしない（`ui-verify` skill の「デプロイ構成の変更」）。
