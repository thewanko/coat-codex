// routes/ToolsPage.test.tsx — ツールライブラリ管理画面（技術計画v2.6 §2.8/§3.3 T52）
//
// fake-indexeddbでグローバルのindexedDBをポリフィルし、Dexie(db.ts)を実DBのように動作させる
// （db/toolStore.test.tsパターン）。

import "fake-indexeddb/auto";
import "../i18n";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import {
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../i18n";
import { db } from "../db/db";
import ToolsPage from "./ToolsPage";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

beforeEach(async () => {
  await db.userTools.clear();
});

afterEach(() => {
  cleanup();
});

function renderToolsPage() {
  return render(
    <MemoryRouter initialEntries={["/tools"]}>
      <ToolsPage />
    </MemoryRouter>,
  );
}

async function addTool(name: string) {
  const input = screen.getByPlaceholderText("ツール名を入力");
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "追加" }));
  await waitFor(() => {
    expect(input).toHaveValue("");
  });
}

describe("ToolsPage", () => {
  test("0件時はEmptyStateを表示する", async () => {
    renderToolsPage();

    expect(
      await screen.findByText("ツールがまだありません"),
    ).toBeInTheDocument();
  });

  test("追加するとname昇順で一覧に反映される", async () => {
    renderToolsPage();
    await screen.findByText("ツールがまだありません");

    await addTool("筆");
    await waitFor(() => {
      expect(screen.getByText("筆")).toBeInTheDocument();
    });

    await addTool("エアブラシ");
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    const names = screen
      .getAllByRole("listitem")
      .map((item) => item.textContent?.replace("✕", "").trim() ?? "");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test("重複追加（大文字小文字違い含む）は行数を増やさずエラー表示もしない", async () => {
    renderToolsPage();
    await screen.findByText("ツールがまだありません");

    await addTool("Brush");
    await waitFor(() => {
      expect(screen.getByText("Brush")).toBeInTheDocument();
    });

    await addTool("brush");
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("削除✕→ConfirmDialogのキャンセルで一覧は変化せず、確定で行が消える", async () => {
    renderToolsPage();
    await screen.findByText("ツールがまだありません");

    await addTool("スポンジ");
    await waitFor(() => {
      expect(screen.getByText("スポンジ")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "削除 スポンジ" }));

    expect(
      screen.getByRole("dialog", { name: "「スポンジ」を削除しますか？" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.getByText("スポンジ")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "削除 スポンジ" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => {
      expect(screen.queryByText("スポンジ")).not.toBeInTheDocument();
    });
    expect(
      await screen.findByText("ツールがまだありません"),
    ).toBeInTheDocument();
  });
});
