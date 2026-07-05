// routes/PartEditorPage.tsx — 10-3 パーツ/ベース工程編集（技術計画v2.2 §3.1・§3.3・§4.2 T27）
//
// 編集対象の供給はuseRecipeStore（T16）。load(:id)をURLパラメータで呼び、更新は
// updateRecipe(updater)経由（autosave debounce 500msはストアの責務）。
// モード分岐（§3.1）: isBaseMode=true → 編集対象はdoc.baseSteps。
// 通常 → :partIdでdoc.partsから検索（"base"はパーツIDとして存在しない=INV-17）。
//
// 参照同一性（M4必須事項②）: updaterは変更のないpart/step/palette要素の参照を保つ。
// baseSteps編集時はparts配列に触れず、parts編集時は対象part以外・対象step以外の
// オブジェクト参照をそのまま返す（map全再生成・deep cloneはしない）。
//
// レイアウト分岐（§3.1・デザイン仕様書§164 SlideInPanel）: モバイル＝フルページ／
// PC幅（≥768px）＝`/recipe/:id`上のスライドインパネル（右からのパネル＋backdrop）。
// CSSメディアクエリで両レイアウトを常時DOMに持たせず、コンポーネント側はモード非依存の
// 1つのツリーを描画し、パネルの視覚化はCSS側の責務にする。閉じる操作（backdropクリック／
// 閉じるボタン）は`/recipe/:id`へnavigateする。
//
// onSaveError（StorageQuotaError等）はuseEffectで購読しトースト表示する（useToast.error）。
//
// load呼び出しについて（M8 T44レビューRound1 #1）: ネスト化により本コンポーネントは
// 親RecipeOverviewPageと同時マウントされる。loadのオーナーは親に一本化し、本コンポーネントは
// mount時のload呼び出しを持たない（ストアのdoc/isLoading/loadErrorを購読するのみ）。
// 子側でloadを呼ぶと、パネルを開くたびdoc:nullリセット（ストアload冒頭のset）が走り、
// 背面Overviewが一瞬notFound表示にフラッシュし、in-flight autosaveも強制flushされてしまう。

import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useRecipeStore } from "../stores/useRecipeStore";
import { StorageQuotaError } from "../db/photoStore";
import { useToast } from "../components/common/toastContext";
import Skeleton from "../components/common/Skeleton";
import BackLink from "../components/common/BackLink";
import PartEditorHeader from "../components/part-editor/PartEditorHeader";
import StepPhotoStrip from "../components/part-editor/StepPhotoStrip";
import StepList from "../components/part-editor/StepList";
import type { CropRect, PaletteColor, RecipeDoc, Step } from "../models/recipe";
import styles from "./PartEditorPage.module.css";

interface PartEditorPageProps {
  isBaseMode?: boolean;
}

/** baseSteps編集用のsteps差し替えupdaterを生成する（parts配列には触れない＝参照維持） */
function replaceBaseSteps(doc: RecipeDoc, nextBaseSteps: Step[]): RecipeDoc {
  return { ...doc, baseSteps: nextBaseSteps };
}

/**
 * 対象partIdのstepsのみを差し替えるupdaterを生成する。対象外のpart要素は
 * 元の参照をそのまま返す（M4必須事項②。partsのmap全再生成は行わない）。
 */
function replacePartSteps(
  doc: RecipeDoc,
  partId: string,
  nextSteps: Step[],
): RecipeDoc {
  const nextParts = doc.parts.map((part) =>
    part.id === partId ? { ...part, steps: nextSteps } : part,
  );
  return { ...doc, parts: nextParts };
}

