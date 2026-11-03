---
name: ui-verify
description: ブラウザ preview（vite dev・wrangler pages dev）での出口の実機検証の手順と、この環境で偽陰性になる既知の罠。UI に触れた変更を確かめるとき、ヒットテストやブレークポイント別の確認をするとき、デプロイ構成の変更を本番で確かめるときに読む。
---

# 実機検証

検証が実際の使われ方を代表していないと、通ったはずの UI が本番で壊れる。以下は手順と、この環境で実際に踏んだ罠。

## 基本

- サーバーは `.claude/launch.json` の `coat-codex-dev`（vite、5173）、`scriptorium-pages-dev`（8788、事前に build）、`codex-pages-dev`（8790、`apps/codex/dist` を pages dev で配信）。
- 操作できるかは `document.elementFromPoint(中心座標)` のヒットテストで確かめる。`el.click()` の直呼びはヒットテストを素通りする。
- 機能の分岐を変えるデータを混ぜる: 写真あり・なし、0件・複数件、長い名前（全角スペース入り）、旧 schemaVersion の文書。スキーマを上げるタスクでは旧版の文書が必須（fixture が全部新版のユニットテストでは、DB 読み出し経路のマイグレーション漏れを検出できない）。
- レイアウトがブレークポイントで分岐する UI（パネルとフルページの切り替えなど）は、全ブレークポイントの幅で「遷移した後に見えている画面」をヒットテストする。URL の遷移が成立しただけで合格にしない（目的の UI が画面外や背面で操作できないことがある）。
- 検証で作ったデータは消し、言語などの設定は元に戻す。

## preview の背景タブで起きる偽陰性

- CSS アニメーションが currentTime=0 で止まる。座標を検証する前に `el.getAnimations().forEach(a => a.finish())` を実行する。
- viewport が 0×0 のままレイアウトされず、`elementFromPoint` が全部 null になることがある。先に `innerWidth > 0` を確かめ、0 ならスクリーンショットかリサイズで描画させる。スクリーンショットが正常でも、eval の座標系だけ死んでいることがある。
- `focus()`・`blur()` で activeElement が変わらず、focusout・focusin が発火しない（`.click()` は動くので気づきにくい）。onBlur・onFocus が起点の UI が動かなくても、すぐ実バグとは判断しない。次の3点がすべて緑なら「検証環境の限界」と記録して合格にする: ①`__reactProps` でハンドラの結線と controlled value を確認 ②`el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))` のように、フレームワークが購読する下位のイベントを明示的に発火して結果の状態を実測 ③RTL で同じ経路の回帰テストがあることを確認。
- スクロールが凍結することがある（`scrollTo`・`scrollIntoView` が効かず、`document.scrollingElement.scrollHeight` が実際の高さより小さいまま）。ビューポートの外の要素は `elementFromPoint` が全部 null になるので、スクロールに頼らず、ビューポートの高さをコンテンツの全高まで広げてからヒットテストする。

## preview では代表できないもの

- 実機の入力や OS の権限に依存する挙動（clipboard、Web Share、通知、実タッチのスクロール競合や touch-action、user activation）。設計の段階で、どの分岐を通っても意図した結果にたどり着く多段の防御（タイムアウト付きのフォールバック、body のロックなど）を要求仕様に入れる。出口レポートでは preview で確かめられなかったことを書き、「ユーザーの実機確認が必要な項目」として渡す。
- 出力の形式を指定する Web API（`canvas.toBlob`・`toDataURL`、MediaRecorder の mimeType など）は、非対応の形式でもエラーにならず、別の形式に黙って縮退する（Safari は canvas の WebP エンコードに非対応で PNG になる）。preview の Chromium は Safari の対応状況を代表しない。①対象ブラウザ（特に WebKit）の対応を設計の段階で確かめ、写真は全ブラウザ共通の JPEG に寄せて分岐自体をなくす ②送信するファイルの type や拡張子は、宣言のハードコードでなく実際の `blob.type` から決める ③バイナリを受ける API は、宣言された content-type でなく実際のバイトのマジックバイトで検証する。

## デプロイ構成の変更

- ローカルの `wrangler pages dev` は本番の Git ビルドを代表しない（`.claude/rules/deploy.md`）。デプロイ構成に触れた変更は、マージ後の本番またはプレビューの URL で「追加した機能の正常な応答」と「API 以外のルートが HTML 200 を返し、root 要素があること」の両方を確かめるまで完了にしない。
- 「出ないこと」を確かめる否定のアサーション（`grep -c` が 0 など）は、必ず「出ること」を確かめる正例と対にする。
