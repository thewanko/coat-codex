// components/home/ImportJsonButton.test.tsx — §3.5発火点②・D-4連携の検証
// （技術計画v2.2 §3.3 HomePage・T33）

import "../../i18n";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import i18next from "../../i18n";
import ImportJsonButton from "./ImportJsonButton";
import ToastHost from "../common/ToastHost";
import { importRecipe } from "../../lib/importRecipe";
import {
  checkPersisted,
  readPersistRecord,
  recordPersistResult,
  requestPersist,
} from "../../lib/storageHealth";
import type { RecipeDoc } from "@coat-codex/recipe-core";

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
  const readPersistRecordMock = vi.fn();
  const checkPersistedMock = vi.fn();
  const requestPersistMock = vi.fn();
  const recordPersistResultMock = vi.fn().mockResolvedValue(undefined);
  return {
    ...actual,
    readPersistRecord: readPersistRecordMock,
    checkPersisted: checkPersistedMock,
    requestPersist: requestPersistMock,
    recordPersistResult: recordPersistResultMock,
    // ensurePersistRequested（storageHealth.ts内の合成関数）はモジュール内部から直接
    // readPersistRecord等を呼ぶため、上記の個別モックへ差し替わらない（ESMの制約）。
    // ここで同じロジックをモック関数群の合成として再実装し、既存の呼び出しアサーション
    // （requestPersist/recordPersistResultの検証）を変更せずに済ませる。
    ensurePersistRequested: vi.fn(async () => {
      const [record, persisted] = await Promise.all([
        readPersistRecordMock(),
        checkPersistedMock(),
      ]);
      if (!actual.shouldRequestPersist(record, persisted)) {
        return;
      }
      const granted = await requestPersistMock();
      if (granted === undefined) {
        return;
      }
      await recordPersistResultMock(granted, new Date().toISOString());
    }),
  };
});

function makeImportedRecipe(): RecipeDoc {
  return {
    schemaVersion: 3,
    id: "rcp_imported",
    title: "インポートされたレシピ",
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    source: null,
  };
}

function renderButton() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ToastHost>
        <Routes>
          <Route path="/" element={<ImportJsonButton />} />
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

describe("ImportJsonButton", () => {
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

  test("既定ラベルは「JSONをインポート」", () => {
    renderButton();
    expect(
      screen.getByRole("button", { name: "JSONをインポート" }),
    ).toBeInTheDocument();
  });

  test("ボタンクリックで隠しファイル入力のclick()が発火する", () => {
    renderButton();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: "JSONをインポート" }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test("ファイル選択確定でstorage.persist()が要求される（§3.5発火点②）", async () => {
    vi.mocked(importRecipe).mockResolvedValue({
      ok: true,
      recipe: makeImportedRecipe(),
    });

    renderButton();
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

  test("meta.persistが既に許可済みの場合は再要求しない", async () => {
    vi.mocked(readPersistRecord).mockResolvedValue({
      requestedAt: "2026-06-01T00:00:00.000Z",
      granted: true,
    });
    vi.mocked(importRecipe).mockResolvedValue({
      ok: true,
      recipe: makeImportedRecipe(),
    });

    renderButton();
    selectFile('{"app":"coat-codex"}');

    await waitFor(() => {
      expect(importRecipe).toHaveBeenCalled();
    });
    expect(requestPersist).not.toHaveBeenCalled();
  });

  test("インポート成功時: トースト表示＋当該レシピのOverviewへ遷移する", async () => {
    vi.mocked(importRecipe).mockResolvedValue({
      ok: true,
      recipe: makeImportedRecipe(),
    });

    renderButton();
    selectFile('{"app":"coat-codex"}');

    await waitFor(() => {
      expect(screen.getByText("overview page")).toBeInTheDocument();
    });
  });

  test("インポート失敗時: ImportErrorDialogが要約メッセージとissue一覧付きで開く", async () => {
    vi.mocked(importRecipe).mockResolvedValue({
      ok: false,
      reason: "invalid-schema",
      message: "レシピデータの検証に失敗しました",
      issues: [{ path: ["recipe", "title"], message: "必須項目です" }],
    });

    renderButton();
    selectFile('{"app":"coat-codex"}');

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(
      screen.getByText("レシピデータの検証に失敗しました"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("import-error-issues")).toHaveTextContent(
      "必須項目です",
    );
  });

  test("インポート失敗時、Overviewへは遷移しない", async () => {
    vi.mocked(importRecipe).mockResolvedValue({
      ok: false,
      reason: "invalid-json",
      message: "JSONファイルとして不正です",
      issues: [],
    });

    renderButton();
    selectFile("not json");

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.queryByText("overview page")).not.toBeInTheDocument();
  });

  test("ImportErrorDialogを閉じるとエラー状態がクリアされる", async () => {
    vi.mocked(importRecipe).mockResolvedValue({
      ok: false,
      reason: "invalid-json",
      message: "JSONファイルとして不正です",
      issues: [],
    });

    renderButton();
    selectFile("not json");

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
