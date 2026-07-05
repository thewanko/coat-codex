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
//
// 2026-07-03: BASE工程表示をBaseStepOverlay（オーバーレイ帯）からPARTSカードと同一意匠の
// 独立カードへ変更（将来のモデリング工程拡張を見据えた工程グループ化UI）。実装は
// `{ id: "base", name: t("overview.baseCardName"), steps: doc.baseSteps }` の合成partを
// 組み立て、既存PartCardへそのまま渡す方式（"base"はparts[].id予約語=INV-17のため実パーツと
// 衝突しない）。BASEセクションはPartCardListのSortableContext外に配置し、D&D・上下移動
// ボタンは持たない（baseStepsスキーマ自体は不変。UIのみの変更）。
// baseSteps.length===0のときはPartCardの代わりに既存のaddBaseStepピル（旧BaseStepOverlayの
// 空状態文言を流用）を表示する。

import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useMatch, useNavigate, useParams } from "react-router";
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
import OverviewPhotoDialog from "../components/overview/OverviewPhotoDialog";
import OverviewPhotoStrip from "../components/overview/OverviewPhotoStrip";
import PartCard from "../components/overview/PartCard";
import PartCardList from "../components/overview/PartCardList";
import PartReviewDialog from "../components/overview/PartReviewDialog";
import ExportActionBar from "../components/overview/ExportActionBar";
import ExportReminderBanner from "../components/home/ExportReminderBanner";
import type { CropRect, RecipeDoc } from "../models/recipe";
import styles from "./RecipeOverviewPage.module.css";

type RecipePart = RecipeDoc["parts"][number];

/** BASE_PART_ID: parts[].idの予約語（INV-17）と同じ文字列を合成partのidに使う */
const BASE_PART_ID = "base";

function RecipeOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  // PC幅（≥768px）ではpart/base・part/:partIdの子ルートが`/recipe/:id`上の
  // スライドインパネルとして描画される（§3.1・T44）。パネル表示中は背面Overviewの
  // コンテンツにinertを付与し、キーボード操作・スクリーンリーダーからの到達を防ぐ
  // （backdropはマウス操作をカバーするが、inertがないとTab移動等で背面要素に届いてしまう）。
  const isPanelOpen = useMatch("/recipe/:id/part/*") !== null;
  const contentRef = useRef<HTMLDivElement | null>(null);
  // パネルを開くnavigate直前のscrollYを退避するref（DOM変更前に読む必要がある。下記
  // スクロールeffect参照）。直接URLアクセスでの初回マウント時は初期値0のままでよい
  // （その場合は閉じてもscrollTo(0, 0)になるだけで実害なし)。
  // 退避の更新はハンドラ経由の開経路（handleOpenPart/handleOpenBase/handleAddPart）のみ。
  // ブラウザForward等クリックを伴わない再入では前回値のまま復元される（稀・位置ズレのみ）。
  const scrollYBeforePanelRef = useRef(0);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.inert = isPanelOpen;
    }
  }, [isPanelOpen]);

  useEffect(() => {
    if (!isPanelOpen || typeof window.matchMedia !== "function") {
      return;
    }
    // セット前の値を退避し、クリーンアップで無条件上書きせず復元する
    // （M8 T44レビューRound1 #3。他機能がbody.style.overflowを操作している場合の巻き戻り防止）。
    // 本effectはmatchMediaのchangeを購読し、リサイズによるPC/モバイル切替に追従する。
    // 一方、下記のモバイル用スクロール位置effectは開時のモバイル判定を固定し追従しない。
    // 両者の目的が異なる（前者はロック状態の一貫性維持、後者はスクロール退避元の一意性
    // 確保）ための意図的な非対称であり、統一する必要はない。
    const previousOverflow = document.body.style.overflow;
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    function applyBodyScrollLock() {
      document.body.style.overflow = mediaQuery.matches
        ? "hidden"
        : previousOverflow;
    }
    applyBodyScrollLock();
    mediaQuery.addEventListener("change", applyBodyScrollLock);
    return () => {
      mediaQuery.removeEventListener("change", applyBodyScrollLock);
      document.body.style.overflow = previousOverflow;
    };
  }, [isPanelOpen]);

  useEffect(() => {
    if (!isPanelOpen || typeof window.matchMedia !== "function") {
      return;
    }
    // モバイル（<768px）はパネルではなくフルページ差し替えのため、背面Overviewの
    // スクロール位置が残っているとパネルが途中位置から開いて見える不具合を防ぐ
    // （§3.1「モバイル＝フルページ」）。開時に先頭へ寄せ、閉時に退避位置へ戻す。
    // モバイル判定は開時の幅で固定する（CSS側の`.panelOpen{display:none}`は現在幅に
    // 追従する非対称な設計）。PC幅で開いた後にモバイル幅へリサイズしてから閉じた場合は
    // 退避位置へ復元しないが、復元先のOverviewはモバイル幅では非表示のため実害はない。
    // なお、直上のbody scroll lock effectはmatchMediaのchangeを購読して追従するのに対し、
    // 本effectは追従しない。これは意図的な非対称であり、「統一しよう」として本effectに
    // change購読を足す修正はしないこと。
    const isMobile = !window.matchMedia("(min-width: 768px)").matches;
    if (!isMobile) {
      return;
    }
    // scrollYの退避はここではなく、パネルを開く各ハンドラ（handleOpenPart等）でnavigate
    // 直前に行う。ここで読むと、このeffect実行時点で`.panelOpen{display:none}`が既に
    // DOMへコミット済みで文書高が縮み、window.scrollYが0へクランプされた後になるため
    // （実機検証で確認済み: 開前819.5→この時点で0）。
    window.scrollTo(0, 0);
    return () => {
      window.scrollTo(0, scrollYBeforePanelRef.current);
    };
  }, [isPanelOpen]);

  const doc = useRecipeStore((state) => state.doc);
  const isLoading = useRecipeStore((state) => state.isLoading);
  const loadError = useRecipeStore((state) => state.loadError);
  const load = useRecipeStore((state) => state.load);
  const updateRecipe = useRecipeStore((state) => state.updateRecipe);
  const onSaveError = useRecipeStore((state) => state.onSaveError);

  // レビュー対象。BASE_PART_ID("base")の場合はBASEカードのレビュー（PartReviewDialogの
  // baseモード=partId:null相当）。実パーツはparts[].id（"base"予約語のため衝突しない）。
  const [reviewTarget, setReviewTarget] = useState<string | null>(null);
  // FB-C 2026-07-04: 全体写真の後日変更ダイアログ開閉状態
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
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

  // 早期return（isLoading/loadError/doc===null）もcontentRefをroot要素に付与し、inertの
  // 対象に含める（M8 T44レビューRound1 #4）。#1修正により通常のパネル開閉ではloadが親でしか
  // 走らずisLoadingへ落ちる主経路は消えるが、初回ロードや直接URLアクセス直後は依然この分岐を
  // 通るため、防御としてOutlet（パネル）とは兄弟関係に保ったまま対応する。
  const rootClassName = isPanelOpen
    ? `${styles.root} ${styles.panelOpen}`
    : styles.root;

  if (isLoading) {
    return (
      <>
        <div className={rootClassName} ref={contentRef}>
          <Skeleton variant="card" />
        </div>
        <Outlet />
      </>
    );
  }

  if (loadError !== null) {
    return (
      <>
        <div className={rootClassName} ref={contentRef}>
          <p className={styles.error}>{t("setup.loadError")}</p>
        </div>
        <Outlet />
      </>
    );
  }

  if (doc === null) {
    return (
      <>
        <div className={rootClassName} ref={contentRef}>
          <p className={styles.error}>{t("setup.notFound")}</p>
        </div>
        <Outlet />
      </>
    );
  }

  function handleOpenPart(partId: string) {
    scrollYBeforePanelRef.current = window.scrollY;
    navigate(`/recipe/${id}/part/${partId}`);
  }

  function handleReviewPart(partId: string) {
    setReviewTarget(partId);
  }

  function handleOpenBase() {
    scrollYBeforePanelRef.current = window.scrollY;
    navigate(`/recipe/${id}/part/base`);
  }

  function handleReviewBase() {
    setReviewTarget(BASE_PART_ID);
  }

  function handleReorderParts(nextParts: RecipePart[]) {
    updateRecipe((current) => ({ ...current, parts: nextParts }));
  }

  function handleAddPart(part: RecipePart) {
    updateRecipe((current) => ({
      ...current,
      parts: [...current.parts, part],
    }));
    scrollYBeforePanelRef.current = window.scrollY;
    navigate(`/recipe/${id}/part/${part.id}`);
  }

  function handleReminderChanged() {
    setReminderRefreshToken((token) => token + 1);
  }

  function handleOverviewPhotosChange(overviewPhotoIds: string[]) {
    updateRecipe((current) => ({ ...current, overviewPhotoIds }));
  }

  function handleOverviewPhotoCropChange(
    photoId: string,
    crop: CropRect | null,
  ) {
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

  // §3.5コンパクト帯の表示条件: 当該レシピが未バックアップ、かつスヌーズ中でない
  const showReminderCompact = shouldShowExportReminder({
    updatedAt: doc.updatedAt,
    exportedAt,
    snoozedUntil,
    now: new Date().toISOString(),
  });

  // BASEカード用の合成part（既存PartCardの意匠・ロジックをそのまま流用するための変換のみ。
  // baseStepsスキーマ自体は不変＝doc.baseStepsの参照をそのまま渡す）
  const basePart: RecipePart = {
    id: BASE_PART_ID,
    name: t("overview.baseCardName"),
    steps: doc.baseSteps,
  };

  // Outlet（part/base・part/:partId）はcontentRef対象の.root外の兄弟としてレンダーする。
  // PartEditorPageのCSSはPC幅でposition:fixed; inset:0の独立レイヤーになるため描画位置
  // 自体はDOM順に依存しないが、背面Overview（inert付与対象）と分離しておくことで
  // inertが誤ってパネル自身を無効化しないようにする（§3.1・T44）。
  return (
    <>
      <div className={rootClassName} ref={contentRef}>
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
          onChangePhoto={() => setPhotoDialogOpen(true)}
        />

        <OverviewPhotoStrip photoIds={doc.overviewPhotoIds} />

        <section className={styles.baseSection}>
          <h2 className={styles.baseHeading}>{t("overview.baseOverline")}</h2>
          {doc.baseSteps.length === 0 ? (
            <button
              type="button"
              className={styles.addBasePill}
              onClick={handleOpenBase}
              data-testid="base-card-empty"
            >
              {t("overview.addBaseStep")}
            </button>
          ) : (
            <PartCard
              part={basePart}
              palette={doc.palette}
              onOpen={handleOpenBase}
              onReview={handleReviewBase}
            />
          )}
        </section>

        <section className={styles.partsSection}>
          <h2 className={styles.partsHeading}>{t("overview.partsHeading")}</h2>
          <PartCardList
            parts={doc.parts}
            palette={doc.palette}
            onOpen={handleOpenPart}
            onReview={handleReviewPart}
            onReorder={handleReorderParts}
            onAdd={handleAddPart}
          />
        </section>

        {/* 2026-07-04 FB-G: モバイルの「出力・共有」ボタンはposition: stickyのため
            コンテンツ末尾（＋パーツを追加ボタンの下）に配置する。fixed時代に必要だった
            .root側のpadding-bottom（--actionbar-height分の余白確保）はsticky化で
            不要になったため撤去済み（RecipeOverviewPage.module.css）。 */}
        <ExportActionBar recipe={doc} onExported={handleReminderChanged} />

        {reviewTarget !== null && (
          <PartReviewDialog
            recipe={doc}
            partId={reviewTarget === BASE_PART_ID ? null : reviewTarget}
            open={reviewTarget !== null}
            onClose={() => setReviewTarget(null)}
          />
        )}

        {photoDialogOpen && (
          <OverviewPhotoDialog
            open={photoDialogOpen}
            recipeId={doc.id}
            value={doc.overviewPhotoIds}
            onChange={handleOverviewPhotosChange}
            onClose={() => setPhotoDialogOpen(false)}
            crops={doc.photoCrops}
            onCropChange={handleOverviewPhotoCropChange}
          />
        )}
      </div>
      <Outlet />
    </>
  );
}

export default RecipeOverviewPage;