function PartEditorPage({ isBaseMode = false }: PartEditorPageProps) {
  const { id, partId } = useParams<{ id: string; partId?: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const doc = useRecipeStore((state) => state.doc);
  const isLoading = useRecipeStore((state) => state.isLoading);
  const loadError = useRecipeStore((state) => state.loadError);
  const updateRecipe = useRecipeStore((state) => state.updateRecipe);
  const onSaveError = useRecipeStore((state) => state.onSaveError);

  useEffect(() => {
    return onSaveError((event) => {
      const messageKey =
        event.error instanceof StorageQuotaError
          ? "errors.storageQuota"
          : "errors.saveFailed";
      toast.error(t(messageKey));
    });
  }, [onSaveError, toast, t]);

  function handleClose() {
    if (id) {
      navigate(`/recipe/${id}`);
    }
  }

  if (isLoading) {
    return (
      <div className={styles.root}>
        <div className={styles.panel}>
          <Skeleton variant="card" />
        </div>
      </div>
    );
  }

  if (loadError !== null) {
    return (
      <div className={styles.root}>
        <div className={styles.panel}>
          {id && (
            <div className={styles.backLinkRow}>
              <BackLink to={`/recipe/${id}`} label={t("nav.backToOverview")} />
            </div>
          )}
          <p className={styles.error}>{t("setup.loadError")}</p>
        </div>
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className={styles.root}>
        <div className={styles.panel}>
          {id && (
            <div className={styles.backLinkRow}>
              <BackLink to={`/recipe/${id}`} label={t("nav.backToOverview")} />
            </div>
          )}
          <p className={styles.error}>{t("setup.notFound")}</p>
        </div>
      </div>
    );
  }

  const targetPart = isBaseMode
    ? null
    : (doc.parts.find((part) => part.id === partId) ?? null);

  if (!isBaseMode && targetPart === null) {
    return (
      <div className={styles.root}>
        <div className={styles.backdrop} onClick={handleClose} />
        <div className={styles.panel}>
          <div className={styles.backLinkRow}>
            <BackLink
              to={`/recipe/${doc.id}`}
              label={t("nav.backToOverview")}
            />
          </div>
          <p className={styles.error}>{t("editor.partNotFound")}</p>
        </div>
      </div>
    );
  }

  const steps: Step[] = isBaseMode ? doc.baseSteps : (targetPart?.steps ?? []);

  function handleStepChange(index: number, next: Step) {
    updateRecipe((current) => {
      const currentSteps = isBaseMode
        ? current.baseSteps
        : (current.parts.find((part) => part.id === partId)?.steps ?? []);
      const nextSteps = currentSteps.map((step, i) =>
        i === index ? next : step,
      );
      return isBaseMode
        ? replaceBaseSteps(current, nextSteps)
        : replacePartSteps(current, partId as string, nextSteps);
    });
  }

  function handleStepDelete(index: number) {
    updateRecipe((current) => {
      const currentSteps = isBaseMode
        ? current.baseSteps
        : (current.parts.find((part) => part.id === partId)?.steps ?? []);
      const nextSteps = currentSteps.filter((_, i) => i !== index);
      return isBaseMode
        ? replaceBaseSteps(current, nextSteps)
        : replacePartSteps(current, partId as string, nextSteps);
    });
  }

  function handleStepReorder(nextSteps: Step[]) {
    updateRecipe((current) =>
      isBaseMode
        ? replaceBaseSteps(current, nextSteps)
        : replacePartSteps(current, partId as string, nextSteps),
    );
  }

  function handleStepAdd(step: Step) {
    updateRecipe((current) => {
      const currentSteps = isBaseMode
        ? current.baseSteps
        : (current.parts.find((part) => part.id === partId)?.steps ?? []);
      const nextSteps = [...currentSteps, step];
      return isBaseMode
        ? replaceBaseSteps(current, nextSteps)
        : replacePartSteps(current, partId as string, nextSteps);
    });
  }

  function handleAddColor(color: PaletteColor) {
    updateRecipe((current) => ({
      ...current,
      palette: [...current.palette, color],
    }));
  }

  function handlePartNameCommit(name: string) {
    updateRecipe((current) => {
      const nextParts = current.parts.map((part) =>
        part.id === partId ? { ...part, name } : part,
      );
      return { ...current, parts: nextParts };
    });
  }

  function handlePhotoCropChange(photoId: string, crop: CropRect | null) {
    updateRecipe((current) => {
      if (crop === null) {
        const nextEntries = Object.entries(current.photoCrops).filter(
          ([id]) => id !== photoId,
        );
        return { ...current, photoCrops: Object.fromEntries(nextEntries) };
      }
      return {
        ...current,
        photoCrops: { ...current.photoCrops, [photoId]: crop },
      };
    });
  }

  return (
    <div className={styles.root}>
      <div className={styles.backdrop} onClick={handleClose} />
      <div className={styles.panel}>
        <button
          type="button"
          className={styles.closeButton}
          aria-label={t("editor.closePanel")}
          onClick={handleClose}
        >
          ✕
        </button>

        <div className={styles.backLinkRow}>
          <BackLink to={`/recipe/${doc.id}`} label={t("nav.backToOverview")} />
        </div>

        <PartEditorHeader
          isBaseMode={isBaseMode}
          recipeId={doc.id}
          partName={targetPart?.name}
          onPartNameCommit={handlePartNameCommit}
          representativePhotoId={doc.overviewPhotoIds[0] ?? null}
        />

        <StepPhotoStrip steps={steps} />

        <div className={styles.body}>
          <StepList
            steps={steps}
            recipeId={doc.id}
            palette={doc.palette}
            onChange={handleStepChange}
            onAddColor={handleAddColor}
            onDelete={handleStepDelete}
            onReorder={handleStepReorder}
            onAdd={handleStepAdd}
            photoCrops={doc.photoCrops}
            onCropChange={handlePhotoCropChange}
          />
        </div>
      </div>
    </div>
  );
}

export default PartEditorPage;
