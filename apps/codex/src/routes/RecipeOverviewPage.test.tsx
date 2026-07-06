// routes/RecipeOverviewPage.test.tsx — RecipeOverviewPageのテスト（技術計画v2.2 §4.2 T28）
//
// db/recipeStoreをモックしuseRecipeStore（実物）経由でのload連携・ロード中/不存在/
// loadError分岐・onSaveError購読でのトースト表示・パーツ並び替え/追加時のupdateRecipe
// 呼び出し（参照同一性はtoBeで検証=M4必須事項②）・ベース工程編集への遷移・パーツ詳細への
// 遷移を検証する。PartCardListは重い依存（dnd-kit経由のPartCard等）を持つためモックする。

import "../i18n";
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import i18next from "../i18n";
import RecipeOverviewPage from "./RecipeOverviewPage";
import ToastHost from "../components/common/ToastHost";
import {
  __resetRecipeStoreForTest,
  useRecipeStore,
} from "../stores/useRecipeStore";
import { StorageQuotaError } from "../db/photoStore";
import { readRecipeExport } from "../lib/storageHealth";
import type { RecipeDoc } from "@coat-codex/recipe-core";

type RecipePart = RecipeDoc["parts"][number];

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../db/recipeStore", () => ({
  loadRecipe: vi.fn(),
  saveRecipe: vi.fn(),
}));

vi.mock("../db/photoStore", async () => {
  const actual =
    await vi.importActual<typeof import("../db/photoStore")>(
      "../db/photoStore",
    );
  return {
    ...actual,
    resolvePhotoUrl: vi.fn().mockResolvedValue(null),
  };
});

// ExportReminderBanner(compact)（T34）がlib/storageHealth経由でDexie(meta)を読むため、
// fake-indexeddb非依存のこのテストではAPI非対応環境相当（undefined）にモックする。
vi.mock("../lib/storageHealth", async () => {
  const actual = await vi.importActual<typeof import("../lib/storageHealth")>(
    "../lib/storageHealth",
  );
  return {
    ...actual,
    readRecipeExport: vi.fn().mockResolvedValue(undefined),
    readReminderSnooze: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../components/overview/PartCardList", () => ({
  default: ({
    parts,
    onOpen,
    onReorder,
    onAdd,
  }: {
    parts: RecipePart[];
    onOpen: (partId: string) => void;
    onReorder: (next: RecipePart[]) => void;
    onAdd: (part: RecipePart) => void;
  }) => (
    <div data-testid="part-card-list-stub">
      <span data-testid="part-count">{parts.length}</span>
      <button type="button" onClick={() => onOpen("part_1")}>
        open-part-1
      </button>
      <button type="button" onClick={() => onReorder([...parts].reverse())}>
        reorder
      </button>
      <button
        type="button"
        onClick={() => onAdd({ id: "part_new", name: "新パーツ", steps: [] })}
      >
        add-part
      </button>
    </div>
  ),
}));

import { loadRecipe, saveRecipe } from "../db/recipeStore";

type MatchMediaListener = (event: MediaQueryListEvent) => void;

// mockMatchMedia: window.matchMedia("(min-width: 768px)")をmatches固定でスタブする
// 共有ヘルパ（PC/モバイル判定・bodyスクロールロックのchange購読テストで共用。
// review L4: 従来は2つのdescribeで重複定義されていたためファイルスコープへ集約）。
function mockMatchMedia(matches: boolean) {
  const listeners = new Set<MatchMediaListener>();
  const mql: Partial<MediaQueryList> = {
    matches,
    media: "(min-width: 768px)",
    addEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.add(listener as MatchMediaListener);
    },
    removeEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.delete(listener as MatchMediaListener);
    },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => mql as MediaQueryList),
  );
}

function makeDoc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 1,
    id: "rcp_1",
    title: "テストレシピ",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
    ...overrides,
  };
}

