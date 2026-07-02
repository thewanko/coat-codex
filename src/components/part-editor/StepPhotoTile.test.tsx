// components/part-editor/StepPhotoTile.test.tsx — 工程写真1枚タイルのテスト
// （技術計画v2.2 §4.2 T25、デザイン決定稿§8-A）

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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import ToastHost from "../common/ToastHost";
import StepPhotoTile from "./StepPhotoTile";
import {
  savePhoto,
  resolvePhotoUrl,
  deletePhoto,
  StorageQuotaError,
} from "../../db/photoStore";

beforeAll(() => {
  void i18next.changeLanguage("ja");
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

vi.mock("../../db/photoStore", async () => {
  const actual = await vi.importActual<typeof import("../../db/photoStore")>(
    "../../db/photoStore",
  );
  return {
    ...actual,
    savePhoto: vi.fn(),
    resolvePhotoUrl: vi.fn().mockResolvedValue("blob:mock-url"),
    deletePhoto: vi.fn().mockResolvedValue(undefined),
  };
});

function makeFile(name = "photo.png") {
  return new File(["binary"], name, { type: "image/png" });
}

describe("StepPhotoTile — 空タイル", () => {
  test("photoId=nullのとき破線タイル「＋ 写真 1枚」を表示する", () => {
    render(
      <ToastHost>
        <StepPhotoTile
          photoId={null}
          stepIndex={0}
          recipeId="rcp_1"
          onChange={vi.fn()}
        />
      </ToastHost>,
    );
    expect(screen.getByText("＋ 写真 1枚")).toBeInTheDocument();
  });

  test("ファイル選択でsavePhotoが呼ばれ、新しいphotoIdがonChangeへ渡る", async () => {
    vi.mocked(savePhoto).mockResolvedValue("ph_new1");
    const onChange = vi.fn();

    render(
      <ToastHost>
        <StepPhotoTile
          photoId={null}
          stepIndex={2}
          recipeId="rcp_1"
          onChange={onChange}
        />
      </ToastHost>,
    );

    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [makeFile()] },
    });

    await waitFor(() => {
      expect(savePhoto).toHaveBeenCalledWith(expect.any(File), "rcp_1");
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("ph_new1");
    });
  });

  test("StorageQuotaErrorはトースト表示され、onChangeは呼ばれない", async () => {
    vi.mocked(savePhoto).mockRejectedValue(new StorageQuotaError());
    const onChange = vi.fn();

    render(
      <ToastHost>
        <StepPhotoTile
          photoId={null}
          stepIndex={0}
          recipeId="rcp_1"
          onChange={onChange}
        />
      </ToastHost>,
    );

    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [makeFile()] },
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          "容量不足です。写真を減らすか、バックアップ後に不要なレシピを削除してください",
        ),
      ).toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("StepPhotoTile — 写真あり", () => {
  test("photoId非nullのときSTEP nタグとサムネを表示する", async () => {
    render(
      <ToastHost>
        <StepPhotoTile
          photoId="ph_1"
          stepIndex={3}
          recipeId="rcp_1"
          onChange={vi.fn()}
        />
      </ToastHost>,
    );

    await waitFor(() => {
      expect(resolvePhotoUrl).toHaveBeenCalledWith("ph_1");
    });
    expect(await screen.findByText("STEP 4")).toBeInTheDocument();
  });

  test("✕→確認ダイアログの確定でdeletePhotoが呼ばれ、onChange(null)される", async () => {
    const onChange = vi.fn();

    render(
      <ToastHost>
        <StepPhotoTile
          photoId="ph_1"
          stepIndex={0}
          recipeId="rcp_1"
          onChange={onChange}
        />
      </ToastHost>,
    );

    await waitFor(() => {
      expect(resolvePhotoUrl).toHaveBeenCalledWith("ph_1");
    });

    fireEvent.click(screen.getByLabelText("削除"));
    const confirmButton = await screen.findByRole("button", {
      name: "削除する",
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deletePhoto).toHaveBeenCalledWith("ph_1");
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("✕→キャンセルではdeletePhoto/onChangeとも呼ばれない", async () => {
    const onChange = vi.fn();

    render(
      <ToastHost>
        <StepPhotoTile
          photoId="ph_1"
          stepIndex={0}
          recipeId="rcp_1"
          onChange={onChange}
        />
      </ToastHost>,
    );

    await waitFor(() => {
      expect(resolvePhotoUrl).toHaveBeenCalledWith("ph_1");
    });

    fireEvent.click(screen.getByLabelText("削除"));
    const cancelButton = await screen.findByRole("button", {
      name: "キャンセル",
    });
    fireEvent.click(cancelButton);

    expect(deletePhoto).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
