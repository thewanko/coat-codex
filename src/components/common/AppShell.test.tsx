// components/common/AppShell.test.tsx — pagehide時のflushAutosave結線テスト
// （M4 Opusレビュー Round1 Medium対応。タブクローズ直前のpending autosave損失防止）

import "../../i18n";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../../i18n";
import { useRecipeStore } from "../../stores/useRecipeStore";
import {
  checkPersisted,
  readPersistRecord,
  recordPersistResult,
} from "../../lib/storageHealth";
import AppShell from "./AppShell";

// 起動時persisted()再確認（T34）がlib/storageHealth経由でDexie(meta)を読むため、
// fake-indexeddb非依存のこのテストではAPI非対応環境相当（undefined）にモックする。
vi.mock("../../lib/storageHealth", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/storageHealth")
  >("../../lib/storageHealth");
  return {
    ...actual,
    checkPersisted: vi.fn().mockResolvedValue(undefined),
    readPersistRecord: vi.fn().mockResolvedValue(undefined),
    recordPersistResult: vi.fn().mockResolvedValue(undefined),
  };
});

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.mocked(checkPersisted).mockReset().mockResolvedValue(undefined);
  vi.mocked(readPersistRecord).mockReset().mockResolvedValue(undefined);
  vi.mocked(recordPersistResult).mockReset().mockResolvedValue(undefined);
});

describe("AppShell — pagehideでのautosave flush", () => {
  test("pagehideイベントでflushAutosaveが呼ばれる", () => {
    const flushSpy = vi
      .spyOn(useRecipeStore.getState(), "flushAutosave")
      .mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <AppShell>{null}</AppShell>
      </MemoryRouter>,
    );

    window.dispatchEvent(new Event("pagehide"));

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  test("アンマウント後はpagehideを発火してもflushAutosaveが呼ばれない", () => {
    const flushSpy = vi
      .spyOn(useRecipeStore.getState(), "flushAutosave")
      .mockResolvedValue(undefined);

    const { unmount } = render(
      <MemoryRouter>
        <AppShell>{null}</AppShell>
      </MemoryRouter>,
    );
    unmount();

    window.dispatchEvent(new Event("pagehide"));

    expect(flushSpy).not.toHaveBeenCalled();
  });
});

describe("AppShell — ワードマークのHomeリンク化", () => {
  test("ワードマークが/へのリンクになっている", () => {
    render(
      <MemoryRouter>
        <AppShell>{null}</AppShell>
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: /Coat Codex/ });
    expect(link).toHaveAttribute("href", "/");
  });
});

describe("AppShell — 起動時persisted()再確認（§3.5）", () => {
  test("persisted()がAPI非対応（undefined）の場合はmeta.persistを更新しない", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <AppShell>{null}</AppShell>
      </MemoryRouter>,
    );

    await vi.waitFor(() => {
      expect(checkPersisted).toHaveBeenCalledTimes(1);
    });
    expect(recordPersistResult).not.toHaveBeenCalled();
  });

  test("meta.persist未記録（persist未要求）の場合は記録しない — 架空のrequestedAtを作らない（§3.5）", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(true);
    vi.mocked(readPersistRecord).mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <AppShell>{null}</AppShell>
      </MemoryRouter>,
    );

    await vi.waitFor(() => {
      expect(checkPersisted).toHaveBeenCalledTimes(1);
    });
    expect(recordPersistResult).not.toHaveBeenCalled();
  });

  test("meta.persistの記録と実許可状態が一致する場合は再記録しない", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(true);
    vi.mocked(readPersistRecord).mockResolvedValue({
      requestedAt: "2026-06-01T00:00:00.000Z",
      granted: true,
    });

    render(
      <MemoryRouter>
        <AppShell>{null}</AppShell>
      </MemoryRouter>,
    );

    await vi.waitFor(() => {
      expect(checkPersisted).toHaveBeenCalledTimes(1);
    });
    expect(recordPersistResult).not.toHaveBeenCalled();
  });

  test("meta.persistの記録（granted:false）と実許可状態（true）が食い違う場合は更新する", async () => {
    vi.mocked(checkPersisted).mockResolvedValue(true);
    vi.mocked(readPersistRecord).mockResolvedValue({
      requestedAt: "2026-06-01T00:00:00.000Z",
      granted: false,
    });

    render(
      <MemoryRouter>
        <AppShell>{null}</AppShell>
      </MemoryRouter>,
    );

    await vi.waitFor(() => {
      expect(recordPersistResult).toHaveBeenCalledWith(
        true,
        expect.any(String),
      );
    });
  });
});