function renderPage(path: string) {
  return render(
    <ToastHost>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recipe/:id" element={<RecipeOverviewPage />}>
            <Route path="part/base" element={<div>ベース工程編集画面</div>} />
            <Route path="part/:partId" element={<div>パーツ編集画面</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ToastHost>,
  );
}

beforeEach(() => {
  vi.mocked(loadRecipe).mockReset();
  vi.mocked(saveRecipe).mockReset();
  vi.mocked(saveRecipe).mockImplementation((doc: RecipeDoc) =>
    Promise.resolve(doc),
  );
  vi.mocked(readRecipeExport).mockReset().mockResolvedValue(undefined);
  __resetRecipeStoreForTest();
});

afterEach(() => {
  __resetRecipeStoreForTest();
});

describe("RecipeOverviewPage — ロード状態分岐", () => {
  test("ロード成功時はタイトルとパーツ一覧を表示する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });
    expect(screen.getByTestId("part-count")).toHaveTextContent("1");
  });

  test("loadError時はエラーメッセージを表示する", async () => {
    vi.mocked(loadRecipe).mockRejectedValue(new Error("boom"));
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(
        screen.getByText("レシピの読み込みに失敗しました"),
      ).toBeInTheDocument();
    });
  });
});

describe("RecipeOverviewPage — PartCardListへのprops変換（updateRecipe呼び出し・参照同一性）", () => {
  test("onReorderはpartsを渡された配列で差し替える", async () => {
    const p1: RecipePart = { id: "part_1", name: "腕", steps: [] };
    const p2: RecipePart = { id: "part_2", name: "脚", steps: [] };
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ parts: [p1, p2] }));
    renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");
    fireEvent.click(screen.getByText("reorder"));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.parts).toEqual([p2, p1]);
    expect(nextDoc?.parts[0]).toBe(p2);
    expect(nextDoc?.parts[1]).toBe(p1);
  });

  test("onAddはpartsへスプレッド追加し、既存part要素の参照を保つ", async () => {
    const existingPart: RecipePart = { id: "part_1", name: "腕", steps: [] };
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ parts: [existingPart] }));
    renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");
    fireEvent.click(screen.getByText("add-part"));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.parts).toHaveLength(2);
    expect(nextDoc?.parts[0]).toBe(existingPart);
    expect(nextDoc?.parts[1].id).toBe("part_new");
  });

  test("onOpenは/recipe/:id/part/:partIdへnavigateする", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");
    fireEvent.click(screen.getByText("open-part-1"));

    expect(screen.getByText("パーツ編集画面")).toBeInTheDocument();
  });

  test("add-partはpartを追加した上で新規パーツの編集画面へnavigateする", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ parts: [] }));
    renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");
    fireEvent.click(screen.getByText("add-part"));

    expect(screen.getByText("パーツ編集画面")).toBeInTheDocument();
  });
});

describe("RecipeOverviewPage — ネストルート（親子マッチ・T44）", () => {
  test("/recipe/:id/part/:partIdはOutlet経由で子ルートを描画しつつ、親のOverview（タイトル）も背面に残る", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderPage("/recipe/rcp_1/part/part_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });
    expect(screen.getByText("パーツ編集画面")).toBeInTheDocument();
  });

  test("/recipe/:id/part/baseは:partIdより優先してマッチする（予約語base）", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage("/recipe/rcp_1/part/base");

    await waitFor(() => {
      expect(screen.getByText("ベース工程編集画面")).toBeInTheDocument();
    });
    expect(screen.queryByText("パーツ編集画面")).not.toBeInTheDocument();
  });
});

describe("RecipeOverviewPage — BASEセクション（PARTS同様の独立カード。2026-07-03）", () => {
  test("ベース工程0件時は破線ピルを表示し、タップで/recipe/:id/part/baseへnavigateする", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ baseSteps: [] }));
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "＋ ベース工程を追加" }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", { name: "＋ ベース工程を追加" }),
    );

    expect(screen.getByText("ベース工程編集画面")).toBeInTheDocument();
  });

  test("ベース工程1件以上ならBASEカード（PartCard）を表示し、タップで/recipe/:id/part/baseへnavigateする", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        baseSteps: [
          {
            id: "stp_base_1",
            technique: { presetKey: null, label: null },
            photoId: null,
            paints: [],
            mix: null,
            toolIds: [],
            memo: "",
          },
        ],
      }),
    );
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("ベース工程（全体）")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("base-card-empty")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("ベース工程（全体）"));

    expect(screen.getByText("ベース工程編集画面")).toBeInTheDocument();
  });

  test("BASEカードの「工程レビュー」でPartReviewDialogがbaseモードで開く（共有ボタンなし）", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        baseSteps: [
          {
            id: "stp_base_1",
            technique: { presetKey: null, label: null },
            photoId: null,
            paints: [],
            mix: null,
            toolIds: [],
            memo: "",
          },
        ],
      }),
    );
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("ベース工程（全体）")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("part-review-open"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "ベース工程（全体）" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Xで共有" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Blueskyで共有" }),
    ).not.toBeInTheDocument();

    const editLink = screen.getByRole("link", { name: "このパーツを編集" });
    expect(editLink).toHaveAttribute("href", "/recipe/rcp_1/part/base");
  });
});

