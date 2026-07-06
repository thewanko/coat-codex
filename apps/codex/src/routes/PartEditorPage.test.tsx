// routes/PartEditorPage.test.tsx — PartEditorPageのテスト（技術計画v2.2 §4.2 T27）
//
// db/recipeStoreをモックしuseRecipeStore（実物）経由でのload連携・モード出し分け・
// partId不存在表示・StepListへのprops変換（updateRecipeが正しいupdaterを受ける。
// 参照同一性はtoBeで検証=M4必須事項②）・onSaveError購読でのトースト表示・
// StepPhotoStripの写真つき工程抽出を検証する。
// StepList/PartEditorHeader/StepPhotoStripは重い依存（PaintSlotList等）を持つため、
// StepListはスタブ化しonChange/onDelete/onReorder/onAdd/onAddColorを直接呼べるようにする。

import "../i18n";
import { useEffect } from "react";
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
import { MemoryRouter, Outlet, Routes, Route, useParams } from "react-router";
import i18next from "../i18n";
import PartEditorPage from "./PartEditorPage";
import ToastHost from "../components/common/ToastHost";
import {
  __resetRecipeStoreForTest,
  useRecipeStore,
} from "../stores/useRecipeStore";
import { StorageQuotaError } from "../db/photoStore";
import type { PaletteColor, RecipeDoc, Step } from "@coat-codex/recipe-core";

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

vi.mock("../components/part-editor/StepList", () => ({
  default: ({
    steps,
    onChange,
    onDelete,
    onReorder,
    onAdd,
    onAddColor,
  }: {
    steps: Step[];
    onChange: (index: number, next: Step) => void;
    onDelete: (index: number) => void;
    onReorder: (next: Step[]) => void;
    onAdd: (step: Step) => void;
    onAddColor: (color: PaletteColor) => void;
  }) => (
    <div data-testid="step-list-stub">
      <span data-testid="step-count">{steps.length}</span>
      <button
        type="button"
        onClick={() =>
          steps[0] && onChange(0, { ...steps[0], memo: "changed" })
        }
      >
        change-step-0
      </button>
      <button type="button" onClick={() => onDelete(0)}>
        delete-step-0
      </button>
      <button type="button" onClick={() => onReorder([...steps].reverse())}>
        reorder
      </button>
      <button
        type="button"
        onClick={() =>
          onAdd({
            id: "stp_new",
            technique: { presetKey: null, label: null },
            photoId: null,
            paints: [],
            mix: null,
            toolIds: [],
            memo: "",
          })
        }
      >
        add-step
      </button>
      <button
        type="button"
        onClick={() =>
          onAddColor({
            id: "col_new",
            source: "custom",
            brand: null,
            name: "新色",
            presetId: null,
            hex: null,
            chipPhotoId: null,
          })
        }
      >
        add-color
      </button>
    </div>
  ),
}));

import { loadRecipe, saveRecipe } from "../db/recipeStore";

function makeStep(overrides: Partial<Step> & { id: string }): Step {
  return {
    technique: { presetKey: null, label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

function makeDoc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    schemaVersion: 3,
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
    source: null,
    ...overrides,
  };
}

// ネスト構造（router.tsx実物と同型。T44）: 親routeはOutlet経由で子ルートを描画する。
// 親自身のテキスト（"Overview画面"）はcloseナビゲーション後の到達確認に使う。
// loadのオーナーは親（RecipeOverviewPage）に一本化されている（M8 T44レビューRound1 #1）ため、
// 本スタブがload(:id)を呼ぶ。子（PartEditorPage）はストアのdoc/isLoadingを購読するのみで
// 自身ではloadを呼ばない。
function OverviewStub() {
  const { id } = useParams<{ id: string }>();
  const load = useRecipeStore((state) => state.load);

  useEffect(() => {
    if (id) {
      void load(id);
    }
  }, [id, load]);

  return (
    <div>
      Overview画面
      <Outlet />
    </div>
  );
}

function renderPage(path: string) {
  return render(
    <ToastHost>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recipe/:id" element={<OverviewStub />}>
            <Route path="part/base" element={<PartEditorPage isBaseMode />} />
            <Route path="part/:partId" element={<PartEditorPage />} />
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
  __resetRecipeStoreForTest();
});

afterEach(() => {
  __resetRecipeStoreForTest();
});

describe("PartEditorPage — モード分岐", () => {
  test("baseモード: 固定見出しが表示され、doc.baseStepsを編集対象とする", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ baseSteps: [makeStep({ id: "stp_1" })] }),
    );
    renderPage("/recipe/rcp_1/part/base");

    await waitFor(() => {
      expect(screen.getByText("ベース工程（全体）")).toBeInTheDocument();
    });
    expect(screen.getByTestId("step-count")).toHaveTextContent("1");
  });

  test("通常モード: partIdでdoc.partsから検索し、該当パーツのstepsを編集対象とする", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        parts: [
          {
            id: "part_1",
            name: "腕",
            steps: [makeStep({ id: "stp_1" }), makeStep({ id: "stp_2" })],
          },
        ],
      }),
    );
    renderPage("/recipe/rcp_1/part/part_1");

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "パーツ名" })).toHaveValue(
        "腕",
      );
    });
    expect(screen.getByTestId("step-count")).toHaveTextContent("2");
  });

  test("通常モード: partIdが存在しないパーツを指す場合はpartNotFound表示になる", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ parts: [] }));
    renderPage("/recipe/rcp_1/part/part_missing");

    await waitFor(() => {
      expect(screen.getByText("パーツが見つかりません")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("step-list-stub")).not.toBeInTheDocument();
  });
});

