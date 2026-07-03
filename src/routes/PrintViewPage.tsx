// routes/PrintViewPage.tsx — 印刷プレビュー画面（技術計画v2.2 §3.3・§4.2 T36）
//
// レシピ読み込みは RecipeOverviewPage/PartEditorPage と同じ流儀（useRecipeStore.load(:id)を
// URLパラメータで呼ぶ）に倣うが、本画面は読み取り専用のため updateRecipe 等の書き込み系は
// 使用しない。不正ルート（不存在レシピ）はRecipeOverviewPageの既存慣行と同じく
// setup.loadError / setup.notFound のインラインメッセージ表示に倣う。

import { useEffect } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useRecipeStore } from "../stores/useRecipeStore";
import Skeleton from "../components/common/Skeleton";
import PrintToolbar from "../components/print/PrintToolbar";
import PrintRecipeSheet from "../components/print/PrintRecipeSheet";
import styles from "./PrintViewPage.module.css";

function PrintViewPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const doc = useRecipeStore((state) => state.doc);
  const isLoading = useRecipeStore((state) => state.isLoading);
  const loadError = useRecipeStore((state) => state.loadError);
  const load = useRecipeStore((state) => state.load);

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
        <p className={styles.error}>{t("print.loadError")}</p>
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className={styles.root}>
        <p className={styles.error}>{t("print.notFound")}</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <PrintToolbar backTo={`/recipe/${id}`} />
      <PrintRecipeSheet recipe={doc} />
    </div>
  );
}

export default PrintViewPage;
