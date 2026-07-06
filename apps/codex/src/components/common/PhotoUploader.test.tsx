import "../../i18n";
import { useState } from "react";
import { describe, expect, test, vi, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import PhotoUploader from "./PhotoUploader";
import ToastHost from "./ToastHost";
import { savePhoto, deletePhoto, StorageQuotaError } from "../../db/photoStore";

beforeAll(() => {
  void i18next.changeLanguage("ja");
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

describe("PhotoUploader", () => {
  beforeEach(() => {
    vi.mocked(savePhoto).mockReset();
  });

  test("selecting a file calls savePhoto and reports the new photoId via onChange", async () => {
    vi.mocked(savePhoto).mockResolvedValue("ph_new1");
    const onChange = vi.fn();

    render(
      <ToastHost>
        <PhotoUploader recipeId="r1" value={[]} onChange={onChange} />
      </ToastHost>,
    );

    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [makeFile()] },
    });

    await waitFor(() => {
      expect(savePhoto).toHaveBeenCalledWith(expect.any(File), "r1");
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(["ph_new1"]);
    });
  });

  test("StorageQuotaError from savePhoto surfaces as a toast and does not call onChange", async () => {
    vi.mocked(savePhoto).mockRejectedValue(new StorageQuotaError());
    const onChange = vi.fn();

    render(
      <ToastHost>
        <PhotoUploader recipeId="r1" value={[]} onChange={onChange} />
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

  test("削除確定でdeletePhotoが呼ばれ、onChangeから該当photoIdが除かれる", async () => {
    const onChange = vi.fn();

    render(
      <ToastHost>
        <PhotoUploader
          recipeId="r1"
          value={["ph_a", "ph_b"]}
          onChange={onChange}
        />
      </ToastHost>,
    );

    const deleteButtons = screen.getAllByLabelText("削除");
    fireEvent.click(deleteButtons[0]);

    const confirmButton = await screen.findByRole("button", {
      name: "削除する",
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deletePhoto).toHaveBeenCalledWith("ph_a");
    });
    expect(onChange).toHaveBeenCalledWith(["ph_b"]);
  });

  test("cropsもonCropChangeも未指定なら従来挙動のまま（トリミングボタンなし）", async () => {
    const onChange = vi.fn();
    render(
      <ToastHost>
        <PhotoUploader recipeId="r1" value={["ph_a"]} onChange={onChange} />
      </ToastHost>,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "トリミング" }),
      ).not.toBeInTheDocument();
    });
  });

  test("単発アップロード完了直後にクロップダイアログが自動で開く", async () => {
    vi.mocked(savePhoto).mockResolvedValue("ph_new1");
    const onChange = vi.fn();
    const onCropChange = vi.fn();

    render(
      <ToastHost>
        <PhotoUploader
          recipeId="r1"
          value={[]}
          onChange={onChange}
          onCropChange={onCropChange}
        />
      </ToastHost>,
    );

    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [makeFile()] },
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("photo-crop-dialog-backdrop"),
      ).toBeInTheDocument();
    });
  });

  test("複数枚アップロードではクロップダイアログを自動で開かない", async () => {
    vi.mocked(savePhoto)
      .mockResolvedValueOnce("ph_new1")
      .mockResolvedValueOnce("ph_new2");
    const onChange = vi.fn();
    const onCropChange = vi.fn();

    render(
      <ToastHost>
        <PhotoUploader
          recipeId="r1"
          value={[]}
          onChange={onChange}
          onCropChange={onCropChange}
        />
      </ToastHost>,
    );

    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [makeFile("a.png"), makeFile("b.png")] },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(["ph_new1", "ph_new2"]);
    });
    expect(
      screen.queryByTestId("photo-crop-dialog-backdrop"),
    ).not.toBeInTheDocument();
  });

  test("トリミングアクション→ダイアログ→適用でonCropChangeへ到達する", async () => {
    const onChange = vi.fn();
    const onCropChange = vi.fn();

    render(
      <ToastHost>
        <PhotoUploader
          recipeId="r1"
          value={["ph_a"]}
          onChange={onChange}
          onCropChange={onCropChange}
        />
      </ToastHost>,
    );

    const trimButton = await screen.findByRole("button", {
      name: "トリミング",
    });
    fireEvent.click(trimButton);

    await waitFor(() => {
      expect(
        screen.getByTestId("photo-crop-dialog-backdrop"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("適用"));

    expect(onCropChange).toHaveBeenCalledWith("ph_a", {
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  });

  test("ダイアログ表示中に連続で単発アップロードしても、表示中のcropTargetIdが差し替わらない", async () => {
    vi.mocked(savePhoto)
      .mockResolvedValueOnce("ph_new1")
      .mockResolvedValueOnce("ph_new2");
    const onCropChange = vi.fn();

    function Wrapper() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <PhotoUploader
          recipeId="r1"
          value={value}
          onChange={setValue}
          onCropChange={onCropChange}
        />
      );
    }

    render(
      <ToastHost>
        <Wrapper />
      </ToastHost>,
    );

    const input = document.querySelector('input[type="file"]');

    // 1回目の単発アップロード→自動オープン
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [makeFile("a.png")] },
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("photo-crop-dialog-backdrop"),
      ).toBeInTheDocument();
    });

    // ダイアログ表示中に2回目の単発アップロード→cropTargetIdは差し替わらない
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [makeFile("b.png")] },
    });
    await waitFor(() => {
      expect(savePhoto).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByText("適用"));

    // 差し替わっていれば"ph_new2"が呼ばれるはずだが、表示中だった1枚目"ph_new1"のまま
    expect(onCropChange).toHaveBeenCalledWith("ph_new1", {
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  });
});
