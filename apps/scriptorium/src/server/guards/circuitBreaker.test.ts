// @vitest-environment node
// src/server/guards/circuitBreaker.test.ts — サーキットブレーカー判定の unit test（技術計画v1 §4.2, §4.4）

import { describe, expect, test } from "vitest";
import { FakeD1Database } from "../../../tests/fakes/d1";
import { isCircuitOpen } from "./circuitBreaker";

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