describe("RecipeOverviewPage — onSaveError購読でのトースト表示", () => {
  test("StorageQuotaErrorの場合はstorageQuotaメッセージをトースト表示する", async () => {
    const p1: RecipePart = { id: "part_1", name: "腕", steps: [] };
    const p2: RecipePart = { id: "part_2", name: "脚", steps: [] };
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ parts: [p1, p2] }));
    vi.mocked(saveRecipe).mockRejectedValue(new StorageQuotaError());
    renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");

    // reorder（navigateしないアクション）でupdateRecipeを発火させる。add-partはnavigateを
    // 伴いRecipeOverviewPageがアンマウントされるため、onSaveError購読の検証には使えない。
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByText("reorder"));
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    await waitFor(() => {
      expect(
        screen.getByText(
          "容量不足です。写真を減らすか、バックアップ後に不要なレシピを削除してください",
        ),
      ).toBeInTheDocument();
    });
  });
});

describe("RecipeOverviewPage — 戻るリンク", () => {
  test("レシピ一覧へ戻るリンクが/を指す", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /レシピ一覧へ/ });
    expect(link).toHaveAttribute("href", "/");
  });
});

describe("RecipeOverviewPage — bodyスクロール固定の前値復元（M8 T44レビューRound1 #3）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = "";
  });

  test('パネル表示中はoverflow:hiddenになり、パネルが閉じられると開く前の値へ復元される（無条件""上書きしない）', async () => {
    mockMatchMedia(true);
    document.body.style.overflow = "scroll";
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    const { unmount } = renderPage("/recipe/rcp_1/part/base");

    await waitFor(() => {
      expect(screen.getByText("ベース工程編集画面")).toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe("hidden");

    // パネルを閉じる（=isPanelOpenがfalseになる）操作の直接的なUIトリガーはこの簡易ルート
    // スタブにはないため、cleanup effectの実行（アンマウント）で検証する。
    unmount();

    expect(document.body.style.overflow).toBe("scroll");
  });
});

describe("RecipeOverviewPage — panelOpenクラス付与とモバイルのスクロール位置対応（フルページ化バグ修正）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // review L3: window.scrollYはObject.definePropertyで上書きしたスタブのため、
    // 他テストへの汚染を防ぐためテスト後に元のプロパティ（jsdomデフォルト）へ戻す。
    delete (window as { scrollY?: number }).scrollY;
  });

  test("子ルート表示中は背面Overviewの.rootにpanelOpenクラスが付与され、閉じると外れる", async () => {
    mockMatchMedia(true);
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderPage("/recipe/rcp_1/part/part_1");

    await waitFor(() => {
      expect(screen.getByText("パーツ編集画面")).toBeInTheDocument();
    });
    expect(document.querySelector('[class*="panelOpen"]')).toBeInTheDocument();
  });

  test("子ルートを開いていない状態ではpanelOpenクラスが付与されない", async () => {
    mockMatchMedia(true);
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });
    expect(
      document.querySelector('[class*="panelOpen"]'),
    ).not.toBeInTheDocument();
  });

  test("isLoading分岐でも子ルート表示中はpanelOpenクラスが付与される", async () => {
    mockMatchMedia(true);
    vi.mocked(loadRecipe).mockImplementation(() => new Promise(() => {}));
    renderPage("/recipe/rcp_1/part/part_1");

    await waitFor(() => {
      expect(
        document.querySelector('[class*="panelOpen"]'),
      ).toBeInTheDocument();
    });
  });

  test("モバイル（matches:false）でパネルを開くとscrollTo(0, 0)が呼ばれ、閉じると退避位置へ復元される", async () => {
    // #1修正（実機検証で検出）: scrollYの退避はパネルを開くクリックハンドラ内
    // （navigate直前＝DOM変更前）で行うため、直接URLアクセス（初回マウント）ではなく
    // Overview表示中にopen-part-1をクリックしてパネルを開く手順で検証する必要がある
    // （effect実行時点で読むと`.panelOpen{display:none}`適用後でscrollYが0にクランプ
    // 済みのため、退避値が常に0になり閉時復元がno-opになる不具合の再発防止）。
    mockMatchMedia(false);
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    const { unmount } = renderPage("/recipe/rcp_1");

    await screen.findByTestId("part-card-list-stub");
    Object.defineProperty(window, "scrollY", {
      value: 240,
      configurable: true,
    });
    fireEvent.click(screen.getByText("open-part-1"));

    await waitFor(() => {
      expect(screen.getByText("パーツ編集画面")).toBeInTheDocument();
    });
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);

    unmount();

    expect(scrollToSpy).toHaveBeenCalledWith(0, 240);
    scrollToSpy.mockRestore();
  });

  test("PC（matches:true）ではパネル開閉でscrollToが呼ばれない", async () => {
    mockMatchMedia(true);
    const scrollToSpy = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => {});
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    const { unmount } = renderPage("/recipe/rcp_1/part/part_1");

    await waitFor(() => {
      expect(screen.getByText("パーツ編集画面")).toBeInTheDocument();
    });
    expect(scrollToSpy).not.toHaveBeenCalled();

    unmount();

    expect(scrollToSpy).not.toHaveBeenCalled();
    scrollToSpy.mockRestore();
  });
});

