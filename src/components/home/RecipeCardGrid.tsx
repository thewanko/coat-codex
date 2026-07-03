// components/home/RecipeCardGrid.tsx — レシピ一覧グリッド（技術計画v2.2 §3.3 HomePage・D-5）
//
// listRecipes()（updatedAt降順）を読み込み、ロード中はSkeleton(card)、0件時はEmptyState(home)、
// それ以外はRecipeCardを並べる。削除はConfirmDialogで確認後、deleteRecipe＋
// deletePhotosForRecipeの両方を呼んで一覧から除く（レシピ・写真の二重削除漏れ防止）。

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { deleteRecipe, listRecipes } from "../../db/recipeStore";
import { deletePhotosForRecipe } from "../../db/photoStore";
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
}

const SKELETON_COUNT = 6;

function RecipeCardGrid({
  emptyStateActions,
  onCountChange,
}: RecipeCardGridProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<RecipeDoc[] | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await listRecipes();
    setRecipes(list);
    onCountChange?.(list.length);
  }, [onCountChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
            onOpen={handleOpen}
            onDelete={handleRequestDelete}
            onDuplicated={() => void reload()}
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
