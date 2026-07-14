// routes/UpdatesPage.test.tsx — 更新履歴ページの主要要素描画確認
// （技術計画v2.9 §3.1/§3.3/§4.2 T67）

import "../i18n";
import { beforeAll, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../i18n";
import UpdatesPage from "./UpdatesPage";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

function renderUpdates() {
  return render(
    <MemoryRouter initialEntries={["/updates"]}>
      <UpdatesPage />
    </MemoryRouter>,
  );
}

describe("UpdatesPage", () => {
  test("ページ見出しを表示する", () => {
    renderUpdates();

    expect(
      screen.getByRole("heading", { name: "UPDATES" }),
    ).toBeInTheDocument();
  });

  test("エントリを5件、日付と見出し付きで表示する", () => {
    renderUpdates();

    expect(
      screen.getByRole("heading", {
        name: "ツールライブラリ関連の使い勝手改善",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "工程エディタとツールライブラリの連携",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "ツールライブラリ登場" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "パーツの削除に対応" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "公開・共有機能" }),
    ).toBeInTheDocument();

    expect(screen.getAllByText("2026-07-14")).toHaveLength(4);
    expect(screen.getByText("2026年7月上旬")).toBeInTheDocument();
  });

  test("ホームへ戻る導線を表示する", () => {
    renderUpdates();

    expect(screen.getByRole("link", { name: "レシピ一覧へ" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
