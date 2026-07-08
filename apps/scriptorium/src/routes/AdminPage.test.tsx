// routes/AdminPage.test.tsx — /admin 管理UI RTLテスト（技術計画v1 §7 S7/ST-32）
//
// AdminPageはfetchImpl propでfetchをDIできる（DeleteRecipeDialogと同じイディオム）。
// CF Access保護はedge認証済み前提でUI側に認証コードがないため、認証系のテストはない。

import "../i18n";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../i18n";
import AdminPage from "./AdminPage";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

interface AdminRecipeListItem {
  id: string;
  status: string;
  handle: string;
  title: string;
  lang: string | null;
  report_count: number;
  created_at: string;
  published_at: string | null;
  deleted_at: string | null;
  cover_key: string | null;
  thumb_key: string | null;
}

const PENDING_ITEM: AdminRecipeListItem = {
  id: "scr_pending_1",
  status: "pending",
  handle: "painter1",
  title: "Ultramarine Captain",
  lang: "en",
  report_count: 0,
  created_at: "2026-07-01T00:00:00.000Z",
  published_at: null,
  deleted_at: null,
  cover_key: null,
  thumb_key: null,
};

const MINIMAL_PUBLISHED_RECIPE = {
  scriptoriumSchemaVersion: 1,
  title: "Ultramarine Captain",
  palette: [],
  tools: [],
  baseSteps: [],
  parts: [],
};

const PENDING_DETAIL = {
  id: "scr_pending_1",
  status: "pending",
  handle: "painter1",
  title: "Ultramarine Captain",
  lang: "en",
  schema_version: 1,
  recipe_json: JSON.stringify(MINIMAL_PUBLISHED_RECIPE),
  cover_key: "covers/scr_pending_1.jpg",
  thumb_key: null,
  report_count: 0,
  created_at: "2026-07-01T00:00:00.000Z",
  published_at: null,
  deleted_at: null,
};

const DEFAULT_SETTINGS: Record<string, string> = {
  moderation_mode: "auto",
  circuit_breaker: "closed",
  nsfw_screening: "off",
  report_threshold: "3",
  daily_post_limit: "50",
  hourly_global_limit: "10",
};

/**
 * urlごとの応答を切り替える薄いfetchスタブ。
 * デフォルトで一覧=空、設定=DEFAULT_SETTINGSを返す。overridesで個別上書きできる。
 */
function makeFetchImpl(
  overrides: Partial<{
    recipes: (status: string) => Response;
    settings: () => Response;
    action: (path: string, init?: RequestInit) => Response;
    detail: (id: string) => Response;
  }> = {},
): typeof fetch {
  return vi.fn<typeof fetch>((input, init) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.startsWith("/api/admin/recipes?status=")) {
      const status = new URL(url, "http://localhost").searchParams.get(
        "status",
      )!;
      const response = overrides.recipes
        ? overrides.recipes(status)
        : jsonResponse({ recipes: [] });
      return Promise.resolve(response);
    }

    if (url === "/api/admin/settings" && (!init || init.method === undefined)) {
      const response = overrides.settings
        ? overrides.settings()
        : jsonResponse({ settings: DEFAULT_SETTINGS });
      return Promise.resolve(response);
    }

    if (url === "/api/admin/settings" && init?.method === "PUT") {
      const response = overrides.action
        ? overrides.action(url, init)
        : jsonResponse({ key: "moderation_mode", value: "approval" });
      return Promise.resolve(response);
    }

    if (url.startsWith("/api/admin/recipes/") && init?.method === "POST") {
      const response = overrides.action
        ? overrides.action(url, init)
        : jsonResponse({ id: "scr_pending_1", status: "published" });
      return Promise.resolve(response);
    }

    if (
      url.startsWith("/api/admin/recipes/") &&
      (!init || init.method === undefined)
    ) {
      const id = url.replace("/api/admin/recipes/", "");
      const response = overrides.detail
        ? overrides.detail(id)
        : jsonResponse({}, false, 404);
      return Promise.resolve(response);
    }

    return Promise.resolve(jsonResponse({}, false, 404));
  });
}

