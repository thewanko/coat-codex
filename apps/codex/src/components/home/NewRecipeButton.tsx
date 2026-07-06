// components/home/NewRecipeButton.tsx — 新規作成ボタン（技術計画v2.2 §3.1・§3.5発火点①・D-8）
//
// クリックハンドラ直下でstorage.persist()を要求（meta.persist未記録時のみ。fire-and-forgetで
// 遷移をブロックしない — navigator.storage.persist()はWeb Share APIと異なりtransient
// activationを要さないため、遷移と並行してよい）。createDraftはi18n解決済み既定名（D-8）を
// 渡してドラフトを発行し、完了後に/recipe/:id/setupへnavigateする。

import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { createDraft } from "../../db/recipeStore";
import {
  checkPersisted,
  readPersistRecord,
  recordPersistResult,
  requestPersist,
  shouldRequestPersist,
} from "../../lib/storageHealth";
import styles from "./NewRecipeButton.module.css";

/** §3.5発火条件: meta.persist未記録（または未許可のまま）の場合のみ要求し、結果を記録する */
async function ensurePersistRequested(): Promise<void> {
  const [record, persisted] = await Promise.all([
    readPersistRecord(),
    checkPersisted(),
  ]);
  if (!shouldRequestPersist(record, persisted)) {
    return;
  }
  const granted = await requestPersist();
  if (granted === undefined) {
    return;
  }
  await recordPersistResult(granted, new Date().toISOString());
}

interface NewRecipeButtonProps {
  /** ボタン文言。既定は「新規作成」（home.newRecipe）。EmptyState内ではhome.emptyCtaを渡す */
  label?: string;
}

function NewRecipeButton({ label }: NewRecipeButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function handleClick() {
    // §3.5発火点①: クリックハンドラ直下で要求する。await ブロックせずcreateDraft/navigateを進める。
    void ensurePersistRequested();

    void createDraft(t("recipe.untitledTitle")).then((draft) => {
      navigate(`/recipe/${draft.id}/setup`);
    });
  }

  return (
    <button type="button" className={styles.button} onClick={handleClick}>
      {label ?? t("home.newRecipe")}
    </button>
  );
}

export default NewRecipeButton;
