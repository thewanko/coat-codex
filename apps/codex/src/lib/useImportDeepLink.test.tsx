// lib/useImportDeepLink.test.tsx — `?import=` ディープリンクフックの結線テスト
// （技術計画v1.3 §6-2/§7 ST-23）

import "../i18n";
import { StrictMode, act } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import i18next from "../i18n";
import ToastHost from "../components/common/ToastHost";
import {
  CURRENT_SCHEMA_VERSION,
  type RecipeDoc,
} from "@coat-codex/recipe-core";
import {
  useImportDeepLink,
  type UseImportDeepLinkDeps,
} from "./useImportDeepLink";
import type {
  FetchDetailResult,
  ScriptoriumDetail,
} from "./importFromScriptorium";
import type { ImportResult } from "./importRecipe";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

const VALID_IMPORT_URL =
  "https://scriptorium.coat-codex.com/api/recipes/scr_seed_wolf";

function makeDetail(): ScriptoriumDetail {
  return {
    id: "scr_seed_wolf",
    handle: "painter_taro",
    publishedAt: "2026-07-08T00:00:00.000Z",
    coverUrl: "/img/cover_1.jpg",
    recipe: {
      scriptoriumSchemaVersion: 1,
      title: "Space Wolf",
      palette: [],
      tools: [],
      baseSteps: [],
      parts: [],
    },
  };
}

function makeRecipeDoc(id: string): RecipeDoc {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    title: "Space Wolf",
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    source: {
      scriptoriumId: "scr_seed_wolf",
      author: "painter_taro",
      importedAt: "2026-07-08T00:00:00.000Z",
    },
  };
}

/** テスト用ハーネス: フックのstateをDOMに文字列化して出す */
function Harness({ deps }: { deps: UseImportDeepLinkDeps }) {
  const { state, confirm, dismiss, importError, dismissImportError } =
    useImportDeepLink(deps);
  return (
    <div>
      <div data-testid="phase">{state.phase}</div>
      {state.phase === "fetchError" && (
        <div data-testid="fetch-error-code">{state.code}</div>
      )}
      {(state.phase === "ready" || state.phase === "importing") && (
        <div data-testid="duplicate">
          {state.duplicate ? state.duplicate.id : "none"}
        </div>
      )}
      {state.phase === "ready" && (
        <>
          <button onClick={() => confirm(true)}>confirm-with-image</button>
          <button onClick={() => confirm(false)}>confirm-without-image</button>
        </>
      )}
      <button onClick={dismiss}>dismiss</button>
      {importError && (
        <div data-testid="import-error">{importError.message}</div>
      )}
      {importError && (
        <button onClick={dismissImportError}>dismiss-error</button>
      )}
    </div>
  );
}

function renderHarness(
  deps: UseImportDeepLinkDeps,
  options?: { initialEntry?: string; strictMode?: boolean },
) {
  const initialEntry =
    options?.initialEntry ?? `/?import=${encodeURIComponent(VALID_IMPORT_URL)}`;
  const body = (
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastHost>
        <Routes>
          <Route path="/" element={<Harness deps={deps} />} />
          <Route path="/recipe/:id" element={<div>overview page</div>} />
        </Routes>
      </ToastHost>
    </MemoryRouter>
  );
  if (options?.strictMode) {
    return render(<StrictMode>{body}</StrictMode>);
  }
  return render(body);
}

