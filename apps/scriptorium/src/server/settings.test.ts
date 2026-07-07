// @vitest-environment node
// src/server/settings.test.ts — settings 読み取りの unit test（技術計画v1 §3.1）

import { describe, expect, test } from "vitest";
import { FakeD1Database } from "../../tests/fakes/d1";
import {
  getModerationMode,
  getNsfwScreening,
  getNumericSetting,
  getSetting,
} from "./settings";

describe("getSetting", () => {
  test("存在するkeyはvalueを返す", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["moderation_mode", "approval"]]),
    ) as unknown as D1Database;
    await expect(getSetting(db, "moderation_mode")).resolves.toBe("approval");
  });

  test("存在しないkeyはnullを返す", async () => {
    const db = new FakeD1Database([]) as unknown as D1Database;
    await expect(getSetting(db, "unknown_key")).resolves.toBeNull();
  });
});

describe("getModerationMode", () => {
  test("approval明示時はapproval", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["moderation_mode", "approval"]]),
    ) as unknown as D1Database;
    await expect(getModerationMode(db)).resolves.toBe("approval");
  });

  test("auto明示時はauto", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["moderation_mode", "auto"]]),
    ) as unknown as D1Database;
    await expect(getModerationMode(db)).resolves.toBe("auto");
  });

  test("未設定（null）時は既定auto", async () => {
    const db = new FakeD1Database([]) as unknown as D1Database;
    await expect(getModerationMode(db)).resolves.toBe("auto");
  });
});

describe("getNsfwScreening", () => {
  test("on明示時はon", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["nsfw_screening", "on"]]),
    ) as unknown as D1Database;
    await expect(getNsfwScreening(db)).resolves.toBe("on");
  });

  test("off明示時はoff", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["nsfw_screening", "off"]]),
    ) as unknown as D1Database;
    await expect(getNsfwScreening(db)).resolves.toBe("off");
  });

  test("未設定（null）時は既定off", async () => {
    const db = new FakeD1Database([]) as unknown as D1Database;
    await expect(getNsfwScreening(db)).resolves.toBe("off");
  });
});

describe("getNumericSetting", () => {
  test("整数文字列はパースして返す", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["daily_post_limit", "5"]]),
    ) as unknown as D1Database;
    await expect(getNumericSetting(db, "daily_post_limit", 99)).resolves.toBe(
      5,
    );
  });

  test("非整数はfallbackを返す", async () => {
    const db = new FakeD1Database(
      [],
      new Map([["daily_post_limit", "not-a-number"]]),
    ) as unknown as D1Database;
    await expect(getNumericSetting(db, "daily_post_limit", 99)).resolves.toBe(
      99,
    );
  });

  test("未設定（null）はfallbackを返す", async () => {
    const db = new FakeD1Database([]) as unknown as D1Database;
    await expect(getNumericSetting(db, "daily_post_limit", 99)).resolves.toBe(
      99,
    );
  });
});
