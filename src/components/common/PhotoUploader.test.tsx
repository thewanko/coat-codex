import "../../i18n";
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
});