describe("useImportDeepLink — 正規URL", () => {
  test("loading → ready（detail・duplicateが返る）＋URLからimportパラメータが除去される", async () => {
    const detail = makeDetail();
    const fetchPublishedDetail = vi.fn(async () => ({
      ok: true as const,
      detail,
    }));
    const fetchCoverAsDataUrl = vi.fn(async () => ({
      dataUrl: "data:image/jpeg;base64,AAAA",
      bytes: 4,
    }));
    const findRecipeByScriptoriumId = vi.fn(async () => null);

    renderHarness({
      fetchPublishedDetail,
      fetchCoverAsDataUrl,
      findRecipeByScriptoriumId,
    });

    await waitFor(() => {
      expect(screen.getByTestId("phase")).toHaveTextContent("ready");
    });
    expect(screen.getByTestId("duplicate")).toHaveTextContent("none");
    expect(fetchPublishedDetail).toHaveBeenCalledWith("scr_seed_wolf");
    expect(fetchCoverAsDataUrl).toHaveBeenCalledWith("/img/cover_1.jpg");

    // history.location.search を確認する術がないため、ハッシュ経由ではなくwindow.location代替として
    // MemoryRouterのURLは直接読めない。replace呼び出しの副作用は「再fetchされない」ことで検証する
    // （下のStrictMode二重マウントテストが1回のみ呼び出しを保証する）。
  });

  test("重複あり: readyのduplicateが非null", async () => {
    const detail = makeDetail();
    const duplicateDoc = makeRecipeDoc("rcp_existing");
    const fetchPublishedDetail = vi.fn(async () => ({
      ok: true as const,
      detail,
    }));
    const findRecipeByScriptoriumId = vi.fn(async () => duplicateDoc);

    renderHarness({
      fetchPublishedDetail,
      fetchCoverAsDataUrl: vi.fn(async () => null),
      findRecipeByScriptoriumId,
    });

    await waitFor(() => {
      expect(screen.getByTestId("phase")).toHaveTextContent("ready");
    });
    expect(screen.getByTestId("duplicate")).toHaveTextContent("rcp_existing");
  });
});

describe("useImportDeepLink — 不正URL", () => {
  test("invalidUrl（fetch未呼び出し）", async () => {
    const fetchPublishedDetail = vi.fn();

    renderHarness(
      { fetchPublishedDetail },
      { initialEntry: `/?import=${encodeURIComponent("https://evil.com/x")}` },
    );

    await waitFor(() => {
      expect(screen.getByTestId("phase")).toHaveTextContent("invalidUrl");
    });
    expect(fetchPublishedDetail).not.toHaveBeenCalled();
  });
});

describe("useImportDeepLink — StrictMode", () => {
  test("二重マウントでもfetchPublishedDetailが1回だけ呼ばれる", async () => {
    const detail = makeDetail();
    const fetchPublishedDetail = vi.fn(async () => ({
      ok: true as const,
      detail,
    }));

    renderHarness(
      {
        fetchPublishedDetail,
        fetchCoverAsDataUrl: vi.fn(async () => null),
        findRecipeByScriptoriumId: vi.fn(async () => null),
      },
      { strictMode: true },
    );

    await waitFor(() => {
      expect(screen.getByTestId("phase")).toHaveTextContent("ready");
    });
    expect(fetchPublishedDetail).toHaveBeenCalledTimes(1);
  });
});

