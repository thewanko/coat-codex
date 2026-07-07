// lib/generateDeletePassword.test.ts — 削除PW自動生成サジェストのテスト（技術計画v1.3 §6-1）

import { describe, expect, test } from "vitest";
import { generateDeletePassword } from "./generateDeletePassword";

describe("generateDeletePassword", () => {
  test("既定長は16文字", () => {
    expect(generateDeletePassword()).toHaveLength(16);
  });

  test("指定長を渡すとその長さで生成される", () => {
    expect(generateDeletePassword(24)).toHaveLength(24);
  });

  test("英数字のみで構成される", () => {
    const password = generateDeletePassword();
    expect(password).toMatch(/^[A-Za-z0-9]+$/);
  });

  test("2回呼び出すと異なる文字列を返す", () => {
    const a = generateDeletePassword();
    const b = generateDeletePassword();
    expect(a).not.toBe(b);
  });
});
