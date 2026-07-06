// lib/storageHealth.test.ts — ストレージ保全APIのテスト（技術計画v2.2 §3.5・T15）
//
// fake-indexeddbでグローバルのindexedDBをポリフィルし、Dexie(db.ts)を実DBのように動作させる。
// navigator.storageはvi.stubGlobalでモックする。

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "../db/db";
import {
  checkPersisted,
  estimateUsage,
  isRecipeBackedUp,
  readAllRecipeExports,
  readPersistRecord,
  readRecipeExport,
  readReminderSnooze,
  recordPersistResult,
  recordRecipeExport,
  requestPersist,
  shouldRequestPersist,
  shouldShowExportReminder,
  snoozeReminder,
} from "./storageHealth";

beforeEach(async () => {
  await db.meta.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ブラウザAPIラッパー", () => {
  describe("requestPersist", () => {
    test("navigator.storage非対応環境ではundefinedを返す", async () => {
      vi.stubGlobal("navigator", {});
      await expect(requestPersist()).resolves.toBeUndefined();
    });

    test("persist()が許可(true)を返す場合はtrueを返す", async () => {
      const persist = vi.fn().mockResolvedValue(true);
      vi.stubGlobal("navigator", { storage: { persist } });
      await expect(requestPersist()).resolves.toBe(true);
      expect(persist).toHaveBeenCalledTimes(1);
    });

    test("persist()が拒否(false)を返す場合はfalseを返す", async () => {
      const persist = vi.fn().mockResolvedValue(false);
      vi.stubGlobal("navigator", { storage: { persist } });
      await expect(requestPersist()).resolves.toBe(false);
    });
  });

  describe("checkPersisted", () => {
    test("navigator.storage非対応環境ではundefinedを返す", async () => {
      vi.stubGlobal("navigator", {});
      await expect(checkPersisted()).resolves.toBeUndefined();
    });

    test("persisted()の結果をそのまま返す", async () => {
      const persisted = vi.fn().mockResolvedValue(true);
      vi.stubGlobal("navigator", { storage: { persisted } });
      await expect(checkPersisted()).resolves.toBe(true);
    });
  });

  describe("estimateUsage", () => {
    test("navigator.storage非対応環境ではundefinedを返す", async () => {
      vi.stubGlobal("navigator", {});
      await expect(estimateUsage()).resolves.toBeUndefined();
    });

    test("estimate()のusage/quotaを返す", async () => {
      const estimate = vi.fn().mockResolvedValue({ usage: 123, quota: 456 });
      vi.stubGlobal("navigator", { storage: { estimate } });
      await expect(estimateUsage()).resolves.toEqual({
        usage: 123,
        quota: 456,
      });
    });

    test("usage/quotaがundefinedの場合は0に正規化する", async () => {
      const estimate = vi.fn().mockResolvedValue({});
      vi.stubGlobal("navigator", { storage: { estimate } });
      await expect(estimateUsage()).resolves.toEqual({ usage: 0, quota: 0 });
    });
  });
});

describe("meta記録", () => {
  test("recordPersistResult → readPersistRecord の往復", async () => {
    await expect(readPersistRecord()).resolves.toBeUndefined();

    await recordPersistResult(true, "2026-06-01T00:00:00.000Z");
    await expect(readPersistRecord()).resolves.toEqual({
      requestedAt: "2026-06-01T00:00:00.000Z",
      granted: true,
    });

    const raw = await db.meta.get("persist");
    expect(raw).toEqual({
      key: "persist",
      value: { requestedAt: "2026-06-01T00:00:00.000Z", granted: true },
    });
  });

  test("recordRecipeExport → readRecipeExport の往復", async () => {
    await expect(readRecipeExport("rcp_1")).resolves.toBeUndefined();

    await recordRecipeExport("rcp_1", "2026-06-15T00:00:00.000Z");
    await expect(readRecipeExport("rcp_1")).resolves.toBe(
      "2026-06-15T00:00:00.000Z",
    );

    const raw = await db.meta.get("recipeExport:rcp_1");
    expect(raw).toEqual({
      key: "recipeExport:rcp_1",
      value: "2026-06-15T00:00:00.000Z",
    });
  });

  test("readAllRecipeExports はrecipeExport:プレフィックスのみ走査しrecipeId→exportedAtで返す", async () => {
    await recordRecipeExport("rcp_1", "2026-06-01T00:00:00.000Z");
    await recordRecipeExport("rcp_2", "2026-06-10T00:00:00.000Z");
    await recordPersistResult(true, "2026-06-01T00:00:00.000Z");
    await snoozeReminder("2026-06-20T00:00:00.000Z");

    await expect(readAllRecipeExports()).resolves.toEqual({
      rcp_1: "2026-06-01T00:00:00.000Z",
      rcp_2: "2026-06-10T00:00:00.000Z",
    });
  });

  test("snoozeReminder → readReminderSnooze の往復", async () => {
    await expect(readReminderSnooze()).resolves.toBeUndefined();

    await snoozeReminder("2026-07-09T00:00:00.000Z");
    await expect(readReminderSnooze()).resolves.toBe(
      "2026-07-09T00:00:00.000Z",
    );
  });
});

