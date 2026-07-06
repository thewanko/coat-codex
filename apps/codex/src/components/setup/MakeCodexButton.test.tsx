// components/setup/MakeCodexButton.test.tsx — 純粋なナビゲーションのみを検証する
// （技術計画v2.2 §4.2 T23: persist()要求はここでは行わない）。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import i18next from "../../i18n";
import MakeCodexButton from "./MakeCodexButton";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

describe("MakeCodexButton", () => {
  test("クリックで/recipe/:idへ遷移する（persist()は呼ばない）", () => {
    const persistSpy = vi.fn();
    Object.defineProperty(navigator, "storage", {
      value: { persist: persistSpy },
      configurable: true,
    });

    render(
      <MemoryRouter initialEntries={["/recipe/rcp_1/setup"]}>
        <Routes>
          <Route
            path="/recipe/:id/setup"
            element={<MakeCodexButton recipeId="rcp_1" />}
          />
          <Route path="/recipe/:id" element={<div>Overview画面</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("make codex!"));

    expect(screen.getByText("Overview画面")).toBeInTheDocument();
    expect(persistSpy).not.toHaveBeenCalled();
  });
});
