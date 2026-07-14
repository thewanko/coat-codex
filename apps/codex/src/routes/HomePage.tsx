// routes/HomePage.tsx — レシピ一覧・新規作成・JSONインポート（技術計画v2.2 §3.3 HomePage・T22/T33/T34）
//
// StorageStatusBar（§3.5）を常設し、ExportReminderBanner(full)はリマインダー対象レシピが
// 1件以上ある場合のみ表示する（対象一覧はRecipeCardGridから供給）。
// ワンタップエクスポート対象は「最終エクスポートが最も古い（未エクスポートは最優先）」
// レシピ＝reminderTargetsの先頭要素とする（§3.5「Homeでは未バックアップレシピにドット表示し、
// カードメニューからエクスポート可能」を踏まえ、バナー単体でも1件は確実に処理できる設計）。

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import RecipeCardGrid from "../components/home/RecipeCardGrid";
import NewRecipeButton from "../components/home/NewRecipeButton";
import ImportJsonButton from "../components/home/ImportJsonButton";
import ToolLibraryButton from "../components/home/ToolLibraryButton";
import StorageStatusBar from "../components/home/StorageStatusBar";
import ExportReminderBanner from "../components/home/ExportReminderBanner";
import type { RecipeDoc } from "@coat-codex/recipe-core";
import styles from "./HomePage.module.css";

function HomePage() {
  const { t } = useTranslation();
  const [recipeCount, setRecipeCount] = useState<number | null>(null);
  const [reminderTargets, setReminderTargets] = useState<RecipeDoc[]>([]);
  const [reminderRefreshToken, setReminderRefreshToken] = useState(0);

  function handleReminderChanged() {
    setReminderRefreshToken((token) => token + 1);
  }

  return (
    <div className={styles.page}>
      {recipeCount !== null && recipeCount > 0 && (
        <StorageStatusBar volumeCount={recipeCount} />
      )}
      <div className={styles.hero}>
        <p className={styles.heroOverline}>{t("home.heroOverline")}</p>
        <h1 className={styles.heroTitle}>{t("home.heroTitle")}</h1>
        <p className={styles.heroGloss}>{t("home.heroGloss")}</p>
        <div className={styles.heroDivider} aria-hidden="true">
          <span className={styles.heroDividerLine} />
          <span className={styles.heroDiamond} />
          <span className={styles.heroDividerLine} />
        </div>
        {recipeCount !== null && recipeCount > 0 && (
          <p className={styles.heroVolumes}>
            {t("storageStatus.volumesCount", { count: recipeCount })}
          </p>
        )}
      </div>
      {recipeCount !== null && recipeCount > 0 && (
        <div className={styles.actions}>
          <NewRecipeButton />
          <ImportJsonButton />
          <ToolLibraryButton />
        </div>
      )}
      <p className={styles.helpLinkRow}>
        <Link to="/help" className={styles.helpLink}>
          {t("home.helpLink")}
        </Link>
      </p>
      {reminderTargets.length > 0 && (
        <ExportReminderBanner
          variant="full"
          targetRecipe={reminderTargets[0]}
          onExported={handleReminderChanged}
          onSnoozed={handleReminderChanged}
        />
      )}
      <RecipeCardGrid
        onCountChange={setRecipeCount}
        onReminderTargetsChange={setReminderTargets}
        reminderRefreshToken={reminderRefreshToken}
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
