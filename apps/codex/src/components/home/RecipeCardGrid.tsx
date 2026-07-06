// components/home/RecipeCardGrid.tsx — レシピ一覧グリッド（技術計画v2.2 §3.3 HomePage・D-5・T34）
//
// listRecipes()（updatedAt降順）を読み込み、ロード中はSkeleton(card)、0件時はEmptyState(home)、
// それ以外はRecipeCardを並べる。削除はConfirmDialogで確認後、deleteRecipe＋
// deletePhotosForRecipeの両方を呼んで一覧から除く（レシピ・写真の二重削除漏れ防止）。
//
// D-6未バックアップドット: readAllRecipeExports()で全レシピのrecipeExport:*を取得し、
// isRecipeBackedUp（storageHealth.ts）でレシピ単位に判定してRecipeCardへ渡す。
// エクスポート成功時はRecipeCardのonExportedで通知を受け、ローカルのexports state経由で
// 当該カードのみ再判定させる（DB再読み込みなしで即時反映）。
//
// §3.5リマインダー対象: shouldShowExportReminder（storageHealth.ts）で全レシピを走査し、
// 対象一覧をonReminderTargetsChangeで親（HomePage）へ通知する
// （ExportReminderBanner=fullはHomePage側でレンダーするため、対象データのみをここから供給する）。

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { deleteRecipe, listRecipes } from "../../db/recipeStore";
import { deletePhotosForRecipe } from "../../db/photoStore";
import {
  isRecipeBackedUp,
  readAllRecipeExports,
  readReminderSnooze,
  shouldShowExportReminder,
} from "../../lib/storageHealth";
import type { RecipeDoc } from "../../models/recipe";
import ConfirmDialog from "../common/ConfirmDialog";
import EmptyState from "../common/EmptyState";
import Skeleton from "../common/Skeleton";
import RecipeCard from "./RecipeCard";
import styles from "./RecipeCardGrid.module.css";

interface RecipeCardGridProps {
  /** レシピ0件時のEmptyState内に差し込むCTA（NewRecipeButton等）。呼び出し側から供給 */
  emptyStateActions?: ReactNode;
  /** ロード完了後の件数を親へ通知（HomePageのヘッダーCTA出し分け用。任意） */
  onCountChange?: (count: number) => void;
  /**
   * §3.5リマインダー対象レシピ一覧を親（HomePage）へ通知する。
   * 対象は「最終エクスポートが古い順（未エクスポートを先頭）」でソート済みとし、
   * 呼び出し側のExportReminderBanner(full)は先頭要素をワンタップエクスポート対象に使う。
   */
  onReminderTargetsChange?: (targets: RecipeDoc[]) => void;
  /**
   * 親（HomePage）のExportReminderBanner(full)でエクスポート/スヌーズが行われた回数
   * （インクリメントされるたびに変更を検知して再読み込みする。HomePage側でuseStateの
   * カウンタをuseCallback依存に含めず単純にpropsとして増やすだけの設計）。
   */
  reminderRefreshToken?: number;
}

const SKELETON_COUNT = 6;

function RecipeCardGrid({
  emptyStateActions,
  onCountChange,
  onReminderTargetsChange,
  reminderRefreshToken,
}: RecipeCardGridProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<RecipeDoc[] | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [exports, setExports] = useState<Record<string, string>>({});
  const [snoozedUntil, setSnoozedUntil] = useState<string | undefined>(
    undefined,
  );

  const reload = useCallback(async () => {
    const [list, exportRecords, snooze] = await Promise.all([
      listRecipes(),
      readAllRecipeExports(),
      readReminderSnooze(),
    ]);
    setRecipes(list);
    setExports(exportRecords);
    setSnoozedUntil(snooze);
    onCountChange?.(list.length);
  }, [onCountChange]);

  // reminderRefreshTokenの変更（HomePageのExportReminderBanner=fullでのエクスポート/
  // スヌーズ）を検知して、exports・snoozedUntilを再読み込みする
  useEffect(() => {
    void reload();
  }, [reload, reminderRefreshToken]);

  // D-6: エクスポート成功後にDB再読み込みなしで当該レシピの再判定のみ即時反映する
  const handleExported = useCallback((recipeId: string) => {
    const now = new Date().toISOString();
    setExports((current) => ({ ...current, [recipeId]: now }));
  }, []);

  const reminderTargets = useMemo(() => {
    if (recipes === null) {
      return [];
    }
    const now = new Date().toISOString();
    return recipes
      .filter((recipe) =>
        shouldShowExportReminder({
          updatedAt: recipe.updatedAt,
          exportedAt: exports[recipe.id],
          snoozedUntil,
          now,
        }),
      )
      .sort((a, b) => {
        const aExported = exports[a.id];
        const bExported = exports[b.id];
        if (aExported === undefined && bExported === undefined) return 0;
        if (aExported === undefined) return -1;
        if (bExported === undefined) return 1;
        return new Date(aExported).getTime() - new Date(bExported).getTime();
      });
  }, [recipes, exports, snoozedUntil]);

  useEffect(() => {
    onReminderTargetsChange?.(reminderTargets);
  }, [reminderTargets, onReminderTargetsChange]);

  function handleOpen(id: string) {
    navigate(`/recipe/${id}`);
  }

  function handleRequestDelete(id: string) {
    setPendingDeleteId(id);
  }

  function cancelDelete() {
    setPendingDeleteId(null);
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) {
      return;
    }
    await deletePhotosForRecipe(id);
    await deleteRecipe(id);
    setRecipes((current) => {
      const next = current?.filter((recipe) => recipe.id !== id) ?? null;
      if (next !== null) {
        onCountChange?.(next.length);
      }
      return next;
    });
  }

  const pendingDeleteRecipe = recipes?.find(
    (recipe) => recipe.id === pendingDeleteId,
  );

  if (recipes === null) {
    return (
      <div className={styles.grid} data-testid="recipe-grid-loading">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <Skeleton key={index} variant="card" aria-label={t("home.open")} />
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <EmptyState
        variant="home"
        heading={t("home.emptyTitle")}
        description={t("home.emptyDescription")}
      >
        {emptyStateActions}
      </EmptyState>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            backedUp={isRecipeBackedUp(recipe.updatedAt, exports[recipe.id])}
            onOpen={handleOpen}
            onDelete={handleRequestDelete}
            onDuplicated={() => void reload()}
            onExported={handleExported}
          />
        ))}
      </div>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t("home.deleteTitle")}
        description={
          pendingDeleteRecipe
            ? t("home.deleteMessage", { title: pendingDeleteRecipe.title })
            : undefined
        }
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />
    </>
  );
}

export default RecipeCardGrid;