describe("PartEditorPage — StepListへのprops変換（updateRecipe呼び出し・参照同一性）", () => {
  test("baseモードでのonChangeは対象stepのみ差し替え、他stepとparts配列全体の参照を保つ", async () => {
    const untouchedStep = makeStep({ id: "stp_2" });
    const targetPart = { id: "part_1", name: "腕", steps: [] as Step[] };
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        baseSteps: [makeStep({ id: "stp_1" }), untouchedStep],
        parts: [targetPart],
      }),
    );
    renderPage("/recipe/rcp_1/part/base");

    await screen.findByTestId("step-list-stub");
    fireEvent.click(screen.getByText("change-step-0"));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc).not.toBeNull();
    // 変更のない要素の参照維持（M4必須事項②）
    expect(nextDoc?.baseSteps[1]).toBe(untouchedStep);
    expect(nextDoc?.baseSteps[0].memo).toBe("changed");
    expect(nextDoc?.parts[0]).toBe(targetPart);
    expect(nextDoc?.parts).not.toBe(undefined);
  });

  test("通常モードでのonChangeは対象パーツ以外のpart要素の参照を保つ", async () => {
    const untouchedPart = { id: "part_2", name: "脚", steps: [] as Step[] };
    const targetStep = makeStep({ id: "stp_1" });
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        parts: [
          { id: "part_1", name: "腕", steps: [targetStep] },
          untouchedPart,
        ],
      }),
    );
    renderPage("/recipe/rcp_1/part/part_1");

    await screen.findByTestId("step-list-stub");
    fireEvent.click(screen.getByText("change-step-0"));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.parts[1]).toBe(untouchedPart);
    expect(nextDoc?.parts[0].steps[0].memo).toBe("changed");
  });

  test("onDeleteはfilterでstepを除去する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        baseSteps: [makeStep({ id: "stp_1" }), makeStep({ id: "stp_2" })],
      }),
    );
    renderPage("/recipe/rcp_1/part/base");

    await screen.findByTestId("step-list-stub");
    fireEvent.click(screen.getByText("delete-step-0"));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.baseSteps).toHaveLength(1);
    expect(nextDoc?.baseSteps[0].id).toBe("stp_2");
  });

  test("onReorderはbaseStepsを渡された配列で差し替える", async () => {
    const s1 = makeStep({ id: "stp_1" });
    const s2 = makeStep({ id: "stp_2" });
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ baseSteps: [s1, s2] }));
    renderPage("/recipe/rcp_1/part/base");

    await screen.findByTestId("step-list-stub");
    fireEvent.click(screen.getByText("reorder"));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.baseSteps).toEqual([s2, s1]);
    expect(nextDoc?.baseSteps[0]).toBe(s2);
    expect(nextDoc?.baseSteps[1]).toBe(s1);
  });

  test("onAddはスプレッド追加でstepを末尾に足す", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ baseSteps: [makeStep({ id: "stp_1" })] }),
    );
    renderPage("/recipe/rcp_1/part/base");

    await screen.findByTestId("step-list-stub");
    fireEvent.click(screen.getByText("add-step"));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.baseSteps).toHaveLength(2);
    expect(nextDoc?.baseSteps[1].id).toBe("stp_new");
  });

  test("onAddColorはpaletteへスプレッド追加し、既存palette要素の参照を保つ", async () => {
    const existingColor = {
      id: "col_1",
      source: "preset" as const,
      brand: "Vallejo",
      name: "既存色",
      presetId: "preset_1",
      hex: "#112233",
      chipPhotoId: null,
    };
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        palette: [existingColor],
        baseSteps: [makeStep({ id: "stp_1" })],
      }),
    );
    renderPage("/recipe/rcp_1/part/base");

    await screen.findByTestId("step-list-stub");
    fireEvent.click(screen.getByText("add-color"));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.palette).toHaveLength(2);
    expect(nextDoc?.palette[0]).toBe(existingColor);
    expect(nextDoc?.palette[1].id).toBe("col_new");
  });
});

