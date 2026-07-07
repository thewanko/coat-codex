// routes/FeedPage.test.tsx — 一覧レンダー・もっと見る継ぎ足し・0件/エラー状態
// （技術計画v1 §5.1・§7 ST-15）
//
// FeedPageはlib/api.tsのfetchFeed(既定引数=グローバルfetch)経由でAPIを呼ぶため、
// テストではglobal.fetchをスタブする。

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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../i18n";
import FeedPage from "./FeedPage";
import type { FeedResponse } from "../lib/api";

function jsonResponse(body: FeedResponse): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function errorResponse(): Response {
  return { ok: false, status: 500, json: async () => ({}) } as Response;
}

describe("FeedPage", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("en");
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("一覧をサムネグリッドでレンダーする", async () => {
    const body: FeedResponse = {
      items: [
        {
          id: "scr_1",
          title: "Ultramarine Space Marine",
          handle: "painter1",
          lang: "en",
          publishedAt: "2026-07-01T00:00:00.000Z",
          thumbUrl: "/img/thumbs/scr_1.webp",
        },
        {
          id: "scr_2",
          title: "No Thumb Recipe",
          handle: "painter2",
          lang: null,
          publishedAt: "2026-07-02T00:00:00.000Z",
          thumbUrl: null,
        },
      ],
      nextCursor: null,
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body));

    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Ultramarine Space Marine"),
    ).toBeInTheDocument();
    expect(screen.getByText("@painter1")).toBeInTheDocument();
    expect(screen.getByText("No Thumb Recipe")).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    const targetLink = links.find(
      (link) => link.getAttribute("href") === "/r/scr_1",
    );
    expect(targetLink).toBeDefined();
  });

  test("0件時はempty文言を表示する", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [], nextCursor: null }),
    );

    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No recipes yet.")).toBeInTheDocument();
  });

  test("エラー時はerror文言を表示する", async () => {
    vi.mocked(fetch).mockResolvedValue(errorResponse());

    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Failed to load recipes."),
    ).toBeInTheDocument();
  });

  test("nextCursor非nullなら「もっと見る」で継ぎ足す", async () => {
    const firstPage: FeedResponse = {
      items: [
        {
          id: "scr_1",
          title: "Page 1 Recipe",
          handle: "painter1",
          lang: "en",
          publishedAt: "2026-07-01T00:00:00.000Z",
          thumbUrl: null,
        },
      ],
      nextCursor: "cursor-abc",
    };
    const secondPage: FeedResponse = {
      items: [
        {
          id: "scr_2",
          title: "Page 2 Recipe",
          handle: "painter2",
          lang: "en",
          publishedAt: "2026-06-30T00:00:00.000Z",
          thumbUrl: null,
        },
      ],
      nextCursor: null,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(firstPage))
      .mockResolvedValueOnce(jsonResponse(secondPage));

    render(
      <MemoryRouter>
        <FeedPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Page 1 Recipe")).toBeInTheDocument();
    const loadMoreButton = screen.getByRole("button", { name: "Load more" });
    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(screen.getByText("Page 2 Recipe")).toBeInTheDocument();
    });
    // 1ページ目の内容は消えず継ぎ足される
    expect(screen.getByText("Page 1 Recipe")).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith("/api/recipes?cursor=cursor-abc");
    // 2ページ目でnextCursor===nullのため「もっと見る」は消える
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });
});
