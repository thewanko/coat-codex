// components/setup/ImportJsonSection.test.tsx — §3.5発火点③・D-4連携の検証
// （技術計画v2.2 §4.2 T23。結線T33）

import "../../i18n";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import i18next from "../../i18n";
import ImportJsonSection from "./ImportJsonSection";
import ToastHost from "../common/ToastHost";
import { importRecipe } from "../../lib/importRecipe";
import {
  checkPersisted,
  readPersistRecord,
  recordPersistResult,
  requestPersist,
} from "../../lib/storageHealth";
import type { RecipeDoc } from "../../models/recipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../../lib/importRecipe", async () => {
  const actual = await vi.importActual<typeof import("../../lib/importRecipe")>(
    "../../lib/importRecipe",
  );
  return {
    ...actual,
    importRecipe: vi.fn(),
  };
});

vi.mock("../../lib/storageHealth", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/storageHealth")
  >("../../lib/storageHealth");
  return {
    ...actual,
    readPersistRecord: vi.fn(),
    checkPersisted: vi.fn(),
    requestPersist: vi.fn(),
    recordPersistResult: vi.fn().mockResolvedValue(undefined),
  };
});

function makeImportedRecipe(): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_imported",
    title: "インポートされたレシピ",
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
  };
}

function renderSection() {
  return render(
    <MemoryRouter initialEntries={["/recipe/rcp_1/setup"]}>
      <ToastHost>
        <Routes>
          <Route path="/recipe/:id/setup" element={<ImportJsonSection />} />
          <Route path="/recipe/:id" element={<div>overview page</div>} />
        </Routes>
      </ToastHost>
    </MemoryRouter>,
  );
}

function selectFile(json: string) {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File([json], "recipe.json", { type: "application/json" });
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
}

describe("ImportJsonSection", () => {
  beforeEach(() => {
    vi.mocked(importRecipe).mockReset();
    vi.mocked(readPersistRecord).mockReset();
    vi.mocked(checkPersisted).mockReset();
    vi.mocked(requestPersist).mockReset();
    vi.mocked(recordPersistResult).mockClear();

    vi.mocked(readPersistRecord).mockResolvedValue(undefined);
    vi.mocked(checkPersisted).mockResolvedValue(undefined);
    vi.mocked(requestPersist).mockResolvedValue(true);
  });

  test("破線カード（PC）: 「または」ディバイダ・タイトル・説明・ファイル選択ボタンが表示される（結線後はenabled）", () => {
    renderSection();

    expect(screen.getByText("または")).toBeInTheDocument();
    expect(screen.getByText("JSONインポートで再開")).toBeInTheDocument();
    expect(
      screen.getByText("以前エクスポートした .json からこの秘伝書を復元します"),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "ファイルを選択" });
    expect(button).not.toBeDisabled();
  });

  test("コンパクトボタン（モバイル）: 「↑ JSONインポートで再開」が表示される（結線後はenabled）", () => {
    renderSection();

    const compactButton = screen.getByRole("button", {
      name: "↑ JSONインポートで再開",
    });
    expect(compactButton).not.toBeDisabled();
  });

  test("ファイル選択確定でstorage.persist()が要求される（§3.5発火点③）", async () => {
    vi.mocked(importRecipe).mockResolvedValue({
      ok: true,
      recipe: makeImportedRecipe(),
    });

    renderSection();
    selectFile('{"app":"coat-codex"}');

    await waitFor(() => {
      expect(requestPersist).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(recordPersistResult).toHaveBeenCalledWith(
        true,
        expect.any(String),
      );
    });
  });

  test("インポート成功時: 当該レシピのOverviewへ遷移する", async () => {
    vi.mocked(importRecipe).mockResolvedValue({
      ok: true,
      recipe: makeImportedRecipe(),
    });

    renderSection();
    selectFile('{"app":"coat-codex"}');

    await waitFor(() => {
      expect(screen.getByText("overview page")).toBeInTheDocument();
    });
  });

  test("インポート失敗時: ImportErrorDialogがissue一覧付きで開く", async () => {
    vi.mocked(importRecipe).mockResolvedValue({
      ok: false,
      reason: "invalid-schema",
      message: "レシピデータの検証に失敗しました",
      issues: [{ path: ["recipe", "title"], message: "必須項目です" }],
    });

    renderSection();
    selectFile('{"app":"coat-codex"}');

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByTestId("import-error-issues")).toHaveTextContent(
      "必須項目です",
    );
  });
});
