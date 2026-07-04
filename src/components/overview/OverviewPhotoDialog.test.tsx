// components/overview/OverviewPhotoDialog.test.tsx — 全体写真の後日変更ダイアログ
// （2026-07-04 FB-C）
//
// PhotoUploader自体の挙動（アップロード・並び替え・削除）はPhotoUploader.test.tsxで
// 検証済みのため、ここではダイアログとしての開閉・PhotoUploaderへのprops結線
// （recipeId/value/onChange）・useFocusTrap適用（Escapeで閉じる）・
// 条件付きマウント（`{open && <Dialog/>}`）での復帰フォーカスを検証する。
// PhotoUploaderは軽量モックに差し替え、受け取ったpropsをそのまま可視化する。

import "../../i18n";
import { useState } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import OverviewPhotoDialog from "./OverviewPhotoDialog";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

vi.mock("../common/PhotoUploader", () => ({
  default: ({
    recipeId,
    value,
    onChange,
  }: {
    recipeId: string;
    value: string[];
    onChange: (ids: string[]) => void;
  }) => (
    <div data-testid="mock-photo-uploader">
      <span data-testid="mock-recipe-id">{recipeId}</span>
      <span data-testid="mock-value">{value.join(",")}</span>
      <button
        type="button"
        onClick={() => onChange([...value, "pht_new"])}
        data-testid="mock-add-photo"
      >
        add
      </button>
    </div>
  ),
}));

describe("OverviewPhotoDialog — propトグル形態", () => {
  test("open=falseのときは何も描画しない", () => {
    render(
      <OverviewPhotoDialog
        open={false}
        recipeId="r1"
        value={[]}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("open=trueのときrole=dialog・aria-modalを表示し、PhotoUploaderへrecipeId/valueが渡る", () => {
    render(
      <OverviewPhotoDialog
        open
        recipeId="r1"
        value={["pht_1", "pht_2"]}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByTestId("mock-recipe-id")).toHaveTextContent("r1");
    expect(screen.getByTestId("mock-value")).toHaveTextContent("pht_1,pht_2");
  });

  test("PhotoUploaderのonChangeがそのままダイアログのonChangeへ配線される", () => {
    const onChange = vi.fn();
    render(
      <OverviewPhotoDialog
        open
        recipeId="r1"
        value={["pht_1"]}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("mock-add-photo"));
    expect(onChange).toHaveBeenCalledWith(["pht_1", "pht_new"]);
  });

  test("backdropクリックでonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <OverviewPhotoDialog
        open
        recipeId="r1"
        value={[]}
        onChange={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId("overview-photo-dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("ダイアログ本体クリックではonCloseが呼ばれない", () => {
    const onClose = vi.fn();
    render(
      <OverviewPhotoDialog
        open
        recipeId="r1"
        value={[]}
        onChange={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("閉じるボタン押下でonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <OverviewPhotoDialog
        open
        recipeId="r1"
        value={[]}
        onChange={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escapeキー押下でonCloseが呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <OverviewPhotoDialog
        open
        recipeId="r1"
        value={[]}
        onChange={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("OverviewPhotoDialog — 条件付きマウント形態（{open && <Dialog/>}）", () => {
  test("open=falseのときマウントされずdialogは存在しない", () => {
    function ConditionalHost({ open }: { open: boolean }) {
      return (
        <>
          {open && (
            <OverviewPhotoDialog
              open={open}
              recipeId="r1"
              value={[]}
              onChange={vi.fn()}
              onClose={vi.fn()}
            />
          )}
        </>
      );
    }

    render(<ConditionalHost open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("open=trueのときマウントされdialogが描画される", () => {
    function ConditionalHost({ open }: { open: boolean }) {
      return (
        <>
          {open && (
            <OverviewPhotoDialog
              open={open}
              recipeId="r1"
              value={["pht_1"]}
              onChange={vi.fn()}
              onClose={vi.fn()}
            />
          )}
        </>
      );
    }

    render(<ConditionalHost open />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("mock-value")).toHaveTextContent("pht_1");
  });

  test("条件付きアンマウント（open: true→false）で開く前にフォーカスしていた要素へ復帰する", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            outside
          </button>
          {open && (
            <OverviewPhotoDialog
              open={open}
              recipeId="r1"
              value={[]}
              onChange={vi.fn()}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      );
    }

    render(<Host />);
    const outsideButton = screen.getByRole("button", { name: "outside" });
    outsideButton.focus();
    expect(document.activeElement).toBe(outsideButton);

    fireEvent.click(outsideButton);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(outsideButton);
  });
});
