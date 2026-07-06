// components/part-editor/StepCard.test.tsx — StepCard組み立てのテスト（技術計画v2.2 §4.2 T25）
//
// PaintSlotList（内部でPaintPicker→paintPresets fetchに依存）はT21で個別にテスト済みのため、
// ここではスタブに差し替えてStepCard側の結線（technique/toolIds/memo/photoId/削除）に
// テストを集中させる。db/photoStoreはPhotoUploader.test.tsxと同様にモックする。

import "../../i18n";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import type { Step } from "../../models/recipe";
import {
  useRecipeStore,
  __resetRecipeStoreForTest,
} from "../../stores/useRecipeStore";
import ToastHost from "../common/ToastHost";
import StepCard from "./StepCard";
import type { MixState } from "../../lib/mixRatio";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

afterEach(() => {
  __resetRecipeStoreForTest();
  vi.restoreAllMocks();
});

vi.mock("./PaintSlotList", () => ({
  default: ({
    onChange,
  }: {
    state: MixState;
    onChange: (next: MixState) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange({ paints: [{ colorId: "col_x" }], mix: null })}
    >
      paint-slot-list-stub
    </button>
  ),
}));

vi.mock("../../db/photoStore", () => ({
  savePhoto: vi.fn(),
  resolvePhotoUrl: vi.fn().mockResolvedValue(null),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
}));

import { savePhoto, deletePhoto } from "../../db/photoStore";

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_1",
    technique: { presetKey: "wash", label: null },
    photoId: null,
    paints: [],
    mix: null,
    toolIds: [],
    memo: "",
    ...overrides,
  };
}

function renderStepCard(
  step: Step,
  props: Partial<{
    index: number;
    onChange: (next: Step) => void;
    onAddColor: (color: unknown) => void;
    onDelete: () => void;
  }> = {},
) {
  useRecipeStore.setState({
    doc: {
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
    },
  });

  const onChange = props.onChange ?? vi.fn();
  const onAddColor = props.onAddColor ?? vi.fn();
  const onDelete = props.onDelete ?? vi.fn();

  render(
    <ToastHost>
      <StepCard
        step={step}
        index={props.index ?? 0}
        recipeId="rcp_1"
        palette={[]}
        onChange={onChange}
        onAddColor={onAddColor}
        onDelete={onDelete}
      />
    </ToastHost>,
  );

  return { onChange, onAddColor, onDelete };
}

describe("StepCard — STEP n表示", () => {
  test("indexに応じてSTEP n（1始まり）のラベルを表示する", () => {
    renderStepCard(makeStep(), { index: 2 });
    expect(screen.getByText("STEP 3")).toBeInTheDocument();
  });
});

describe("StepCard — TechniqueSelect結線", () => {
  test("technique変更がonChangeへ即時反映される", () => {
    const { onChange } = renderStepCard(
      makeStep({ technique: { presetKey: "wash", label: null } }),
    );
    const select = screen.getByLabelText("技法") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "glaze" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        technique: { presetKey: "glaze", label: null },
      }),
    );
  });
});

describe("StepCard — ToolSelect結線", () => {
  test("tools選択でtoolIdsがonChangeへ反映される", () => {
    useRecipeStore.setState({
      doc: {
        schemaVersion: 1,
        id: "rcp_1",
        title: "テストレシピ",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        overviewPhotoIds: [],
        palette: [],
        tools: [{ id: "tool_1", name: "丸筆", note: null }],
        baseSteps: [],
        parts: [],
        photoCrops: {},
      },
    });
    const onChange = vi.fn();
    render(
      <ToastHost>
        <StepCard
          step={makeStep()}
          index={0}
          recipeId="rcp_1"
          palette={[]}
          onChange={onChange}
          onAddColor={vi.fn()}
          onDelete={vi.fn()}
        />
      </ToastHost>,
    );

    fireEvent.click(screen.getByLabelText("丸筆"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ toolIds: ["tool_1"] }),
    );
  });
});

describe("StepCard — MemoField結線", () => {
  test("memo変更がonChangeへ反映される", () => {
    const { onChange } = renderStepCard(makeStep({ memo: "" }));
    const textarea = screen.getByLabelText("メモ") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "薄め液を追加" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ memo: "薄め液を追加" }),
    );
  });
});

describe("StepCard — PaintSlotList結線", () => {
  test("PaintSlotListのonChangeがStep.paints/mixへ反映される（pendingスロットもそのまま透過する）", () => {
    const { onChange } = renderStepCard(makeStep());
    fireEvent.click(screen.getByText("paint-slot-list-stub"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ paints: [{ colorId: "col_x" }], mix: null }),
    );
  });
});

describe("StepCard — StepPhotoTile結線・✕解除", () => {
  test("写真アップロードでStep.photoIdがonChangeへ反映される", async () => {
    vi.mocked(savePhoto).mockResolvedValue("ph_new1");
    const { onChange } = renderStepCard(makeStep({ photoId: null }));

    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ photoId: "ph_new1" }),
      );
    });
  });

  test("✕解除でdeletePhotoが呼ばれ、Step.photoIdがnullへ反映される", async () => {
    const { onChange } = renderStepCard(makeStep({ photoId: "ph_existing" }));

    fireEvent.click(await screen.findByLabelText("削除"));
    const confirmButton = await screen.findByRole("button", {
      name: "削除する",
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deletePhoto).toHaveBeenCalledWith("ph_existing");
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ photoId: null }),
    );
  });
});

describe("StepCard — 工程削除", () => {
  test("削除ボタン→確認ダイアログの確定でonDeleteが呼ばれる", () => {
    const { onDelete } = renderStepCard(makeStep());

    fireEvent.click(screen.getByRole("button", { name: "工程を削除" }));
    const confirmButton = screen.getByRole("button", { name: "削除する" });
    fireEvent.click(confirmButton);

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test("削除ボタン→キャンセルではonDeleteは呼ばれない", () => {
    const { onDelete } = renderStepCard(makeStep());

    fireEvent.click(screen.getByRole("button", { name: "工程を削除" }));
    const cancelButton = screen.getByRole("button", { name: "キャンセル" });
    fireEvent.click(cancelButton);

    expect(onDelete).not.toHaveBeenCalled();
  });
});
