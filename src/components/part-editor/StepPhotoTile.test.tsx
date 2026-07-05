// components/part-editor/StepPhotoTile.test.tsx — 工程写真1枚タイルのテスト
// （技術計画v2.2 §4.2 T25、デザイン決定稿§8-A）

import "../../i18n";
import { useState } from "react";
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

describe("StepPhotoTile — クロップ導線（crop/onCropChange指定時のみ）", () => {
  test("crop/onCropChange未指定なら従来挙動のまま（トリミングボタンなし）", async () => {
    render(
      <ToastHost>
        <StepPhotoTile
          photoId="ph_1"
          stepIndex={0}
          recipeId="rcp_1"
          onChange={vi.fn()}
        />
      </ToastHost>,
    );
    await waitFor(() => {
      expect(resolvePhotoUrl).toHaveBeenCalledWith("ph_1");
    });
    expect(
      screen.queryByRole("button", { name: "トリミング" }),
    ).not.toBeInTheDocument();
  });

  test("アップロード完了直後にクロップダイアログが自動で開く", async () => {
    vi.mocked(savePhoto).mockResolvedValue("ph_new1");
    const onCropChange = vi.fn();

    // 実運用（StepCard経由）ではonChange(photoId)を受けた親がstep.photoIdを更新して
    // 再レンダーする。それを模した薄いstatefulラッパーで検証する。
    function Wrapper() {
      const [photoId, setPhotoId] = useState<string | null>(null);
      return (
        <StepPhotoTile
          photoId={photoId}
          stepIndex={0}
          recipeId="rcp_1"
          onChange={setPhotoId}
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
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [makeFile()] },
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("photo-crop-dialog-backdrop"),
      ).toBeInTheDocument();
    });
  });

  test("StepCardと同じ条件配線（空タイル時点ではonCropChangeがphotoId解決待ち）でも、アップロード後の自動オープン→適用で新photoIdを伴ってonCropChangeが呼ばれる", async () => {
    vi.mocked(savePhoto).mockResolvedValue("ph_new1");
    const onCropChange = vi.fn();

    // StepCard.tsxの実配線を再現する: onCropChangeプロパティ自体は
    // （photoIdの有無に関わらず）常にStepPhotoTileへ渡すが、内部で
    // 最新のphotoId（クロージャではなくレンダー時点の値）が無ければ何もしない。
    // これにより、修正前の「photoId===null時はonCropChange自体がundefined」という
    // 誤った条件配線（cropEnabled=falseとなり自動オープンが不発）とは異なる実態を検証する。
    function StepCardLikeWrapper() {
      const [photoId, setPhotoId] = useState<string | null>(null);
      return (
        <StepPhotoTile
          photoId={photoId}
          stepIndex={0}
          recipeId="rcp_1"
          onChange={setPhotoId}
          onCropChange={(next) => {
            if (photoId) {
              onCropChange(photoId, next);
            }
          }}
        />
      );
    }

    render(
      <ToastHost>
        <StepCardLikeWrapper />
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

    fireEvent.click(screen.getByText("適用"));

    expect(onCropChange).toHaveBeenCalledWith("ph_new1", {
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  });

  test("トリミングアクション→ダイアログ→リセットでonCropChange(null)へ到達する", async () => {
    const onCropChange = vi.fn();

    render(
      <ToastHost>
        <StepPhotoTile
          photoId="ph_1"
          stepIndex={0}
          recipeId="rcp_1"
          onChange={vi.fn()}
          crop={{ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }}
          onCropChange={onCropChange}
        />
      </ToastHost>,
    );

    await waitFor(() => {
      expect(resolvePhotoUrl).toHaveBeenCalledWith("ph_1");
    });

    fireEvent.click(screen.getByRole("button", { name: "トリミング" }));

    await waitFor(() => {
      expect(
        screen.getByTestId("photo-crop-dialog-backdrop"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("リセット（クロップ解除）"));

    expect(onCropChange).toHaveBeenCalledWith(null);
  });
});
