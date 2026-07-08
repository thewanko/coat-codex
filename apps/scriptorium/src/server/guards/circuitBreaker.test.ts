// @vitest-environment node
// src/server/guards/circuitBreaker.test.ts — サーキットブレーカー判定の unit test（技術計画v1 §4.2, §4.4）

import { describe, expect, test } from "vitest";
import { FakeD1Database } from "../../../tests/fakes/d1";
import { isCircuitOpen, openCircuitIfClosed } from "./circuitBreaker";

describe("isCircuitOpen", () => {
  test("circuit_breaker='open'のときtrue", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["circuit_breaker", "open"]]),
    ) as unknown as D1Database;
    await expect(isCircuitOpen(db)).resolves.toBe(true);
  });

  test("circuit_breaker='closed'のときfalse", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["circuit_breaker", "closed"]]),
    ) as unknown as D1Database;
    await expect(isCircuitOpen(db)).resolves.toBe(false);
  });

  test("未設定（null）のときfalse", async () => {
    const db = new FakeD1Database([]) as unknown as D1Database;
    await expect(isCircuitOpen(db)).resolves.toBe(false);
  });
});

describe("openCircuitIfClosed", () => {
  test("closed→trueを返しvalueが'open'になる", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["circuit_breaker", "closed"]]),
    ) as unknown as D1Database;
    await expect(openCircuitIfClosed(db)).resolves.toBe(true);
    await expect(isCircuitOpen(db)).resolves.toBe(true);
  });

  test("既にopenのときfalseを返す（changesなし）", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["circuit_breaker", "open"]]),
    ) as unknown as D1Database;
    await expect(openCircuitIfClosed(db)).resolves.toBe(false);
  });

  test("再呼び出しは冪等（1回目true・2回目false）", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["circuit_breaker", "closed"]]),
    ) as unknown as D1Database;
    await expect(openCircuitIfClosed(db)).resolves.toBe(true);
    await expect(openCircuitIfClosed(db)).resolves.toBe(false);
    await expect(isCircuitOpen(db)).resolves.toBe(true);
  });
});
