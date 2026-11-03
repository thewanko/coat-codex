# loop lessons — good/bad メモリ

書き方と昇格の規則は `goal-loop` skill の「state.md と lessons.md の書き方」。
2026-07-14 までの entry（76件。CLAUDE.md・skill・rules に昇格したルールの出典を含む）は `.claude/loop/archive/lessons-2026.md` にある。同じ根本原因を探すときは Grep する。

---

## 2026-11-03 opus55-harness 規則文書の分割で昇格済みルールが1件落ち、型検査の範囲を実測せずに「全ワークスペース」と書いた [BAD]

- 事象: CLAUDE.md を skill・rules へ分割した際に「マクロタスク遅延のスタブ」ルールが移行先から消え、ルートの `npx tsc -b` が scriptorium の server（40ファイル）を検査していないのに「全ワークスペース」と書いた。どちらも独立 review の R1 が High で検出した。hook のテストでは、macOS の /bin/bash 3.2 だと `$()` 内の case 文が構文エラー（exit 2＝Stop hook の差し戻しと同じ値）になることも分かった。
- 原因: 移し替えを節単位で行い、旧文書の箇条を1件ずつ移行先と照合しなかった。ゲートの網羅範囲を references の見た目で判断し、エラーを入れて落ちるか試さなかった。
- 一般化ルール: 規則文書を分割・移設するときは、旧文書の箇条ごとに移行先を Grep で照合してから旧版を消す。「全体を検査する」と書くゲートは、各対象に意図的なエラーを入れて exit が非0になることを確かめる。hook スクリプトは /bin/bash で `bash -n` と実入力のテストを行う。
- 反映先: なし（1回目）
- 発生回数: 1回目
