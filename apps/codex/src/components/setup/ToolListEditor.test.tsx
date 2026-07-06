// components/setup/ToolListEditor.test.tsx — ToolListEditorのテスト（技術計画v2.2 §4.2 T23・§2.6）
//
// 追加（重複防止含む）・使用中削除ガード・使用数0削除の各実質ケースを検証する。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import ToolListEditor from "./ToolListEditor";
import type { RecipeDoc, Step, Tool } from "@coat-codex/recipe-core";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return { id: "tool_a", name: "筆", note: null, ...overrides };
}

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "stp_1",
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
    schemaVersion: 1,
    id: "rcp_1",
    title: "テスト",
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

describe("ToolListEditor", () => {
  test("ツール名を入力して追加ボタンを押すとonUpdateへ追加後のtoolsを渡す", () => {
    const doc = makeDoc();
    const onUpdate = vi.fn();

    render(<ToolListEditor doc={doc} onUpdate={onUpdate} />);

    const input = screen.getByPlaceholderText("ツール名");
    fireEvent.change(input, { target: { value: "スポンジ" } });
    fireEvent.click(screen.getByText("＋ ツールを追加"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const updater = onUpdate.mock.calls[0][0] as (d: RecipeDoc) => RecipeDoc;
    const next = updater(doc);
    expect(next.tools).toHaveLength(1);
    expect(next.tools[0].name).toBe("スポンジ");
  });

  test("空白のみの入力では追加しない", () => {
    const doc = makeDoc();
    const onUpdate = vi.fn();
    render(<ToolListEditor doc={doc} onUpdate={onUpdate} />);

    fireEvent.change(screen.getByPlaceholderText("ツール名"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByText("＋ ツールを追加"));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("大文字小文字を無視して既存ツール名と重複する場合は追加しない", () => {
    const existing = makeTool({ id: "tool_a", name: "Brush" });
    const doc = makeDoc({ tools: [existing] });
    const onUpdate = vi.fn();
    render(<ToolListEditor doc={doc} onUpdate={onUpdate} />);

    fireEvent.change(screen.getByPlaceholderText("ツール名"), {
      target: { value: "brush" },
    });
    fireEvent.click(screen.getByText("＋ ツールを追加"));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("使用中（工程から参照）のツールは削除ボタンが無効化され、注記が表示される", () => {
    const toolA = makeTool({ id: "tool_a", name: "筆" });
    const doc = makeDoc({
      tools: [toolA],
      baseSteps: [makeStep({ toolIds: ["tool_a"] })],
    });
    const onUpdate = vi.fn();

    render(<ToolListEditor doc={doc} onUpdate={onUpdate} />);

    expect(screen.getByText("1工程で使用中")).toBeInTheDocument();
    const deleteButton = screen.getByLabelText("削除 筆");
    expect(deleteButton).toBeDisabled();
    expect(
      screen.getByText(
        "↳ 工程で使用中のため削除できません（工程側で外すと削除可）",
      ),
    ).toBeInTheDocument();

    fireEvent.click(deleteButton);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("使用数0のツールは「未使用」バッジ表示・削除でき、削除後の配列は残りの要素の参照を維持する", () => {
    const toolA = makeTool({ id: "tool_a", name: "A" });
    const toolB = makeTool({ id: "tool_b", name: "B" });
    const doc = makeDoc({ tools: [toolA, toolB] });
    const onUpdate = vi.fn();

    render(<ToolListEditor doc={doc} onUpdate={onUpdate} />);

    expect(screen.getAllByText("未使用")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("削除 A"));

    const updater = onUpdate.mock.calls[0][0] as (d: RecipeDoc) => RecipeDoc;
    const next = updater(doc);
    expect(next.tools).toHaveLength(1);
    expect(next.tools[0]).toBe(toolB);
  });
});