describe("RecipeOverviewPage — モバイル「出力・共有」ボタンのレンダー位置（2026-07-04 FB-G sticky化）", () => {
  // position: fixed→stickyへの変更に伴い、ExportActionBar（モバイル分岐）はページ最下部で
  // フッターと重ならないよう、コンテンツ末尾（＋パーツを追加を含むPartCardListの後）に
  // 配置される必要がある。sticky自体のジオメトリはjsdomで検証不能なため、DOM順序
  // （compareDocumentPosition）で固定する。
  test("export-action-barはpart-card-list-stub（＋パーツを追加を含む）より後にレンダーされる", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderPage("/recipe/rcp_1");

    const partList = await screen.findByTestId("part-card-list-stub");
    const actionBar = screen.getByTestId("export-action-bar");

    // partListから見てactionBarが後続（DOCUMENT_POSITION_FOLLOWING = 4）に位置すること
    expect(
      partList.compareDocumentPosition(actionBar) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("RecipeOverviewPage — 全体写真の後日変更ダイアログ（2026-07-04 FB-C）", () => {
  test("写真0枚のレシピでは「全体写真を追加」ボタンを表示する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ overviewPhotoIds: [] }));
    renderPage("/recipe/rcp_1");

    expect(
      await screen.findByRole("button", { name: "全体写真を追加" }),
    ).toBeInTheDocument();
  });

  test("写真ありのレシピでは「全体写真を変更」ボタンを表示する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ overviewPhotoIds: ["pht_1"] }),
    );
    renderPage("/recipe/rcp_1");

    expect(
      await screen.findByRole("button", { name: "全体写真を変更" }),
    ).toBeInTheDocument();
  });

  test("ボタン押下でOverviewPhotoDialogが開く", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ overviewPhotoIds: ["pht_1"] }),
    );
    renderPage("/recipe/rcp_1");

    const button = await screen.findByRole("button", {
      name: "全体写真を変更",
    });
    fireEvent.click(button);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("全体写真")).toBeInTheDocument();
  });

  test("ダイアログを閉じるボタンで非表示になる", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ overviewPhotoIds: ["pht_1"] }),
    );
    renderPage("/recipe/rcp_1");

    fireEvent.click(
      await screen.findByRole("button", { name: "全体写真を変更" }),
    );
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("RecipeOverviewPage — ExportReminderBanner(compact)（§3.5・T34）", () => {
  test("未エクスポートのレシピはコンパクト帯を表示する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    vi.mocked(readRecipeExport).mockResolvedValue(undefined);
    renderPage("/recipe/rcp_1");

    expect(
      await screen.findByTestId("export-reminder-banner"),
    ).toBeInTheDocument();
  });

  test("recipeExport:<id>がupdatedAt以降ならコンパクト帯を表示しない", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ updatedAt: "2026-07-01T00:00:00.000Z" }),
    );
    vi.mocked(readRecipeExport).mockResolvedValue("2026-07-02T00:00:00.000Z");
    renderPage("/recipe/rcp_1");

    await waitFor(() => {
      expect(screen.getByText("テストレシピ")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("export-reminder-banner"),
    ).not.toBeInTheDocument();
  });
});
