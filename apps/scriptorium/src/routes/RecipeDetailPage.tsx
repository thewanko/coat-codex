// routes/RecipeDetailPage.tsx — レシピ詳細（技術計画v1 §5.1・§5.2）
//
// recipe-ui のアトム（SwatchChip・StepListView等）＋recipe-coreのロジックを組んだ新実装
// （ページ層は共有しない。§5.2）。表示は publishedToExportFile ブリッジで PublishedRecipe を
// RecipeDoc形へ持ち上げてから渡す（StepListViewのStep型を満たすため。photoId=null等を補完）。

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { publishedToExportFile, type RecipeDoc } from "@coat-codex/recipe-core";
import { SwatchChip, StepListView } from "@coat-codex/recipe-ui";
import { fetchRecipeDetail, type RecipeDetailResponse } from "../lib/api";
import { buildImportLink } from "../lib/importLink";
import styles from "./RecipeDetailPage.module.css";

type LoadState = "loading" | "ready" | "notFound";

/** RecipeDetailResponse → RecipeDoc（表示用の持ち上げ）。coverDataUrlは渡さない
 * （coverはenvelope側のcoverUrlをそのままimgに使うため、photos[]は不要）。 */
function toDisplayDoc(detail: RecipeDetailResponse): RecipeDoc {
  const exportFile = publishedToExportFile(detail.recipe, {
    scriptoriumId: detail.id,
    author: detail.handle,
    importedAt: detail.publishedAt,
  });
  return exportFile.recipe;
}

function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [detail, setDetail] = useState<RecipeDetailResponse | null>(null);

  // 早期returnより前に置く（フック順序維持）。publishedToExportFileは
  // randomUUID/Date生成を伴うため、detailが変わったときのみ再変換する
  const doc = useMemo(
    () => (detail === null ? null : toDisplayDoc(detail)),
    [detail],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) {
        setLoadState("notFound");
        return;
      }
      setLoadState("loading");
      const response = await fetchRecipeDetail(id);
      if (cancelled) return;
      if (response === null) {
        setLoadState("notFound");
        return;
      }
      setDetail(response);
      setLoadState("ready");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadState === "loading") {
    return (
      <div className={styles.page}>
        <p className={styles.status}>{t("recipeDetail.loading")}</p>
      </div>
    );
  }

  if (loadState === "notFound" || detail === null || doc === null) {
    return (
      <div className={styles.page}>
        <p className={styles.status} role="alert">
          {t("recipeDetail.notFound")}
        </p>
        <Link to="/" className={styles.backLink}>
          {t("recipeDetail.backToFeed")}
        </Link>
      </div>
    );
  }

  const importLink = buildImportLink(detail.id);

  return (
    <div className={styles.page}>
      {detail.coverUrl && (
        <img className={styles.cover} src={detail.coverUrl} alt={doc.title} />
      )}

      <h1 className={styles.title}>{doc.title}</h1>
      <p className={styles.meta}>
        <span className={styles.handle}>@{detail.handle}</span>
        <span className={styles.date}>
          {new Date(detail.publishedAt).toLocaleDateString(i18n.language)}
        </span>
      </p>

      {doc.palette.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>
            {t("recipeDetail.paletteHeading")}
          </h2>
          <ul className={styles.paletteList}>
            {doc.palette.map((color) => (
              <li key={color.id} className={styles.paletteItem}>
                <SwatchChip
                  variant="hex"
                  size="lg"
                  hex={color.hex ?? undefined}
                  name={color.name}
                  brand={color.brand ?? undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc.tools.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>
            {t("recipeDetail.toolsHeading")}
          </h2>
          <ul className={styles.toolList}>
            {doc.tools.map((tool) => (
              <li key={tool.id} className={styles.toolChip}>
                {tool.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc.baseSteps.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>
            {t("recipeDetail.baseHeading")}
          </h2>
          <StepListView
            steps={doc.baseSteps}
            palette={doc.palette}
            tools={doc.tools}
            photoCrops={doc.photoCrops}
          />
        </section>
      )}

      {doc.parts.map((part) => (
        <section key={part.id} className={styles.section}>
          <h2 className={styles.sectionHeading}>{part.name}</h2>
          <StepListView
            steps={part.steps}
            palette={doc.palette}
            tools={doc.tools}
            photoCrops={doc.photoCrops}
          />
        </section>
      ))}

      <a
        className={styles.importButton}
        href={importLink}
        data-testid="import-link"
      >
        {t("recipeDetail.importCta")}
      </a>
    </div>
  );
}

export default RecipeDetailPage;
