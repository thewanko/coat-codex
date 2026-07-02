// routes/HomePage.tsx — レシピ一覧・新規作成（技術計画v2.2 §3.3 HomePage・T22）
//
// StorageStatusBar/ExportReminderBanner/ImportJsonButton（§3.5・§3.3）はT33/T34で結線する。
// 本タスクの成果物はRecipeCardGrid（一覧・削除）とNewRecipeButton（新規作成フロー）のみ。

import { useState } from "react";
import { useTranslation } from "react-i18next";
import RecipeCardGrid from "../components/home/RecipeCardGrid";
import NewRecipeButton from "../components/home/NewRecipeButton";
import styles from "./HomePage.module.css";

function HomePage() {
  const { t } = useTranslation();
  const [recipeCount, setRecipeCount] = useState<number | null>(null);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>{t("app.title")}</h1>
        {recipeCount !== null && recipeCount > 0 && <NewRecipeButton />}
      </div>
      <RecipeCardGrid
        onCountChange={setRecipeCount}
        emptyStateActions={
          <>
            <NewRecipeButton label={t("home.emptyCta")} />
            <button type="button" className={styles.importButton} disabled>
              {t("home.emptyImport")}
            </button>
          </>
        }
      />
    </div>
  );
}

export default HomePage;
