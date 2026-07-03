// routes/HomePage.tsx — レシピ一覧・新規作成・JSONインポート（技術計画v2.2 §3.3 HomePage・T22/T33）
//
// StorageStatusBar/ExportReminderBanner（§3.5）はT34で結線する。

import { useState } from "react";
import { useTranslation } from "react-i18next";
import RecipeCardGrid from "../components/home/RecipeCardGrid";
import NewRecipeButton from "../components/home/NewRecipeButton";
import ImportJsonButton from "../components/home/ImportJsonButton";
import styles from "./HomePage.module.css";

function HomePage() {
  const { t } = useTranslation();
  const [recipeCount, setRecipeCount] = useState<number | null>(null);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>{t("app.title")}</h1>
        {recipeCount !== null && recipeCount > 0 && (
          <div className={styles.actions}>
            <NewRecipeButton />
            <ImportJsonButton />
          </div>
        )}
      </div>
      <RecipeCardGrid
        onCountChange={setRecipeCount}
        emptyStateActions={
          <>
            <NewRecipeButton label={t("home.emptyCta")} />
            <ImportJsonButton />
          </>
        }
      />
    </div>
  );
}

export default HomePage;
