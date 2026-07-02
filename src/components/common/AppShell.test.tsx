// components/common/AppShell.test.tsx — pagehide時のflushAutosave結線テスト
// （M4 Opusレビュー Round1 Medium対応。タブクローズ直前のpending autosave損失防止）

import "../../i18n";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../../i18n";
import { useRecipeStore } from "../../stores/useRecipeStore";
import AppShell from "./AppShell";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