describe("PartEditorPage — onSaveError購読でのトースト表示", () => {
  test("StorageQuotaErrorの場合はstorageQuotaメッセージをトースト表示する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ baseSteps: [makeStep({ id: "stp_1" })] }),
    );
    vi.mocked(saveRecipe).mockRejectedValue(new StorageQuotaError());
    renderPage("/recipe/rcp_1/part/base");

    await screen.findByTestId("step-list-stub");

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByText("change-step-0"));
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

  test("その他のエラーの場合はsaveFailedメッセージをトースト表示する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ baseSteps: [makeStep({ id: "stp_1" })] }),
    );
    vi.mocked(saveRecipe).mockRejectedValue(new Error("boom"));
    renderPage("/recipe/rcp_1/part/base");

    await screen.findByTestId("step-list-stub");

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByText("change-step-0"));
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("保存に失敗しました")).toBeInTheDocument();
    });
  });
});

describe("PartEditorPage — StepPhotoStrip", () => {
  test("写真つき工程がある場合はStepPhotoStripのサムネボタンが表示される", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        baseSteps: [
          makeStep({ id: "stp_1", photoId: null }),
          makeStep({ id: "stp_2", photoId: "pht_1" }),
        ],
      }),
    );
    renderPage("/recipe/rcp_1/part/base");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "STEP 2の写真へ移動" }),
      ).toBeInTheDocument();
    });
  });

  test("写真つき工程が0件の場合はStepPhotoStripが表示されない", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ baseSteps: [makeStep({ id: "stp_1", photoId: null })] }),
    );
    renderPage("/recipe/rcp_1/part/base");

    await screen.findByTestId("step-list-stub");
    expect(
      screen.queryByRole("navigation", { name: "写真つき工程一覧" }),
    ).not.toBeInTheDocument();
  });
});

describe("PartEditorPage — 閉じる操作", () => {
  test("閉じるボタンで/recipe/:idへnavigateする（ネスト子ルートがアンマウントされ、親Overviewのみ残る）", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage("/recipe/rcp_1/part/base");

    await screen.findByTestId("step-list-stub");
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.getByText("Overview画面")).toBeInTheDocument();
    expect(screen.queryByTestId("step-list-stub")).not.toBeInTheDocument();
  });
});

describe("PartEditorPage — ネストルート（親子マッチ・base優先・T44）", () => {
  test("/recipe/:id/part/baseは:partIdより優先してマッチし、baseモードで描画される", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ baseSteps: [makeStep({ id: "stp_1" })] }),
    );
    renderPage("/recipe/rcp_1/part/base");

    await waitFor(() => {
      expect(screen.getByText("ベース工程（全体）")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("textbox", { name: "パーツ名" }),
    ).not.toBeInTheDocument();
  });

  test("/recipe/:id/part/:partIdは親のOverviewを背面に残したままネスト描画する", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({ parts: [{ id: "part_1", name: "腕", steps: [] }] }),
    );
    renderPage("/recipe/rcp_1/part/part_1");

    await screen.findByTestId("step-list-stub");
    expect(screen.getByText("Overview画面")).toBeInTheDocument();
  });
});

describe("PartEditorPage — 戻るリンク", () => {
  test("baseモード: 全体表示へ戻るリンクが/recipe/:idを指す", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc());
    renderPage("/recipe/rcp_1/part/base");

    await screen.findByTestId("step-list-stub");
    const link = screen.getByRole("link", { name: /全体表示へ/ });
    expect(link).toHaveAttribute("href", "/recipe/rcp_1");
  });

  test("通常モード: 全体表示へ戻るリンクが/recipe/:idを指す", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(
      makeDoc({
        parts: [{ id: "part_1", name: "腕", steps: [] }],
      }),
    );
    renderPage("/recipe/rcp_1/part/part_1");

    await screen.findByTestId("step-list-stub");
    const link = screen.getByRole("link", { name: /全体表示へ/ });
    expect(link).toHaveAttribute("href", "/recipe/rcp_1");
  });

  test("partId不存在時（partNotFound）も戻るリンクが表示される", async () => {
    vi.mocked(loadRecipe).mockResolvedValue(makeDoc({ parts: [] }));
    renderPage("/recipe/rcp_1/part/part_missing");

    await waitFor(() => {
      expect(screen.getByText("パーツが見つかりません")).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /全体表示へ/ });
    expect(link).toHaveAttribute("href", "/recipe/rcp_1");
  });
});
