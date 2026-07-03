// routes/RecipeOverviewPage.tsx — 10-2 ペイント構成全体表示（技術計画v2.2 §3.3・§4.2 T28）
//
// 編集対象の供給はuseRecipeStore（T16）。PartEditorPage/RecipeSetupPageと同じ流儀で
// load(:id)をURLパラメータで呼び、更新はupdateRecipe(updater)経由（autosave debounce
// 500msはストアの責務）。ロード中・不存在・loadError分岐もT23/T27の流儀に合わせる。
// onSaveError（StorageQuotaError等）はuseEffectで購読しトースト表示する（T27の流儀）。
//
// 参照同一性（M4必須事項②）: パーツ並び替えはonReorderで渡されたparts配列をそのまま
// docへ差し替える（配列内の各Part要素自体は呼び出し元=PartCardListが再生成しない）。
// パーツ追加はスプレッド追加のみで既存parts要素の参照を保つ。

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useRecipeStore } from "../stores/useRecipeStore";
import { StorageQuotaError } from "../db/photoStore";
import {
  readRecipeExport,
  readReminderSnooze,
  shouldShowExportReminder,
} from "../lib/storageHealth";
import { useToast } from "../components/common/toastContext";
import Skeleton from "../components/common/Skeleton";
import BackLink from "../components/common/BackLink";
import OverviewHeader from "../components/overview/OverviewHeader";
import OverviewPhotoStrip from "../components/overview/OverviewPhotoStrip";
import PartCardList from "../components/overview/PartCardList";
import PartReviewDialog from "../components/overview/PartReviewDialog";
import ExportActionBar from "../components/overview/ExportActionBar";
import ExportReminderBanner from "../components/home/ExportReminderBanner";
import type { RecipeDoc } from "../models/recipe";
import styles from "./RecipeOverviewPage.module.css";

type RecipePart = RecipeDoc["parts"][number];

function RecipeOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const doc = useRecipeStore((state) => state.doc);
  const isLoading = useRecipeStore((state) => state.isLoading);
  const loadError = useRecipeStore((state) => state.loadError);
  const load = useRecipeStore((state) => state.load);
  const updateRecipe = useRecipeStore((state) => state.updateRecipe);
  const onSaveError = useRecipeStore((state) => state.onSaveError);

  const [reviewPartId, setReviewPartId] = useState<string | null>(null);
  // §3.5コンパクト帯: 当該レシピの未バックアップ判定に必要な状態（recipeExport:<id>とスヌーズ期限）
  const [exportedAt, setExportedAt] = useState<string | undefined>(undefined);
  const [snoozedUntil, setSnoozedUntil] = useState<string | undefined>(
    undefined,
  );
  const [reminderRefreshToken, setReminderRefreshToken] = useState(0);

  useEffect(() => {
    if (id) {
      void load(id);
    }
  }, [id, load]);

  useEffect(() => {
    return onSaveError((event) => {
      const messageKey =
        event.error instanceof StorageQuotaError
          ? "errors.storageQuota"
          : "errors.saveFailed";
      toast.error(t(messageKey));
    });
  }, [onSaveError, toast, t]);

  const loadReminderState = useCallback(async () => {
    if (!id) {
      return;
    }
    const [exportRecord, snooze] = await Promise.all([
      readRecipeExport(id),
      readReminderSnooze(),
    ]);
    setExportedAt(exportRecord);
    setSnoozedUntil(snooze);
  }, [id]);

  useEffect(() => {
    void loadReminderState();
  }, [loadReminderState, reminderRefreshToken]);

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

  function handleOpenPart(partId: string) {
    navigate(`/recipe/${id}/part/${partId}`);
  }

  function handleReviewPart(partId: string) {
    setReviewPartId(partId);
  }

  function handleEditBaseSteps() {
    navigate(`/recipe/${id}/part/base`);
  }

  function handleReorderParts(nextParts: RecipePart[]) {
    updateRecipe((current) => ({ ...current, parts: nextParts }));
  }

  function handleAddPart(part: RecipePart) {
    updateRecipe((current) => ({
      ...current,
      parts: [...current.parts, part],
    }));
    navigate(`/recipe/${id}/part/${part.id}`);
  }

  function handleReminderChanged() {
    setReminderRefreshToken((token) => token + 1);
  }

  // §3.5コンパクト帯の表示条件: 当該レシピが未バックアップ、かつスヌーズ中でない
  const showReminderCompact = shouldShowExportReminder({
    updatedAt: doc.updatedAt,
    exportedAt,
    snoozedUntil,
    now: new Date().toISOString(),
  });

  return (
    <div className={styles.root}>
      <BackLink to="/" label={t("nav.backToLibrary")} />

      <h1 className={styles.title}>{doc.title}</h1>

      {showReminderCompact && (
        <ExportReminderBanner
          variant="compact"
          targetRecipe={doc}
          onExported={handleReminderChanged}
          onSnoozed={handleReminderChanged}
        />
      )}

      <OverviewHeader
        representativePhotoId={doc.overviewPhotoIds[0] ?? null}
        baseSteps={doc.baseSteps}
        onEditBaseSteps={handleEditBaseSteps}
      />

      <OverviewPhotoStrip photoIds={doc.overviewPhotoIds} />

      <section className={styles.partsSection}>
        <h2 className={styles.partsHeading}>{t("overview.partsHeading")}</h2>
        <PartCardList
          parts={doc.parts}
          onOpen={handleOpenPart}
          onReview={handleReviewPart}
          onReorder={handleReorderParts}
          onAdd={handleAddPart}
        />
      </section>

      <ExportActionBar recipe={doc} onExported={handleReminderChanged} />

      {reviewPartId !== null && (
        <PartReviewDialog
          recipe={doc}
          partId={reviewPartId}
          open={reviewPartId !== null}
          onClose={() => setReviewPartId(null)}
        />
      )}
    </div>
  );
}

export default RecipeOverviewPage;