describe("isRecipeBackedUp", () => {
  test("エクスポート未実施はfalse", () => {
    expect(isRecipeBackedUp("2026-06-01T00:00:00.000Z", undefined)).toBe(false);
  });

  test("updatedAtがexportedAtより新しい場合はfalse", () => {
    expect(
      isRecipeBackedUp("2026-06-02T00:00:00.000Z", "2026-06-01T00:00:00.000Z"),
    ).toBe(false);
  });

  test("exportedAt === updatedAt（エクスポート直後）はtrue", () => {
    expect(
      isRecipeBackedUp("2026-06-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z"),
    ).toBe(true);
  });

  test("exportedAtがupdatedAtより新しい場合はtrue", () => {
    expect(
      isRecipeBackedUp("2026-06-01T00:00:00.000Z", "2026-06-02T00:00:00.000Z"),
    ).toBe(true);
  });

  test("オフセット付きISO（例: -05:00）が混入しても実時刻で正しく判定する", () => {
    // exportedAt="2026-05-31T20:00:00.000-05:00" は実時刻ではUTC 2026-06-01T01:00:00.000Z
    // であり updatedAt="2026-06-01T00:30:00.000Z" より新しい（＝バックアップ済みでtrue）。
    // 辞書順文字列比較では "2026-05-31T..." < "2026-06-01T..." と誤判定されfalseになってしまう
    // ケースだが、Date.getTime()比較により正しくtrueと判定される。
    expect(
      isRecipeBackedUp(
        "2026-06-01T00:30:00.000Z",
        "2026-05-31T20:00:00.000-05:00",
      ),
    ).toBe(true);
  });
});

describe("shouldShowExportReminder", () => {
  const updatedAt = "2026-06-01T00:00:00.000Z";

  test("バックアップ済み（exportedAt >= updatedAt）はfalse", () => {
    expect(
      shouldShowExportReminder({
        updatedAt,
        exportedAt: "2026-06-01T00:00:00.000Z",
        now: "2026-06-20T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  test("条件a: 一度もエクスポートなしはtrue", () => {
    expect(
      shouldShowExportReminder({
        updatedAt,
        exportedAt: undefined,
        now: "2026-06-01T00:00:01.000Z",
      }),
    ).toBe(true);
  });

  test("条件b: exportedAtからnowまでちょうど14日経過はtrue（境界含む）", () => {
    // updatedAtをexportedAtより新しくし「未バックアップ」を成立させた上でb条件を検証する
    expect(
      shouldShowExportReminder({
        updatedAt: "2026-06-02T00:00:00.000Z",
        exportedAt: "2026-06-01T00:00:00.000Z",
        now: "2026-06-15T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  test("13日23時間経過（14日未満）はfalse", () => {
    expect(
      shouldShowExportReminder({
        updatedAt: "2026-06-02T00:00:00.000Z",
        exportedAt: "2026-06-01T00:00:00.000Z",
        now: "2026-06-14T23:00:00.000Z",
      }),
    ).toBe(false);
  });

  test("エクスポート直後（未バックアップでなくなった）はfalse", () => {
    expect(
      shouldShowExportReminder({
        updatedAt: "2026-06-01T00:00:00.000Z",
        exportedAt: "2026-06-01T00:00:00.000Z",
        now: "2026-07-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  test("スヌーズ期限ちょうど（now === snoozedUntil）は抑止されない（now < snoozedUntilのみ抑止）", () => {
    expect(
      shouldShowExportReminder({
        updatedAt,
        exportedAt: undefined,
        snoozedUntil: "2026-06-10T00:00:00.000Z",
        now: "2026-06-10T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  test("スヌーズ中（now < snoozedUntil）はfalse", () => {
    expect(
      shouldShowExportReminder({
        updatedAt,
        exportedAt: undefined,
        snoozedUntil: "2026-06-10T00:00:00.000Z",
        now: "2026-06-09T23:59:59.000Z",
      }),
    ).toBe(false);
  });

  test("スヌーズ期限経過後（now > snoozedUntil）はtrue", () => {
    expect(
      shouldShowExportReminder({
        updatedAt,
        exportedAt: undefined,
        snoozedUntil: "2026-06-10T00:00:00.000Z",
        now: "2026-06-10T00:00:01.000Z",
      }),
    ).toBe(true);
  });
});

describe("shouldRequestPersist", () => {
  test("未記録はtrue", () => {
    expect(shouldRequestPersist(undefined, undefined)).toBe(true);
    expect(shouldRequestPersist(undefined, true)).toBe(true);
  });

  test("記録ありgranted=trueはfalse（persistedに関わらず再要求しない）", () => {
    expect(
      shouldRequestPersist(
        { requestedAt: "2026-06-01T00:00:00.000Z", granted: true },
        undefined,
      ),
    ).toBe(false);
    expect(
      shouldRequestPersist(
        { requestedAt: "2026-06-01T00:00:00.000Z", granted: true },
        false,
      ),
    ).toBe(false);
  });

  test("記録ありgranted=falseかつpersisted!==trueはtrue（再要求してよい）", () => {
    expect(
      shouldRequestPersist(
        { requestedAt: "2026-06-01T00:00:00.000Z", granted: false },
        false,
      ),
    ).toBe(true);
    expect(
      shouldRequestPersist(
        { requestedAt: "2026-06-01T00:00:00.000Z", granted: false },
        undefined,
      ),
    ).toBe(true);
  });

  test("記録ありgranted=falseだが現在persisted===trueはfalse（実許可済みなので要求不要）", () => {
    expect(
      shouldRequestPersist(
        { requestedAt: "2026-06-01T00:00:00.000Z", granted: false },
        true,
      ),
    ).toBe(false);
  });
});