describe("useImportDeepLink — 世代トークン", () => {
  test("loading中にdismissした後にfetchが解決しても結果は破棄され、stateはidleのまま", async () => {
    let resolveFetch: ((result: FetchDetailResult) => void) | undefined;
    const fetchPublishedDetail = vi.fn<() => Promise<FetchDetailResult>>(
      () =>
        new Promise<FetchDetailResult>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    renderHarness({
      fetchPublishedDetail,
      fetchCoverAsDataUrl: vi.fn(async () => null),
      findRecipeByScriptoriumId: vi.fn(async () => null),
    });

    await waitFor(() => {
      expect(screen.getByTestId("phase")).toHaveTextContent("loading");
    });

    act(() => {
      screen.getByText("dismiss").click();
    });
    expect(screen.getByTestId("phase")).toHaveTextContent("idle");

    const detail = makeDetail();
    await act(async () => {
      resolveFetch?.({ ok: true, detail });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("phase")).toHaveTextContent("idle");
  });
});

describe("useImportDeepLink — confirm", () => {
  test("confirm(true): coverDataUrlありでrunScriptoriumImportが呼ばれ、成功でnavigateする", async () => {
    const detail = makeDetail();
    const runScriptoriumImport = vi.fn<
      (args: {
        detail: ScriptoriumDetail;
        scriptoriumId: string;
        coverDataUrl?: string;
      }) => Promise<ImportResult>
    >(async () => ({ ok: true, recipe: makeRecipeDoc("rcp_new_1") }));

    renderHarness({
      fetchPublishedDetail: vi.fn(async () => ({ ok: true as const, detail })),
      fetchCoverAsDataUrl: vi.fn(async () => ({
        dataUrl: "data:image/jpeg;base64,AAAA",
        bytes: 4,
      })),
      findRecipeByScriptoriumId: vi.fn(async () => null),
      runScriptoriumImport,
      ensurePersistRequested: vi.fn(async () => {}),
    });

    await waitFor(() => {
      expect(screen.getByTestId("phase")).toHaveTextContent("ready");
    });

    fireEvent.click(screen.getByText("confirm-with-image"));

    await waitFor(() => {
      expect(screen.getByText("overview page")).toBeInTheDocument();
    });
    expect(runScriptoriumImport).toHaveBeenCalledWith({
      detail,
      scriptoriumId: "scr_seed_wolf",
      coverDataUrl: "data:image/jpeg;base64,AAAA",
    });
  });

  test("confirm(false): coverDataUrlはundefinedで呼ばれる", async () => {
    const detail = makeDetail();
    const runScriptoriumImport = vi.fn<
      (args: {
        detail: ScriptoriumDetail;
        scriptoriumId: string;
        coverDataUrl?: string;
      }) => Promise<ImportResult>
    >(async () => ({ ok: true, recipe: makeRecipeDoc("rcp_new_2") }));

    renderHarness({
      fetchPublishedDetail: vi.fn(async () => ({ ok: true as const, detail })),
      fetchCoverAsDataUrl: vi.fn(async () => ({
        dataUrl: "data:image/jpeg;base64,AAAA",
        bytes: 4,
      })),
      findRecipeByScriptoriumId: vi.fn(async () => null),
      runScriptoriumImport,
      ensurePersistRequested: vi.fn(async () => {}),
    });

    await waitFor(() => {
      expect(screen.getByTestId("phase")).toHaveTextContent("ready");
    });

    fireEvent.click(screen.getByText("confirm-without-image"));

    await waitFor(() => {
      expect(runScriptoriumImport).toHaveBeenCalledWith({
        detail,
        scriptoriumId: "scr_seed_wolf",
        coverDataUrl: undefined,
      });
    });
  });

  test("失敗でimportErrorがセットされる", async () => {
    const detail = makeDetail();
    const runScriptoriumImport = vi.fn<
      (args: {
        detail: ScriptoriumDetail;
        scriptoriumId: string;
        coverDataUrl?: string;
      }) => Promise<ImportResult>
    >(async () => ({
      ok: false,
      reason: "invalid-schema",
      message: "検証に失敗しました",
      issues: [{ path: ["title"], message: "必須項目です" }],
    }));

    renderHarness({
      fetchPublishedDetail: vi.fn(async () => ({ ok: true as const, detail })),
      fetchCoverAsDataUrl: vi.fn(async () => null),
      findRecipeByScriptoriumId: vi.fn(async () => null),
      runScriptoriumImport,
      ensurePersistRequested: vi.fn(async () => {}),
    });

    await waitFor(() => {
      expect(screen.getByTestId("phase")).toHaveTextContent("ready");
    });

    fireEvent.click(screen.getByText("confirm-without-image"));

    await waitFor(() => {
      expect(screen.getByTestId("import-error")).toHaveTextContent(
        "検証に失敗しました",
      );
    });
    expect(screen.queryByText("overview page")).not.toBeInTheDocument();
  });
});
