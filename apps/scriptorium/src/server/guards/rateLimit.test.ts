// @vitest-environment node
// src/server/guards/rateLimit.test.ts — レート制限ガードの unit test（技術計画v1 §4.2, §4.4）

import { describe, expect, test } from "vitest";
import { FakeD1Database } from "../../../tests/fakes/d1";
import {
  checkAndIncrementRateLimit,
  dailyPeriod,
  hourlyPeriod,
  pruneOldRateLimits,
} from "./rateLimit";

describe("checkAndIncrementRateLimit", () => {
  test("limit=5で6回連続呼ぶと1〜5回目はallowed:true・6回目はallowed:false", async () => {
    const db = new FakeD1Database([]) as unknown as D1Database;
    const bucket = "post:iphash";
    const period = "2026-07-07";

    for (let i = 1; i <= 5; i++) {
      const result = await checkAndIncrementRateLimit(db, bucket, period, 5);
      expect(result).toEqual({ allowed: true, count: i });
    }

    const sixth = await checkAndIncrementRateLimit(db, bucket, period, 5);
    expect(sixth).toEqual({ allowed: false, count: 6 });
  });

  test("異なるbucket/periodは独立にカウントされる", async () => {
    const db = new FakeD1Database([]) as unknown as D1Database;

    const a1 = await checkAndIncrementRateLimit(
      db,
      "post:ip-a",
      "2026-07-07",
      5,
    );
    const b1 = await checkAndIncrementRateLimit(
      db,
      "post:ip-b",
      "2026-07-07",
      5,
    );
    const aOtherPeriod = await checkAndIncrementRateLimit(
      db,
      "post:ip-a",
      "2026-07-08",
      5,
    );

    expect(a1).toEqual({ allowed: true, count: 1 });
    expect(b1).toEqual({ allowed: true, count: 1 });
    expect(aOtherPeriod).toEqual({ allowed: true, count: 1 });
  });
});

describe("dailyPeriod", () => {
  test("ISO文字列から YYYY-MM-DD を切り出す", () => {
    expect(dailyPeriod("2026-07-07T14:30:00.000Z")).toBe("2026-07-07");
  });
});

describe("hourlyPeriod", () => {
  test("ISO文字列から YYYY-MM-DDTHH を切り出す", () => {
    expect(hourlyPeriod("2026-07-07T14:30:00.000Z")).toBe("2026-07-07T14");
  });
});

describe("pruneOldRateLimits", () => {
  test("cutoffより前のperiod行だけ削除し、当日以降は残る", async () => {
    const fakeDb = new FakeD1Database([]);
    const db = fakeDb as unknown as D1Database;
    await checkAndIncrementRateLimit(db, "post:ip-a", "2026-07-05", 5);
    await checkAndIncrementRateLimit(db, "post:ip-a", "2026-07-06", 5);
    await checkAndIncrementRateLimit(db, "post:ip-a", "2026-07-07", 5);
    await checkAndIncrementRateLimit(db, "global-post", "2026-07-06T10", 30);

    await pruneOldRateLimits(db, "2026-07-07");

    const remainingKeys = [...fakeDb.rateLimits.keys()];
    expect(remainingKeys).toContain("post:ip-a\n2026-07-07");
    expect(remainingKeys).not.toContain("post:ip-a\n2026-07-05");
    expect(remainingKeys).not.toContain("post:ip-a\n2026-07-06");
    // hourly period "2026-07-06T10" は cutoff "2026-07-07"（日次）と文字列比較で
    // "2026-07-06T10" < "2026-07-07" となり削除対象。
    expect(remainingKeys).not.toContain("global-post\n2026-07-06T10");
  });
});
