import "../../i18n";
import { describe, expect, test, vi, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "../../i18n";
import PhotoUploader from "./PhotoUploader";
import ToastHost from "./ToastHost";
import { savePhoto, StorageQuotaError } from "../../db/photoStore";

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
    revokePhotoUrl: vi.fn(),
  };
});

vi.mock("../../db/db", () => ({
  db: {
    photos: {
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

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
});
