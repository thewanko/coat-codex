import "../../i18n";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18next from "../../i18n";
import type { RecipeDoc } from "@coat-codex/recipe-core";
import type { UserToolRecord } from "../../db/db";
import {
  useRecipeStore,
  __resetRecipeStoreForTest,
} from "../../stores/useRecipeStore";
import { listUserTools, registerUserTool } from "../../db/toolStore";
import ToolSelect from "./ToolSelect";

vi.mock("../../db/toolStore", async () => {
  const actual =
    await vi.importActual<typeof import("../../db/toolStore")>(
      "../../db/toolStore",
    );
  return {
    ...actual,
    listUserTools: vi
      .fn<() => Promise<UserToolRecord[]>>()
      .mockResolvedValue([]),
    registerUserTool: vi
      .fn()
      .mockResolvedValue({ tool: { id: "utool_1" }, created: true }),
  };
});

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function makeLibraryTool(
  overrides: Partial<UserToolRecord> = {},
): UserToolRecord {
  return {
    id: `utool_${Math.random().toString(36).slice(2)}`,
    name: "丸筆",
    note: null,
    tags: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

afterEach(() => {
  __resetRecipeStoreForTest();
  vi.mocked(registerUserTool).mockClear();
  vi.mocked(listUserTools).mockReset();
  vi.mocked(listUserTools).mockResolvedValue([]);
});

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

describe("ToolSelect", () => {
  test("tools空のときでも追加フォーム（名前入力＋追加ボタン）を直接表示する", () => {
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);
    expect(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
    expect(
      screen.queryByText("Setup画面でツールを登録すると選択できます"),
    ).not.toBeInTheDocument();
  });

  test("useRecipeStoreのtoolsを候補として表示する", () => {
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [
          { id: "tool_1", name: "丸筆", note: null },
          { id: "tool_2", name: "スポンジ", note: null },
        ],
      }),
    });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);
    expect(screen.getByLabelText("丸筆")).toBeInTheDocument();
    expect(screen.getByLabelText("スポンジ")).toBeInTheDocument();
  });

  test("valueに含まれるtoolIdはチェック済みで表示される", () => {
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [{ id: "tool_1", name: "丸筆", note: null }],
      }),
    });
    render(<ToolSelect value={["tool_1"]} onChange={vi.fn()} />);
    expect(screen.getByLabelText("丸筆")).toBeChecked();
  });

  test("未選択項目をチェックするとvalueへ追加される", () => {
    const onChange = vi.fn();
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [
          { id: "tool_1", name: "丸筆", note: null },
          { id: "tool_2", name: "スポンジ", note: null },
        ],
      }),
    });
    render(<ToolSelect value={["tool_1"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("スポンジ"));
    expect(onChange).toHaveBeenCalledWith(["tool_1", "tool_2"]);
  });

  test("選択済み項目のチェックを外すとvalueから除外される（重複不可の裏返し）", () => {
    const onChange = vi.fn();
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [
          { id: "tool_1", name: "丸筆", note: null },
          { id: "tool_2", name: "スポンジ", note: null },
        ],
      }),
    });
    render(<ToolSelect value={["tool_1", "tool_2"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("丸筆"));
    expect(onChange).toHaveBeenCalledWith(["tool_2"]);
  });

  test("doc未ロード（null）のときはtools0件扱いで追加フォームを直接表示する", () => {
    useRecipeStore.setState({ doc: null });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);
    expect(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
    ).toBeInTheDocument();
  });

  test("新規名を入力して追加すると、storeのtoolsへ登録されonChangeへ新toolIdが渡される", () => {
    const onChange = vi.fn();
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    render(<ToolSelect value={[]} onChange={onChange} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      {
        target: { value: "刷毛" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    const storeTools = useRecipeStore.getState().doc?.tools ?? [];
    expect(storeTools).toHaveLength(1);
    expect(storeTools[0].name).toBe("刷毛");
    expect(storeTools[0].id).toMatch(/^tool_/);
    expect(onChange).toHaveBeenCalledWith([storeTools[0].id]);
  });

  test("同名（大小文字違い）を入力すると既存ツールIDが再利用され新規登録されない", () => {
    const onChange = vi.fn();
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [{ id: "tool_1", name: "Airbrush", note: null }],
      }),
    });
    render(<ToolSelect value={[]} onChange={onChange} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      {
        target: { value: "  airbrush  " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    const storeTools = useRecipeStore.getState().doc?.tools ?? [];
    expect(storeTools).toHaveLength(1);
    expect(onChange).toHaveBeenCalledWith(["tool_1"]);
  });

  test("空入力（トリム後空文字）で追加を押しても何も起きない", () => {
    const onChange = vi.fn();
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    render(<ToolSelect value={[]} onChange={onChange} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      {
        target: { value: "   " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(useRecipeStore.getState().doc?.tools ?? []).toHaveLength(0);
  });

  test("追加してもbaseSteps/parts等、変更のないdocプロパティの参照は維持される（M4必須事項②）", () => {
    const baseSteps = makeDoc().baseSteps;
    const parts = makeDoc().parts;
    const palette = makeDoc().palette;
    useRecipeStore.setState({
      doc: makeDoc({ tools: [], baseSteps, parts, palette }),
    });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      {
        target: { value: "刷毛" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    const nextDoc = useRecipeStore.getState().doc;
    expect(nextDoc?.baseSteps).toBe(baseSteps);
    expect(nextDoc?.parts).toBe(parts);
    expect(nextDoc?.palette).toBe(palette);
  });

  test("新規名を追加するとregisterUserToolがtrim後の名前で1回呼ばれる（技術計画v2.6 T55）", () => {
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      {
        target: { value: "刷毛" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(registerUserTool).toHaveBeenCalledTimes(1);
    expect(registerUserTool).toHaveBeenCalledWith({ name: "刷毛" });
  });

  test("既存同名（大小文字違い）の追加操作ではregisterUserToolを呼ばない（T55）", () => {
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [{ id: "tool_1", name: "Airbrush", note: null }],
      }),
    });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      {
        target: { value: "  airbrush  " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(registerUserTool).not.toHaveBeenCalled();
  });

  test("ライブラリ候補（T56）: サジェスト節が表示され候補nameが見える", async () => {
    vi.mocked(listUserTools).mockResolvedValue([
      makeLibraryTool({ id: "utool_1", name: "丸筆" }),
      makeLibraryTool({ id: "utool_2", name: "スポンジ" }),
    ]);
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    renderWithRouter(<ToolSelect value={[]} onChange={vi.fn()} />);

    expect(await screen.findByText("ライブラリから追加")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "丸筆" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "スポンジ" }),
    ).toBeInTheDocument();
  });

  test("候補クリックでdoc.toolsに{name, note}がコピーされ、当該工程のtoolIdsへチェックされる", async () => {
    const onChange = vi.fn();
    vi.mocked(listUserTools).mockResolvedValue([
      makeLibraryTool({ id: "utool_1", name: "丸筆", note: "細め" }),
    ]);
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    renderWithRouter(<ToolSelect value={[]} onChange={onChange} />);

    fireEvent.click(await screen.findByRole("button", { name: "丸筆" }));

    const storeTools = useRecipeStore.getState().doc?.tools ?? [];
    expect(storeTools).toHaveLength(1);
    expect(storeTools[0].name).toBe("丸筆");
    expect(storeTools[0].note).toBe("細め");
    expect(storeTools[0].id).toMatch(/^tool_/);
    expect(onChange).toHaveBeenCalledWith([storeTools[0].id]);
  });

  test("doc.toolsに同名（大小文字違い）が既にあるライブラリツールは候補に出ない（dedupe）", async () => {
    vi.mocked(listUserTools).mockResolvedValue([
      makeLibraryTool({ id: "utool_1", name: "Airbrush" }),
      makeLibraryTool({ id: "utool_2", name: "スポンジ" }),
    ]);
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [{ id: "tool_1", name: "airbrush", note: null }],
      }),
    });
    renderWithRouter(<ToolSelect value={[]} onChange={vi.fn()} />);

    expect(
      await screen.findByRole("button", { name: "スポンジ" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Airbrush" }),
    ).not.toBeInTheDocument();
  });

  test("draft入力で候補名の部分一致絞り込みができる（typeahead兼務）", async () => {
    vi.mocked(listUserTools).mockResolvedValue([
      makeLibraryTool({ id: "utool_1", name: "丸筆" }),
      makeLibraryTool({ id: "utool_2", name: "スポンジ" }),
    ]);
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    renderWithRouter(<ToolSelect value={[]} onChange={vi.fn()} />);

    await screen.findByRole("button", { name: "丸筆" });
    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      { target: { value: "スポ" } },
    );

    expect(
      screen.queryByRole("button", { name: "丸筆" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "スポンジ" }),
    ).toBeInTheDocument();
  });

  test("タグチップの単一選択トグルで絞り込み、再クリックで解除できる", async () => {
    vi.mocked(listUserTools).mockResolvedValue([
      makeLibraryTool({ id: "utool_1", name: "丸筆", tags: ["筆"] }),
      makeLibraryTool({
        id: "utool_2",
        name: "スポンジ",
        tags: ["スポンジ系"],
      }),
    ]);
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    renderWithRouter(<ToolSelect value={[]} onChange={vi.fn()} />);

    await screen.findByRole("button", { name: "丸筆" });
    fireEvent.click(screen.getByRole("button", { name: "#筆" }));

    expect(screen.getByRole("button", { name: "丸筆" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "スポンジ" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "#筆" }));

    expect(
      screen.getByRole("button", { name: "スポンジ" }),
    ).toBeInTheDocument();
  });

  test("ライブラリ0件のときはサジェスト節ごと非表示になる", async () => {
    vi.mocked(listUserTools).mockResolvedValue([]);
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    renderWithRouter(<ToolSelect value={[]} onChange={vi.fn()} />);

    await waitFor(() => {
      expect(vi.mocked(listUserTools)).toHaveBeenCalled();
    });
    expect(screen.queryByText("ライブラリから追加")).not.toBeInTheDocument();
  });

  test("ツールライブラリ管理画面への導線リンク（/tools）が表示される", async () => {
    vi.mocked(listUserTools).mockResolvedValue([
      makeLibraryTool({ id: "utool_1", name: "丸筆" }),
    ]);
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    renderWithRouter(<ToolSelect value={[]} onChange={vi.fn()} />);

    const link = await screen.findByRole("link", {
      name: "ツールライブラリを管理",
    });
    expect(link).toHaveAttribute("href", "/tools");
  });

  test("使用数0のツール行の✕は活性で、クリックするとdoc.toolsから消える（技術計画v2.6 T57）", () => {
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [
          { id: "tool_1", name: "丸筆", note: null },
          { id: "tool_2", name: "スポンジ", note: null },
        ],
      }),
    });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);

    const removeButton = screen.getByRole("button", { name: "削除 丸筆" });
    expect(removeButton).not.toBeDisabled();
    fireEvent.click(removeButton);

    const storeTools = useRecipeStore.getState().doc?.tools ?? [];
    expect(storeTools).toHaveLength(1);
    expect(storeTools[0].id).toBe("tool_2");
  });

  test("他の工程で使用中のツールは✕がdisabledになり使用中注記が表示される（T57）", () => {
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [{ id: "tool_1", name: "丸筆", note: null }],
        baseSteps: [
          {
            id: "stp_1",
            technique: { presetKey: null, label: null },
            photoId: null,
            paints: [],
            mix: null,
            toolIds: ["tool_1"],
            memo: "",
          },
        ],
      }),
    });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);

    const removeButton = screen.getByRole("button", { name: "削除 丸筆" });
    expect(removeButton).toBeDisabled();
    expect(
      screen.getByText(
        "↳ 工程で使用中のため削除できません（工程側で外すと削除可）",
      ),
    ).toBeInTheDocument();
  });

  test("タグ選択→当該タグの唯一の候補をコピーしても、絞り込みがstuckにならず残り候補が表示され続ける（review R1 L1）", async () => {
    vi.mocked(listUserTools).mockResolvedValue([
      makeLibraryTool({ id: "utool_1", name: "丸筆", tags: ["筆"] }),
      makeLibraryTool({
        id: "utool_2",
        name: "スポンジ",
        tags: ["スポンジ系"],
      }),
    ]);
    useRecipeStore.setState({ doc: makeDoc({ tools: [] }) });
    renderWithRouter(<ToolSelect value={[]} onChange={vi.fn()} />);

    await screen.findByRole("button", { name: "丸筆" });
    fireEvent.click(screen.getByRole("button", { name: "#筆" }));
    expect(
      screen.queryByRole("button", { name: "スポンジ" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "丸筆" }));

    expect(
      screen.queryByRole("button", { name: "丸筆" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "スポンジ" }),
    ).toBeInTheDocument();
  });

  test("NFC合成形と分解形の同名ツールは既存として扱われ、新規Toolは作られない（review R1 L2）", () => {
    // "\u304C"（NFC合成形の"が"）と"\u304B\u3099"（NFD分解形: "か"+結合濁点）は
    // 見た目・意味は同一だがcode point列が異なる。
    const composed = "\u304C";
    const decomposed = "\u304B\u3099";
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [{ id: "tool_1", name: decomposed, note: null }],
      }),
    });
    render(<ToolSelect value={[]} onChange={vi.fn()} />);

    fireEvent.change(
      screen.getByPlaceholderText("ツール名（例: 筆、エアブラシ）"),
      { target: { value: composed } },
    );
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    const storeTools = useRecipeStore.getState().doc?.tools ?? [];
    expect(storeTools).toHaveLength(1);
    expect(storeTools[0].id).toBe("tool_1");
    expect(registerUserTool).not.toHaveBeenCalled();
  });

  test("当該工程でチェック中（value含む）のツールも✕がdisabledになる（T57）", () => {
    useRecipeStore.setState({
      doc: makeDoc({
        tools: [{ id: "tool_1", name: "丸筆", note: null }],
      }),
    });
    render(<ToolSelect value={["tool_1"]} onChange={vi.fn()} />);

    const removeButton = screen.getByRole("button", { name: "削除 丸筆" });
    expect(removeButton).toBeDisabled();
    expect(
      screen.getByText(
        "↳ 工程で使用中のため削除できません（工程側で外すと削除可）",
      ),
    ).toBeInTheDocument();
  });
});
