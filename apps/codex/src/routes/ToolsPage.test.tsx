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
import { createDraft, saveRecipe } from "../db/recipeStore";
import { registerUserTool } from "../db/toolStore";
import type { Tool } from "@coat-codex/recipe-core";

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
  await db.recipes.clear();
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

/** レシピを作成しdoc.toolsを差し替えて保存する（recipeStore.test.tsのcreateDraft/saveRecipe流儀） */
async function createRecipeWithTools(
  title: string,
  tools: Tool[],
): Promise<void> {
  const draft = await createDraft(title);
  await saveRecipe({ ...draft, tools });
}

function makeTool(id: string, name: string, note: string | null): Tool {
  return { id, name, note };
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

  describe("レシピから取り込む（T59・§2.8一括移行）", () => {
    test("複数レシピ横断でdoc.toolsを重複排除して取り込み、トースト件数と一致する", async () => {
      await createRecipeWithTools("レシピA", [
        makeTool("tool_a1", "筆", "細筆"),
        makeTool("tool_a2", "スポンジ", null),
      ]);
      await createRecipeWithTools("レシピB", [
        makeTool("tool_b1", "筆", "細筆"),
        makeTool("tool_b2", "エアブラシ", "0.3mm"),
      ]);

      renderToolsPage();
      await screen.findByText("ツールがまだありません");

      fireEvent.click(
        screen.getByRole("button", { name: "レシピから取り込む" }),
      );

      expect(
        await screen.findByText("3件追加・0件マージしました"),
      ).toBeInTheDocument();

      const stored = await db.userTools.toArray();
      expect(stored.map((tool) => tool.name).sort()).toEqual(
        ["エアブラシ", "スポンジ", "筆"].sort(),
      );
    });

    test("既存ライブラリに同名（大小違い）＋タグ付きがある場合はタグを温存しnoteをnull時のみ補完してマージ扱いになる", async () => {
      await registerUserTool({ name: "Brush", tags: ["面相"] });
      await createRecipeWithTools("レシピA", [
        makeTool("tool_a1", "brush", "細筆"),
      ]);

      renderToolsPage();
      await waitFor(() => {
        expect(screen.getByText("Brush")).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByRole("button", { name: "レシピから取り込む" }),
      );

      expect(
        await screen.findByText("0件追加・1件マージしました"),
      ).toBeInTheDocument();

      const stored = await db.userTools.toArray();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        name: "Brush",
        note: "細筆",
        tags: ["面相"],
      });
    });

    test("レシピ0件（doc.tools全空）は0件追加・0件マージのトーストを表示しuserToolsは不変", async () => {
      await createRecipeWithTools("レシピA", []);

      renderToolsPage();
      await screen.findByText("ツールがまだありません");

      fireEvent.click(
        screen.getByRole("button", { name: "レシピから取り込む" }),
      );

      expect(
        await screen.findByText("0件追加・0件マージしました"),
      ).toBeInTheDocument();

      const stored = await db.userTools.toArray();
      expect(stored).toHaveLength(0);
    });

    test("再実行しても冪等（2回目は0件追加・件数不変のNマージ）", async () => {
      await createRecipeWithTools("レシピA", [
        makeTool("tool_a1", "筆", null),
        makeTool("tool_a2", "スポンジ", null),
      ]);

      renderToolsPage();
      await screen.findByText("ツールがまだありません");

      const importButton = screen.getByRole("button", {
        name: "レシピから取り込む",
      });
      fireEvent.click(importButton);
      expect(
        await screen.findByText("2件追加・0件マージしました"),
      ).toBeInTheDocument();

      const afterFirst = await db.userTools.toArray();
      expect(afterFirst).toHaveLength(2);

      fireEvent.click(importButton);
      expect(
        await screen.findByText("0件追加・2件マージしました"),
      ).toBeInTheDocument();

      const afterSecond = await db.userTools.toArray();
      expect(afterSecond).toHaveLength(2);
      expect(afterSecond.map((tool) => tool.name).sort()).toEqual(
        afterFirst.map((tool) => tool.name).sort(),
      );
    });
  });
});
