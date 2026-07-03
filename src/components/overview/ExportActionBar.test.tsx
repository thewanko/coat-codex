// components/overview/ExportActionBar.test.tsx — 枠のみ配置（全disabled）のテスト
// （技術計画v2.3 §3.3 ExportActionBar行・T28。結線はT33/T40）
//
// PC幅(>=768px): 従来のピル群がそのまま描画されることを確認。
// mobile幅(<768px, v2.3): 「出力・共有」ボタン1つに集約→タップでボトムシートが
// 開閉すること、シート内に全アクションが存在しJSON・素MDが隣接すること、
// Esc・backdropクリックで閉じることを確認（RTL。matchMediaはここでモックする）。

import "../../i18n";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import i18next from "../../i18n";
import ExportActionBar from "./ExportActionBar";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

type Listener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql: Partial<MediaQueryList> = {
    matches,
    media: "(max-width: 767px)",
    addEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.add(listener as Listener);
    },
    removeEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      listeners.delete(listener as Listener);
    },
    addListener: (listener: Listener | null) => {
      if (listener) listeners.add(listener);
    },
    removeListener: (listener: Listener | null) => {
      if (listener) listeners.delete(listener);
    },
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => mql as MediaQueryList),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExportActionBar — PC幅（従来のピル群）", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  test("印刷・PDF・X・Bluesky・note MD・JSON・素MDの7ボタンをすべてdisabledで配置する", () => {
    render(<ExportActionBar />);

    const labels = ["印刷", "PDF", "X", "Bluesky", "note MD", "JSON", "素MD"];
    for (const label of labels) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toBeDisabled();
    }
  });

  test("JSON・素MDは隣接する結合ピル内に配置される（要件どおりの隣接配置）", () => {
    render(<ExportActionBar />);

    const jsonButton = screen.getByRole("button", { name: "JSON" });
    const mdButton = screen.getByRole("button", { name: "素MD" });
    expect(jsonButton.parentElement).toBe(mdButton.parentElement);
  });

  test("「出力・共有」メニューボタンは描画されない", () => {
    render(<ExportActionBar />);
    expect(
      screen.queryByRole("button", { name: "出力・共有" }),
    ).not.toBeInTheDocument();
  });
});

describe("ExportActionBar — mobile幅（出力・共有ボタン→ボトムシート）", () => {
  beforeEach(() => {
    mockMatchMedia(true);
  });

  test("「出力・共有」ボタン1つに集約され、従来のピル群は描画されない", () => {
    render(<ExportActionBar />);

    expect(
      screen.getByRole("button", { name: "出力・共有" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "印刷" }),
    ).not.toBeInTheDocument();
  });

  test("メニューボタンをタップするとボトムシートが開き、全アクション項目が存在する", () => {
    render(<ExportActionBar />);

    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const labels = ["印刷", "PDF", "X", "Bluesky", "note MD", "JSON", "素MD"];
    for (const label of labels) {
      expect(
        within(dialog).getByRole("button", { name: label }),
      ).toBeDisabled();
    }
  });

  test("JSON・素MDはシート内で隣接する結合グループに配置される（隣接維持）", () => {
    render(<ExportActionBar />);
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    const jsonButton = screen.getByRole("button", { name: "JSON" });
    const mdButton = screen.getByRole("button", { name: "素MD" });
    expect(jsonButton.parentElement).toBe(mdButton.parentElement);
  });

  test("Escapeキーでシートが閉じる", () => {
    render(<ExportActionBar />);
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("backdropクリックでシートが閉じる", () => {
    render(<ExportActionBar />);
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("export-sheet-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("シート内クリックでは閉じない", () => {
    render(<ExportActionBar />);
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("閉じるボタンでシートが閉じる", () => {
    render(<ExportActionBar />);
    fireEvent.click(screen.getByRole("button", { name: "出力・共有" }));

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
