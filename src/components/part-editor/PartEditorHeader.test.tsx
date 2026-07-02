// components/part-editor/PartEditorHeader.test.tsx — 通常/baseモードの出し分けテスト
// （技術計画v2.2 §4.2 T27）

import "../../i18n";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../../i18n";
import PartEditorHeader from "./PartEditorHeader";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../db/photoStore", () => ({
  resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
}));

import { resolvePhotoUrl } from "../../db/photoStore";

beforeEach(() => {
  vi.mocked(resolvePhotoUrl).mockClear();
});

function renderHeader(props: Partial<Parameters<typeof PartEditorHeader>[0]>) {
  return render(
    <MemoryRouter>
      <PartEditorHeader isBaseMode={false} recipeId="rcp_1" {...props} />
    </MemoryRouter>,
  );
}

describe("PartEditorHeader — 通常モード", () => {
  test("パーツ名の編集入力のみが表示され、blurでonPartNameCommitが呼ばれる", () => {
    const onPartNameCommit = vi.fn();
    renderHeader({ partName: "腕", onPartNameCommit });

    const input = screen.getByRole("textbox", { name: "パーツ名" });
    expect(input).toHaveValue("腕");
    expect(screen.queryByText("ベース工程（全体）")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "右腕" } });
    fireEvent.blur(input);

    expect(onPartNameCommit).toHaveBeenCalledWith("右腕");
  });

  test("空文字でblurした場合はonPartNameCommitを呼ばず元の値へ戻す", () => {
    const onPartNameCommit = vi.fn();
    renderHeader({ partName: "腕", onPartNameCommit });

    const input = screen.getByRole("textbox", { name: "パーツ名" });
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.blur(input);

    expect(onPartNameCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("腕");
  });
});

describe("PartEditorHeader — baseモード", () => {
  test("固定見出しと読み取り専用サムネ・Setupリンクが表示される（パーツ名入力はない）", async () => {
    renderHeader({ isBaseMode: true, representativePhotoId: "pht_1" });

    expect(screen.getByText("ベース工程（全体）")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "パーツ名" }),
    ).not.toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: "全体写真の編集はSetupで ›",
    });
    expect(link).toHaveAttribute("href", "/recipe/rcp_1/setup");

    await waitFor(() => {
      expect(resolvePhotoUrl).toHaveBeenCalledWith("pht_1");
    });
  });

  test("代表写真が未設定（null）の場合はresolvePhotoUrlを呼ばずプレースホルダを表示する", () => {
    renderHeader({ isBaseMode: true, representativePhotoId: null });

    expect(resolvePhotoUrl).not.toHaveBeenCalled();
    expect(screen.getByText("ベース工程（全体）")).toBeInTheDocument();
  });
});
