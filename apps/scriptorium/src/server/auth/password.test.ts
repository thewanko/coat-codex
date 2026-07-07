// @vitest-environment node
// src/server/auth/password.test.ts — PBKDF2削除パスワードのハッシュ/照合 unit test（技術計画v1 §4.4）

import { describe, expect, test } from "vitest";
import { hashDeletePassword, verifyDeletePassword } from "./password";

describe("hashDeletePassword/verifyDeletePassword", () => {
  test("roundtrip: hashして同じパスワードでverifyするとtrue", async () => {
    const stored = await hashDeletePassword("correct-horse-battery-staple");
    await expect(
      verifyDeletePassword("correct-horse-battery-staple", stored),
    ).resolves.toBe(true);
  });

  test("誤ったパスワードではfalse", async () => {
    const stored = await hashDeletePassword("correct-password");
    await expect(verifyDeletePassword("wrong-password", stored)).resolves.toBe(
      false,
    );
  });

  test("storedのハッシュ末尾1文字を改竄するとfalse", async () => {
    const stored = await hashDeletePassword("some-password");
    const tamperedLastChar = stored.at(-1) === "A" ? "B" : "A";
    const tampered = stored.slice(0, -1) + tamperedLastChar;
    await expect(verifyDeletePassword("some-password", tampered)).resolves.toBe(
      false,
    );
  });

  test("不正形式のstoredはすべてfalse（throwしない）", async () => {
    const malformed = [
      "pbkdf2-sha256$100000$onlysalt", // 要素欠落
      "pbkdf2-sha256$100000$not-base64!!!$not-base64!!!", // 不正base64
      "bcrypt$100000$c2FsdA==$aGFzaA==", // algo違い
      "", // 空文字
      "pbkdf2-sha256$abc$c2FsdA==$aGFzaA==", // iter非整数
    ];
    for (const stored of malformed) {
      await expect(verifyDeletePassword("anything", stored)).resolves.toBe(
        false,
      );
    }
  });

  test("saltOverrideで決定化: 出力が安定し正規表現にマッチ", async () => {
    const salt = new Uint8Array(16).fill(7);
    const storedA = await hashDeletePassword("deterministic-pw", salt);
    const storedB = await hashDeletePassword("deterministic-pw", salt);
    expect(storedA).toBe(storedB);
    expect(storedA).toMatch(
      /^pbkdf2-sha256\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/,
    );
  });

  test("別実装（node pbkdf2）が生成したseed形式ハッシュをWebCrypto verifyが受理する", async () => {
    // node の pbkdf2Sync('seed-delete-pw', Buffer.from('scriptorium-seed'), 100000, 32, 'sha256')
    // で生成した本物のハッシュ（WebCryptoとは別実装）。verifyが受理できればformat互換の証跡になる。
    const SEED_COMPAT_VECTOR =
      "pbkdf2-sha256$100000$c2NyaXB0b3JpdW0tc2VlZA==$TW7revPbS+9pPKYxeC32yJ5iYJ8kJe5pxwsbYeRquRo=";

    await expect(
      verifyDeletePassword("seed-delete-pw", SEED_COMPAT_VECTOR),
    ).resolves.toBe(true);
    await expect(
      verifyDeletePassword("wrong-password", SEED_COMPAT_VECTOR),
    ).resolves.toBe(false);
  });

  test("PBKDF2 CPU実測: 1回のhashDeletePasswordの所要msを記録する", async () => {
    const start = performance.now();
    await hashDeletePassword("cpu-measurement-password");
    const elapsedMs = performance.now() - start;
    console.error(
      `[password.test] hashDeletePassword elapsed: ${elapsedMs.toFixed(2)}ms`,
    );
    expect(elapsedMs).toBeLessThan(2000);
  });
});
