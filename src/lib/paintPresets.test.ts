// lib/paintPresets.test.ts — プリセット塗料DBの遅延ロード・検索のテスト（技術計画v2.2 §4.2 T17）
//
// fetchはvi.stubGlobalでモックする。各testでモジュールをvi.resetModulesで
// 再importし、モジュール内メモリキャッシュ（indexCache/brandColorsCache）が
// テスト間で漏れないようにする。

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  PaintBrandFile,
  PaintBrandIndex,
  PaintPresetColor,
} from "./paintPresets";
import citadelData from "../../public/paints/citadel.json";
import vallejoData from "../../public/paints/vallejo.json";

const INDEX_FIXTURE: PaintBrandIndex = {
  brands: [
    { id: "citadel", label: "Citadel", file: "citadel.json", count: 2 },
    { id: "vallejo", label: "Vallejo", file: "vallejo.json", count: 1 },
  ],
};

const CITADEL_COLORS: PaintPresetColor[] = [
  {
    id: "citadel:mephiston-red",
    name: "Mephiston Red",
    nameJa: "メフィストンレッド",
    hex: "#960C0C",
  },
  {
    id: "citadel:abaddon-black",
    name: "Abaddon Black",
    nameJa: "アバドンブラック",
    hex: "#141414",
  },
  {
    id: "citadel:base-khaki",
    name: "Khaki",
    range: "base",
    hex: "#8C7D53",
  },
  {
    id: "citadel:layer-khaki",
    name: "Khaki",
    range: "layer",
    hex: "#A69466",
  },
];

const CITADEL_FIXTURE: PaintBrandFile = {
  brandId: "citadel",
  label: "Citadel",
  colors: CITADEL_COLORS,
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function importFresh() {
  return import("./paintPresets");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadBrandIndex", () => {
  test("index.jsonをfetchしブランド一覧を返す", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(INDEX_FIXTURE));
    vi.stubGlobal("fetch", fetchMock);

    const { loadBrandIndex } = await importFresh();
    const brands = await loadBrandIndex();

    expect(brands).toEqual(INDEX_FIXTURE.brands);
    expect(fetchMock).toHaveBeenCalledWith("/paints/index.json");
  });

  test("2回呼んでもfetchは1回のみ（メモリキャッシュ）", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(INDEX_FIXTURE));
    vi.stubGlobal("fetch", fetchMock);

    const { loadBrandIndex } = await importFresh();
    await loadBrandIndex();
    await loadBrandIndex();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("fetch失敗時はエラーを投げず空配列＋console.warn", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(null, false, 500));
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { loadBrandIndex } = await importFresh();
    const brands = await loadBrandIndex();

    expect(brands).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("fetchが例外をthrowしてもエラーを投げず空配列＋console.warn", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { loadBrandIndex } = await importFresh();
    const brands = await loadBrandIndex();

    expect(brands).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("loadBrandColors", () => {
  test("指定ブランドのカラー一覧をfetchする", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/paints/index.json") return jsonResponse(INDEX_FIXTURE);
      if (url === "/paints/citadel.json") return jsonResponse(CITADEL_FIXTURE);
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loadBrandColors } = await importFresh();
    const colors = await loadBrandColors("citadel");

    expect(colors).toEqual(CITADEL_COLORS);
    expect(fetchMock).toHaveBeenCalledWith("/paints/citadel.json");
  });

  test("同一ブランドを2回読んでもfetchはブランドファイル1回のみ（メモリキャッシュ）", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/paints/index.json") return jsonResponse(INDEX_FIXTURE);
      if (url === "/paints/citadel.json") return jsonResponse(CITADEL_FIXTURE);
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loadBrandColors } = await importFresh();
    await loadBrandColors("citadel");
    await loadBrandColors("citadel");

    const brandFileCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/paints/citadel.json",
    );
    expect(brandFileCalls).toHaveLength(1);
  });

  test("未知のbrandIdはエラーを投げず空配列＋console.warn", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/paints/index.json") return jsonResponse(INDEX_FIXTURE);
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { loadBrandColors } = await importFresh();
    const colors = await loadBrandColors("unknown-brand");

    expect(colors).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("ブランドファイルのfetch失敗時はエラーを投げず空配列＋console.warn", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/paints/index.json") return jsonResponse(INDEX_FIXTURE);
      if (url === "/paints/citadel.json") return jsonResponse(null, false, 500);
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { loadBrandColors } = await importFresh();
    const colors = await loadBrandColors("citadel");

    expect(colors).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("searchColors", () => {
  test("英名の部分一致（大文字小文字無視）で絞り込む", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/paints/index.json") return jsonResponse(INDEX_FIXTURE);
      if (url === "/paints/citadel.json") return jsonResponse(CITADEL_FIXTURE);
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchColors } = await importFresh();
    const result = await searchColors("citadel", "mephiston");

    expect(result).toEqual([CITADEL_COLORS[0]]);
  });

  test("和名の部分一致で絞り込む", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/paints/index.json") return jsonResponse(INDEX_FIXTURE);
      if (url === "/paints/citadel.json") return jsonResponse(CITADEL_FIXTURE);
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchColors } = await importFresh();
    const result = await searchColors("citadel", "アバドン");

    expect(result).toEqual([CITADEL_COLORS[1]]);
  });

  test("大文字小文字を無視して一致する", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/paints/index.json") return jsonResponse(INDEX_FIXTURE);
      if (url === "/paints/citadel.json") return jsonResponse(CITADEL_FIXTURE);
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchColors } = await importFresh();
    const result = await searchColors("citadel", "MEPHISTON");

    expect(result).toEqual([CITADEL_COLORS[0]]);
  });

  test("空文字クエリは全件を返す", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/paints/index.json") return jsonResponse(INDEX_FIXTURE);
      if (url === "/paints/citadel.json") return jsonResponse(CITADEL_FIXTURE);
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchColors } = await importFresh();
    const result = await searchColors("citadel", "");

    expect(result).toEqual(CITADEL_COLORS);
  });

  test("一致しないクエリは空配列を返す", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/paints/index.json") return jsonResponse(INDEX_FIXTURE);
      if (url === "/paints/citadel.json") return jsonResponse(CITADEL_FIXTURE);
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchColors } = await importFresh();
    const result = await searchColors("citadel", "nonexistent-color-xyz");

    expect(result).toEqual([]);
  });

  test("fetch失敗時は空配列を返す（例外を投げない）", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { searchColors } = await importFresh();
    const result = await searchColors("citadel", "red");

    expect(result).toEqual([]);
  });

  test("rangeを持つ色はloadBrandColors/searchColorsを通じてそのまま透過する", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/paints/index.json") return jsonResponse(INDEX_FIXTURE);
      if (url === "/paints/citadel.json") return jsonResponse(CITADEL_FIXTURE);
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchColors } = await importFresh();
    const result = await searchColors("citadel", "khaki");

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.range)).toEqual(
      expect.arrayContaining(["base", "layer"]),
    );
    expect(result.every((c) => c.name === "Khaki")).toBe(true);
  });
});

describe("生成データの整合性（実ファイル検証）", () => {
  const HEX_RE = /^#[0-9A-F]{6}$/;

  test.each([
    ["citadel", citadelData],
    ["vallejo", vallejoData],
  ])("%s.json: id一意・hex形式・range非空", (_brand, data) => {
    const colors = data.colors;
    expect(colors.length).toBeGreaterThan(0);

    const ids = colors.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const c of colors) {
      expect(c.hex).toMatch(HEX_RE);
      expect(c.range).toBeTruthy();
    }
  });
});
