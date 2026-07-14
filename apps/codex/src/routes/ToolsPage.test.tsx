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
  vi,
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
import ToastHost from "../components/common/ToastHost";
import ToolsPage from "./ToolsPage";
import { downloadBlob } from "../components/common/downloadBlob";

vi.mock("../components/common/downloadBlob", async () => {
  const actual = await vi.importActual<
    typeof import("../components/common/downloadBlob")
  >("../components/common/downloadBlob");
  return {
    ...actual,
    downloadBlob: vi.fn<(blob: Blob, filename: string) => void>(),
  };
});

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

beforeEach(async () => {
  await db.userTools.clear();
  vi.mocked(downloadBlob).mockClear();
});

afterEach(() => {
  cleanup();
});

function renderToolsPage() {
  return render(
    <MemoryRouter initialEntries={["/tools"]}>
      <ToastHost>
        <ToolsPage />
      </ToastHost>
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

  test("タグ付与→Dexie userTools.tagsに反映され、除去でも反映される", async () => {
    renderToolsPage();
    await screen.findByText("ツールがまだありません");

    await addTool("筆");
    await waitFor(() => {
      expect(screen.getByText("筆")).toBeInTheDocument();
    });

    const tagInput = screen.getByLabelText("筆 にタグを追加");
    fireEvent.change(tagInput, { target: { value: "#面相" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("#面相")).toBeInTheDocument();
    });
    await waitFor(async () => {
      const stored = await db.userTools.toArray();
      expect(stored.find((tool) => tool.name === "筆")?.tags).toEqual(["面相"]);
    });

    fireEvent.click(screen.getByRole("button", { name: "面相 タグを除去 筆" }));

    await waitFor(() => {
      expect(screen.queryByText("#面相")).not.toBeInTheDocument();
    });
    await waitFor(async () => {
      const stored = await db.userTools.toArray();
      expect(stored.find((tool) => tool.name === "筆")?.tags).toEqual([]);
    });
  });

  test("エクスポートボタンでdownloadBlobが呼ばれ、Blob内容がkind/toolsを含む", async () => {
    renderToolsPage();
    await screen.findByText("ツールがまだありません");

    await addTool("筆");
    await waitFor(() => {
      expect(screen.getByText("筆")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "エクスポート" }));

    await waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledTimes(1);
    });
    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0];
    expect(filename).toBe("coat-codex-tools.json");
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.kind).toBe("tool-library");
    expect(parsed.tools).toEqual([{ name: "筆", note: null, tags: [] }]);
  });

  function selectImportFile(json: string) {
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File([json], "coat-codex-tools.json", {
      type: "application/json",
    });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
  }

  test("インポートでuserToolsに反映され、成功トーストを表示する", async () => {
    renderToolsPage();
    await screen.findByText("ツールがまだありません");

    const file = {
      app: "coat-codex",
      kind: "tool-library",
      version: 1,
      exportedAt: "2026-07-01T00:00:00.000Z",
      tools: [{ name: "エアブラシ", note: "0.3mm", tags: ["下地"] }],
    };
    selectImportFile(JSON.stringify(file));

    await waitFor(() => {
      expect(screen.getByText("エアブラシ")).toBeInTheDocument();
    });
    expect(
      await screen.findByText("1件追加・0件マージしました"),
    ).toBeInTheDocument();

    const stored = await db.userTools.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      name: "エアブラシ",
      note: "0.3mm",
      tags: ["下地"],
    });
  });

  test("不正ファイルのインポートはエラートーストを表示し、userToolsは変化しない", async () => {
    renderToolsPage();
    await screen.findByText("ツールがまだありません");

    selectImportFile("{not json");

    expect(
      await screen.findByText("インポートに失敗しました（invalid-json）"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("ツールがまだありません"),
    ).toBeInTheDocument();

    const stored = await db.userTools.toArray();
    expect(stored).toHaveLength(0);
  });
});
