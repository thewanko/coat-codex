// components/setup/OverviewPhotoUploader.test.tsx — PhotoUploaderへの結線を検証する
// （技術計画v2.2 §4.2 T23: T18 PhotoUploader再利用・先頭=代表）。

import "../../i18n";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "../../i18n";
import OverviewPhotoUploader from "./OverviewPhotoUploader";
import ToastHost from "../common/ToastHost";
import { savePhoto } from "../../db/photoStore";

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
  };
});

describe("OverviewPhotoUploader", () => {
  test("先頭のタイルにCOVERタグが表示される", () => {
    render(
      <ToastHost>
        <OverviewPhotoUploader
          recipeId="rcp_1"
          value={["ph_a", "ph_b"]}
          onChange={vi.fn()}
        />
      </ToastHost>,
    );

    expect(screen.getAllByText("COVER")).toHaveLength(1);
  });

  test("写真追加でsavePhotoが呼ばれrecipeIdが渡る", async () => {
    vi.mocked(savePhoto).mockResolvedValue("ph_new");
    const onChange = vi.fn();

    render(
      <ToastHost>
        <OverviewPhotoUploader
          recipeId="rcp_1"
          value={[]}
          onChange={onChange}
        />
      </ToastHost>,
    );

    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [new File(["binary"], "a.png", { type: "image/png" })],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(savePhoto).toHaveBeenCalledWith(expect.any(File), "rcp_1");
  });
});
