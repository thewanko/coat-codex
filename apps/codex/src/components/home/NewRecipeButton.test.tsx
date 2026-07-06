import "../../i18n";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import i18next from "../../i18n";
import NewRecipeButton from "./NewRecipeButton";
import { createDraft } from "../../db/recipeStore";
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

vi.mock("../../db/recipeStore", async () => {
  const actual = await vi.importActual<typeof import("../../db/recipeStore")>(
    "../../db/recipeStore",
  );
  return {
    ...actual,
    createDraft: vi.fn(),
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

function makeDraft(): RecipeDoc {
  return {
    schemaVersion: 3,
    id: "rcp_new",
    title: "無題のレシピ",
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

function renderButton(label?: string) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<NewRecipeButton label={label} />} />
        <Route path="/recipe/:id/setup" element={<div>setup page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NewRecipeButton", () => {
  beforeEach(() => {
    vi.mocked(createDraft).mockReset();
    vi.mocked(readPersistRecord).mockReset();
    vi.mocked(checkPersisted).mockReset();
    vi.mocked(requestPersist).mockReset();
    vi.mocked(recordPersistResult).mockClear();

    vi.mocked(readPersistRecord).mockResolvedValue(undefined);
    vi.mocked(checkPersisted).mockResolvedValue(undefined);
    vi.mocked(requestPersist).mockResolvedValue(true);
  });

  test("既定ラベルは「新規作成」", () => {
    renderButton();
    expect(
      screen.getByRole("button", { name: "新規作成" }),
    ).toBeInTheDocument();
  });

  test("labelプロパティでボタン文言を上書きできる（EmptyState用）", () => {
    renderButton("最初の秘伝書を作る");
    expect(
      screen.getByRole("button", { name: "最初の秘伝書を作る" }),
    ).toBeInTheDocument();
  });

  test("クリックでcreateDraftにi18n解決済み既定名（D-8）を渡し、/recipe/:id/setupへ遷移する", async () => {
    vi.mocked(createDraft).mockResolvedValue(makeDraft());

    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "新規作成" }));

    await waitFor(() => {
      expect(createDraft).toHaveBeenCalledWith("無題のレシピ");
    });
    await waitFor(() => {
      expect(screen.getByText("setup page")).toBeInTheDocument();
    });
  });

  test("meta.persist未記録の場合、クリックでrequestPersist→recordPersistResultが呼ばれる（§3.5発火点①）", async () => {
    vi.mocked(createDraft).mockResolvedValue(makeDraft());

    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "新規作成" }));

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

  test("meta.persistがgranted=trueで既に記録済みの場合はrequestPersistを呼ばない（再要求しない）", async () => {
    vi.mocked(readPersistRecord).mockResolvedValue({
      requestedAt: "2026-06-01T00:00:00.000Z",
      granted: true,
    });
    vi.mocked(createDraft).mockResolvedValue(makeDraft());

    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "新規作成" }));

    await waitFor(() => {
      expect(createDraft).toHaveBeenCalled();
    });
    expect(requestPersist).not.toHaveBeenCalled();
  });
});
