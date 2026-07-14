// routes/RecipeSetupPage.tsx — 10-1 初期入力（技術計画v2.3 §3.3・§4.2 T23）
//
// 編集中レシピの供給はuseRecipeStore（T16）を使う。load(:id)をURLパラメータで呼び、
// 更新はupdateRecipe(updater)経由（autosave debounce 500msはストアの責務）。
// ロード失敗（UnsupportedSchemaError/CorruptRecipeError。setup.loadError）・
// レシピ不存在（loadRecipeがnullを返す場合。setup.notFound）の表示も用意する。
//
// v2.3: 使用カラーの先行登録（PaletteEditor）は廃止。色は工程のPaintPickerからのみ
// 追加され、参照0になったpalette色は保存時にuseRecipeStoreがgcUnusedPaletteColorsで
// 自動除去する（§4.2 M4必須事項③）。

import { useEffect } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useRecipeStore } from "../stores/useRecipeStore";
import Skeleton from "../components/common/Skeleton";
import BackLink from "../components/common/BackLink";
import TitleInput from "../components/setup/TitleInput";
import OverviewPhotoUploader from "../components/setup/OverviewPhotoUploader";
import MakeCodexButton from "../components/setup/MakeCodexButton";
import ImportJsonSection from "../components/setup/ImportJsonSection";
import styles from "./RecipeSetupPage.module.css";
import sectionStyles from "../components/setup/SetupSection.module.css";

function RecipeSetupPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const doc = useRecipeStore((state) => state.doc);
  const isLoading = useRecipeStore((state) => state.isLoading);
  const loadError = useRecipeStore((state) => state.loadError);
  const load = useRecipeStore((state) => state.load);
  const updateRecipe = useRecipeStore((state) => state.updateRecipe);

  useEffect(() => {
    if (id) {
      void load(id);
    }
  }, [id, load]);

  if (isLoading) {
    return (
      <div className={styles.root}>
        <Skeleton variant="card" />
      </div>
    );
  }

  if (loadError !== null) {
    return (
      <div className={styles.root}>
        <p className={styles.error}>{t("setup.loadError")}</p>
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className={styles.root}>
        <p className={styles.error}>{t("setup.notFound")}</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.backLink}>
        <BackLink to="/" label={t("nav.backToLibrary")} />
      </div>

      <TitleInput
        value={doc.title}
        onCommit={(title) => updateRecipe((current) => ({ ...current, title }))}
      />

      <OverviewPhotoUploader
        recipeId={doc.id}
        value={doc.overviewPhotoIds}
        onChange={(overviewPhotoIds) =>
          updateRecipe((current) => ({ ...current, overviewPhotoIds }))
        }
        crops={doc.photoCrops}
        onCropChange={(photoId, crop) =>
          updateRecipe((current) => {
            if (crop === null) {
              const nextEntries = Object.entries(current.photoCrops).filter(
                ([id]) => id !== photoId,
              );
              return {
                ...current,
                photoCrops: Object.fromEntries(nextEntries),
              };
            }
            return {
              ...current,
              photoCrops: { ...current.photoCrops, [photoId]: crop },
            };
          })
        }
      />

      <section className={sectionStyles.section}>
        <h2 className={sectionStyles.heading}>{t("setup.toolsLabel")}</h2>
        <p className={styles.toolLibraryHint}>
          {t("setup.toolLibraryHint")}{" "}
          <Link to="/tools" className={styles.toolLibraryHintLink}>
            {t("nav.tools")}
          </Link>
        </p>
      </section>

      <ImportJsonSection />

      <div className={styles.footer}>
        <MakeCodexButton recipeId={doc.id} />
      </div>
    </div>
  );
}

export default RecipeSetupPage;