describe("AdminPage", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("en");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("pendingタブ初期表示: 一覧fetchと行描画", async () => {
    const fetchImpl = makeFetchImpl({
      recipes: (status) =>
        status === "pending"
          ? jsonResponse({ recipes: [PENDING_ITEM] })
          : jsonResponse({ recipes: [] }),
    });

    render(
      <MemoryRouter>
        <AdminPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Ultramarine Captain")).toBeInTheDocument();
    expect(screen.getByText("@painter1")).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledWith("/api/admin/recipes?status=pending");
  });

  test("タブ切替でstatusクエリが変わる", async () => {
    const fetchImpl = makeFetchImpl();

    render(
      <MemoryRouter>
        <AdminPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    );

    await screen.findByText("No recipes in this queue.");

    fireEvent.click(screen.getByRole("tab", { name: "Flagged" }));

    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/admin/recipes?status=flagged",
      );
    });
  });

  test("承認ボタン→POST approve→一覧再取得", async () => {
    let approveCalled = false;
    const fetchImpl = makeFetchImpl({
      recipes: (status) =>
        status === "pending" && !approveCalled
          ? jsonResponse({ recipes: [PENDING_ITEM] })
          : jsonResponse({ recipes: [] }),
      action: (path) => {
        if (path === "/api/admin/recipes/scr_pending_1/approve") {
          approveCalled = true;
          return jsonResponse({ id: "scr_pending_1", status: "published" });
        }
        return jsonResponse({}, false, 404);
      },
    });

    render(
      <MemoryRouter>
        <AdminPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    );

    await screen.findByText("Ultramarine Captain");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/admin/recipes/scr_pending_1/approve",
        { method: "POST" },
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("Ultramarine Captain")).not.toBeInTheDocument();
    });
  });

  test("削除確認: confirm falseならPOSTしない/trueならPOSTする", async () => {
    const fetchImpl = makeFetchImpl({
      recipes: (status) =>
        status === "pending"
          ? jsonResponse({ recipes: [PENDING_ITEM] })
          : jsonResponse({ recipes: [] }),
    });

    render(
      <MemoryRouter>
        <AdminPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    );

    await screen.findByText("Ultramarine Captain");

    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalledWith(
      "/api/admin/recipes/scr_pending_1/delete",
      { method: "POST" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/admin/recipes/scr_pending_1/delete",
        { method: "POST" },
      );
    });
  });

  test("設定パネル: GET settingsの値描画・トグル変更でPUT body検証", async () => {
    let putBody: unknown = null;
    const fetchImpl = makeFetchImpl({
      action: (path, init) => {
        if (path === "/api/admin/settings" && init?.method === "PUT") {
          putBody = JSON.parse(init.body as string);
          return jsonResponse({ key: "moderation_mode", value: "approval" });
        }
        return jsonResponse({}, false, 404);
      },
    });

    render(
      <MemoryRouter>
        <AdminPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    );

    const select = (await screen.findByLabelText(
      "Moderation mode",
    )) as HTMLSelectElement;
    expect(select.value).toBe("auto");

    fireEvent.change(select, { target: { value: "approval" } });

    await waitFor(() => {
      expect(putBody).toEqual({ key: "moderation_mode", value: "approval" });
    });
  });

  test("一覧fetch失敗でエラー表示", async () => {
    const fetchImpl = makeFetchImpl({
      recipes: () => jsonResponse({}, false, 500),
    });

    render(
      <MemoryRouter>
        <AdminPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Failed to load recipes."),
    ).toBeInTheDocument();
  });

  test("行クリック→詳細fetchとプレビュー描画", async () => {
    const fetchImpl = makeFetchImpl({
      recipes: (status) =>
        status === "pending"
          ? jsonResponse({ recipes: [PENDING_ITEM] })
          : jsonResponse({ recipes: [] }),
      detail: (id) =>
        id === "scr_pending_1"
          ? jsonResponse(PENDING_DETAIL)
          : jsonResponse({}, false, 404),
    });

    const { container } = render(
      <MemoryRouter>
        <AdminPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("Ultramarine Captain"));

    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/admin/recipes/scr_pending_1",
      );
    });

    expect(
      await screen.findByText("@painter1 · en · pending"),
    ).toBeInTheDocument();
    const cover = container.querySelector("img[src]");
    expect(cover?.getAttribute("src")).toBe("/img/covers/scr_pending_1.jpg");
  });

  test("操作ボタン連打で2回目のPOSTが発火しない", async () => {
    let approveCallCount = 0;
    const deferred: { resolve: ((response: Response) => void) | undefined } = {
      resolve: undefined,
    };
    const fetchImpl = makeFetchImpl({
      recipes: (status) =>
        status === "pending"
          ? jsonResponse({ recipes: [PENDING_ITEM] })
          : jsonResponse({ recipes: [] }),
      action: (path) => {
        if (path === "/api/admin/recipes/scr_pending_1/approve") {
          approveCallCount += 1;
          return new Promise<Response>((resolve) => {
            deferred.resolve = resolve;
          }) as unknown as Response;
        }
        return jsonResponse({}, false, 404);
      },
    });

    render(
      <MemoryRouter>
        <AdminPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    );

    await screen.findByText("Ultramarine Captain");
    const approveButton = screen.getByRole("button", { name: "Approve" });
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(approveCallCount).toBe(1);
    });

    deferred.resolve?.(
      jsonResponse({ id: "scr_pending_1", status: "published" }),
    );
  });

  test("数値設定を空でblurするとPUTせず現在値へ復帰する", async () => {
    const putCalls: unknown[] = [];
    const fetchImpl = makeFetchImpl({
      action: (path, init) => {
        if (path === "/api/admin/settings" && init?.method === "PUT") {
          putCalls.push(JSON.parse(init.body as string));
          return jsonResponse({ key: "report_threshold", value: "9" });
        }
        return jsonResponse({}, false, 404);
      },
    });

    render(
      <MemoryRouter>
        <AdminPage fetchImpl={fetchImpl} />
      </MemoryRouter>,
    );

    const input = (await screen.findByLabelText(
      "Report threshold",
    )) as HTMLInputElement;
    expect(input.value).toBe("3");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input.value).toBe("3");
    });
    expect(putCalls).toEqual([]);
  });
});
