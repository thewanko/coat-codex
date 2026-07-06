// components/overview/ShareDialog.tsx — SNS共有ダイアログ（Web Share 2系統）
// （技術計画v2.2 §4.2 T39・§3.4 全体。デザインdc.html セクション05 SHARE）
//
// open時に即座に候補生成を開始する（listShareCandidates→composeShareImages）。
// 生成完了で得たFile[]をstateに保持し、後続のnavigator.share()呼び出しは
// クリックハンドラ内でawaitを挟まず同期的に行う（transient activation維持。§3.4手順4）。
//
// 分岐は機能検出（navigator.canShare?.({ files })）のみ。UA判定は行わない。
// 生成完了直後に候補File[]でcanShareを評価しA/B系統を確定する。候補0件の場合は
// navigator.share自体の有無（text単体で共有可能か）でA系統/B系統を分岐する。
//
// A系統失敗時（NotAllowedError等）はフォールバックフラグを立てB系統UIを表示する。
// 副導線「うまく共有できない場合」リンクは常設し、押下で同様にB系統UIへ切り替える。
//
// FB-A（2026-07-04 iPhone実機フィードバック）: 起点ボタンをSNS横断の「SNSに投稿」1つへ統合し、
// X/Bluesky選択はこのダイアログ内部のタブ（見出し直下・role="tablist"）に移した。
// target propは廃止し、targetKey stateで内部管理する（既定=snsTargets先頭=X）。
// targetは候補生成（テキスト既定文・画像候補）に影響しない値のため、open時の生成用effectの
// 依存には含めない（targetKeyのリセットのみそのeffect内で行う）。タブ切替時は文字数カウンタ
// （ShareTextEditorのtarget prop経由）とB系統のIntent URLが追従するが、生成済みのテキスト
// 編集内容・画像選択（selectedIndexes）はそのまま保持する（候補の再生成はしない）。
//
// FB-A: 合成画像の一括DL（旧handleDownloadImages・50ms間隔の連続anchor.click()）は
// iOS Safariで2件目以降に「進行中のDLを停止しますか」ダイアログが出て操作が破綻するため廃止し、
// 各候補カードに個別「保存」ボタン（1タップ=1ファイルDL。handleDownloadSingleImage）を設けた。

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { db } from "../../db/db";
import {
  composeShareImages,
  createDefaultComposerDeps,
  listShareCandidates,
  type ComposedShareImage,
  type ShareContext as ComposerShareContext,
} from "../../lib/sns/imageComposer";
import { formatMixBadge, isMixTotalValid } from "../../lib/mixRatio";
import { loadBrandColors } from "../../lib/paintPresets";
import { resolveTechniqueLabel } from "../../lib/techniques";
import { snsTargets } from "../../lib/sns/types";
import type { RecipeDoc, Step } from "@coat-codex/recipe-core";
import { useToast } from "../common/toastContext";
import { useFocusTrap } from "../common/useFocusTrap";
import ShareImagePreview, {
  SHARE_IMAGE_MAX_SELECTION,
} from "./ShareImagePreview";
import ShareTextEditor from "./ShareTextEditor";
import styles from "./ShareDialog.module.css";

export type ShareDialogContext =
  | { mode: "whole"; recipe: RecipeDoc }
  | { mode: "part"; recipe: RecipeDoc; partId: string };

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  context: ShareDialogContext;
}

/** 既定選択のSNS（snsTargets先頭="x"）。target propの廃止に伴いダイアログ内部stateで管理する */
const DEFAULT_TARGET_KEY = snsTargets[0]?.key ?? "x";

/** db.photosから直接Blobを読む（objectURL変換はimageComposer内部で行うためBlob本体を返す） */
async function loadPhotoBlob(photoId: string): Promise<Blob | null> {
  const record = await db.photos.get(photoId);
  return record ? record.blob : null;
}

/** 対象パーツを解決する（partIdが存在しない場合はnull） */
function resolvePart(recipe: RecipeDoc, partId: string) {
  return recipe.parts.find((p) => p.id === partId) ?? null;
}

/** 技法の流れの連結時に工程数が4以上の場合、最初と最後の2件のみを残して短縮する境界値 */
const TECHNIQUE_FLOW_FULL_LIST_LIMIT = 3;

/**
 * パーツの技法の流れ文字列を組み立てる（ユーザー決定2026-07-03: 既定テキストに技法の流れを含める）。
 * 技法ラベルが空の工程はスキップし、有効ラベルが4件以上なら「{最初}→…→{最後}」に短縮する
 * （3件以下は全列挙）。有効ラベルが1件もなければ空文字を返す（呼び出し側で流れ部分を省略する）。
 */
function buildTechniqueFlow(
  part: { steps: Step[] },
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const labels = part.steps
    .map((step) => resolveTechniqueLabel(step.technique, t).trim())
    .filter((label) => label !== "");

  if (labels.length === 0) {
    return "";
  }
  if (labels.length <= TECHNIQUE_FLOW_FULL_LIST_LIMIT) {
    return labels.join("→");
  }
  return `${labels[0]}→…→${labels[labels.length - 1]}`;
}

/** 投稿テキスト既定文の組み立て（§3.4手順3。URLは含めない。#coatcodexは末尾固定） */
function buildDefaultText(
  context: ShareDialogContext,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const { recipe } = context;

  if (context.mode === "whole") {
    const totalSteps =
      recipe.baseSteps.length +
      recipe.parts.reduce((sum, part) => sum + part.steps.length, 0);
    return t("share.wholeDefaultText", {
      title: recipe.title,
      partsCount: recipe.parts.length,
      stepsCount: totalSteps,
    });
  }

  const part = resolvePart(recipe, context.partId);
  const partName = part?.name ?? "";
  const stepsCount = part?.steps.length ?? 0;
  const flow = part !== null ? buildTechniqueFlow(part, t) : "";

  if (flow === "") {
    return t("share.partDefaultTextNoFlow", {
      title: recipe.title,
      partName,
      stepsCount,
    });
  }
  return t("share.partDefaultText", {
    title: recipe.title,
    partName,
    flow,
    stepsCount,
  });
}

/**
 * 候補列挙用のCandidateResolvers（既存部品を注入して解決する）。
 * techniqueLabelは.trim()した値を返す（レビューRound1 Low対応: 空白のみのラベルが
 * buildTechniqueFlow・imageComposerのsummary工程リスト/partカード技法名へ
 * 空白のまま流れて表示崩れ（「→   →」等）を起こすのを防ぐ）。
 *
 * paletteColorはbrand（recipe.palette内で同期解決可能）に加えrangeLabelを返す。
 * rangeLabelはプリセットマスタ側の属性のため非同期解決が必要 — 呼び出し側
 * （候補生成effect）がpresetIdごとのレンジをロード済みのMapを rangeLabelByPresetId
 * として注入する（§3.4 SNSカード塗料表示 要件4）。マスタ未ロード・custom色・
 * マスタfetch失敗時はMapに存在しないため自然にnull（レンジなし）になる。
 */
function buildCandidateResolvers(
  recipe: RecipeDoc,
  t: (key: string, opts?: Record<string, unknown>) => string,
  rangeLabelByPresetId: Map<string, string>,
) {
  return {
    techniqueLabel: (step: Step) =>
      resolveTechniqueLabel(step.technique, t).trim(),
    mixBadge: (step: Step) => formatMixBadge(step.paints, step.mix),
    mixWarning: (step: Step) => {
      if (isMixTotalValid(step.paints, step.mix)) {
        return null;
      }
      const total = step.mix
        ? step.mix.reduce((sum, value) => sum + value, 0)
        : 0;
      return t("mix.badgeWarning", { value: total });
    },
    stepTag: (n: number) => t("photo.stepTag", { n }),
    paletteColor: (colorId: string) => {
      const color = recipe.palette.find((c) => c.id === colorId);
      if (!color) return null;
      return {
        name: color.name,
        hex: color.hex,
        brand: color.brand,
        rangeLabel:
          color.presetId !== null
            ? (rangeLabelByPresetId.get(color.presetId) ?? null)
            : null,
      };
    },
    summaryProgress: (partsCount: number, totalSteps: number) =>
      t("share.wholeSummary", {
        partsCount,
        stepsCount: totalSteps,
      }),
    overflowColorsLabel: (remaining: number) =>
      t("share.overflowColors", { count: remaining }),
    overflowStepsLabel: (remaining: number) =>
      t("share.overflowSteps", { count: remaining }),
    toolLabels: (step: Step) =>
      step.toolIds
        .map((toolId) => recipe.tools.find((tool) => tool.id === toolId))
        .filter(
          (tool): tool is RecipeDoc["tools"][number] => tool !== undefined,
        )
        .map((tool) => tool.name),
    // FB-2（2026-07-03ユーザー実機フィードバック）: summary(whole)は「レシピの目次」
    // （パーツ：工程数と使用カラーの一覧）に徹する。baseSectionLabelは既存
    // overview.baseCardNameと同一文言をここでも再利用する（呼び出し側の解決結果を統一）。
    baseSectionLabel: () => t("overview.baseCardName"),
    partStepsLabel: (count: number) => t("share.partStepsCount", { count }),
    overflowPartsLabel: (remaining: number) =>
      t("share.overflowParts", { count: remaining }),
    sectionPartsLabel: () => t("share.sectionParts"),
    sectionColorsLabel: () => t("share.sectionColors"),
  };
}

/** 空Map（rangeLabel未ロード状態）用の共有参照。renderのたびに新規Mapを作らないための定数 */
const EMPTY_RANGE_MAP = new Map<string, string>();

/**
 * 候補列挙用のCandidateResolvers（表示用途。resolversRef経由でeffectの初期値として参照される）。
 * rangeLabelはこの時点では常に未解決（EMPTY_RANGE_MAP）— 実際の候補生成effect内では
 * buildRangeLabelMapの解決を待ってからbuildCandidateResolversを呼び直す（表示用途の
 * resolversRef.currentはtext既定文組み立て等、rangeLabelを使わない用途にのみ使う）。
 */
function useCandidateResolvers(
  recipe: RecipeDoc,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  return useMemo(
    () => buildCandidateResolvers(recipe, t, EMPTY_RANGE_MAP),
    [recipe, t],
  );
}

/**
 * recipe.paletteのpresetId（`<brandId>:<slug>`形式。PaintPicker.tsxの解析パターンを踏襲）
 * が属するブランドのプリセットマスタをロードし、presetId→レンジ表示名のMapを構築する。
 * レンジ非対応ブランド・custom色・マスタ内に該当presetIdが見つからない場合はMapに含まれない
 * （呼び出し側でnullに丸まる）。マスタfetch失敗はloadBrandColorsが空配列へ丸めるため、
 * 例外を投げず「そのブランド分だけレンジなし」として続行する（共有機能自体を止めない）。
 */
async function buildRangeLabelMap(
  palette: RecipeDoc["palette"],
): Promise<Map<string, string>> {
  const presetIds = palette
    .map((color) => color.presetId)
    .filter((presetId): presetId is string => presetId !== null);

  const brandIds = Array.from(
    new Set(presetIds.map((presetId) => presetId.split(":")[0])),
  ).filter((brandId): brandId is string => brandId !== undefined);

  const map = new Map<string, string>();
  await Promise.all(
    brandIds.map(async (brandId) => {
      const colors = await loadBrandColors(brandId);
      for (const color of colors) {
        if (color.range) {
          map.set(color.id, color.range);
        }
      }
    }),
  );
  return map;
}

function buildComposerContext(
  context: ShareDialogContext,
): ComposerShareContext {
  if (context.mode === "whole") {
    return { mode: "whole", recipe: context.recipe };
  }
  return { mode: "part", recipe: context.recipe, partId: context.partId };
}

type ShareRoute = "pending" | "a" | "b" | "a-text-only";

function ShareDialog({ open, onClose, context }: ShareDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [generating, setGenerating] = useState(true);
  const [images, setImages] = useState<ComposedShareImage[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [route, setRoute] = useState<ShareRoute>("pending");
  const [fallbackToB, setFallbackToB] = useState(false);
  const [text, setText] = useState("");
  // SNS切替タブの選択state（target propの廃止に伴う内部state化。既定=X）。
  // targetは候補生成に影響しない（生成はtarget非依存）ため、生成用effectの依存には含めない。
  const [targetKey, setTargetKey] = useState(DEFAULT_TARGET_KEY);
  const target =
    snsTargets.find((candidate) => candidate.key === targetKey) ??
    snsTargets[0];
  // SNS切替タブ（role="tablist"）の矢印キーナビゲーション用（WAI-ARIA tabsパターン）。
  // 移動先タブへのfocus()移動に使う（snsTargetsとindexが対応）。
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const resolvers = useCandidateResolvers(context.recipe, t);

  const headingKey =
    context.mode === "whole" ? "share.titleWhole" : "share.titlePart";

  // context・resolvers・t・toastは親の再レンダーでインライン生成されうる（recipeオブジェクト自体は
  // 毎レンダー新規参照になりうる）ため、effect依存には含めない。refで最新値を参照し、
  // 「生成対象が実質的に変わったとき」だけeffectが走るよう一次値（open・mode・recipe.id・partId）に
  // 依存を絞る（レビューRound1 Medium指摘対応）。
  const contextRef = useRef(context);
  contextRef.current = context;
  const resolversRef = useRef(resolvers);
  resolversRef.current = resolvers;
  const tRef = useRef(t);
  tRef.current = t;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const partId = context.mode === "part" ? context.partId : undefined;

  // open時に即座に投稿テキスト既定文をセットし、候補生成を開始する
  useEffect(() => {
    if (!open) {
      return;
    }
    const currentContext = contextRef.current;
    const currentResolvers = resolversRef.current;
    const currentT = tRef.current;
    const currentToast = toastRef.current;

    setText(buildDefaultText(currentContext, currentT));
    setGenerating(true);
    setImages([]);
    setSelectedIndexes([]);
    setRoute("pending");
    setFallbackToB(false);
    setTargetKey(DEFAULT_TARGET_KEY);

    let cancelled = false;
    const composerCtx = buildComposerContext(currentContext);
    // 候補0件判定（partIdがrecipe.parts内に存在しない等）はrangeLabel解決の要否に関わらず
    // 不変なので、先にEMPTY_RANGE_MAP版resolversで判定する（無駄なマスタfetchを避ける）。
    const initialSpecs = listShareCandidates(composerCtx, currentResolvers);

    if (initialSpecs.length === 0) {
      // 候補0件（§3.4手順2）: まとめカード（kind: "summary"）が常に先頭に1枚生成される
      // ため、写真ゼロのレシピでも通常は候補が空にならない。ここに到達するのは
      // partモードで対象partIdがrecipe.parts内に存在しない場合のみ（imageComposer側の
      // listShareCandidatesが空配列を返す既存挙動）。その場合は生成をスキップし
      // A系統=テキストのみ／B系統=Intentのみへ即確定する。
      setGenerating(false);
      const canShareText =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function";
      setRoute(canShareText ? "a-text-only" : "b");
      return;
    }

    void (async () => {
      // ブランド・レンジ併記（§3.4 SNSカード塗料表示 要件4）: recipe.paletteのpresetIdが
      // 属するブランドのプリセットマスタをロードし、presetId→レンジ表示名のMapを構築してから
      // resolversに反映する。マスタfetch失敗時はbuildRangeLabelMap内部でブランド単位のエラーを
      // 握り潰し空Mapに丸まる（＝レンジなし・brandのみで続行。共有機能自体を止めない）。
      const rangeLabelByPresetId = await buildRangeLabelMap(
        currentContext.recipe.palette,
      );
      if (cancelled) return;

      const resolversWithRange = buildCandidateResolvers(
        currentContext.recipe,
        currentT,
        rangeLabelByPresetId,
      );
      const specs = listShareCandidates(composerCtx, resolversWithRange);

      const deps = createDefaultComposerDeps(loadPhotoBlob);

      try {
        const result = await composeShareImages(specs, deps);
        if (cancelled) return;
        setImages(result);
        setSelectedIndexes(
          result.slice(0, SHARE_IMAGE_MAX_SELECTION).map((_, index) => index),
        );
        setGenerating(false);

        if (result.length === 0) {
          setRoute("b");
          return;
        }

        const filesForCheck = result
          .slice(0, SHARE_IMAGE_MAX_SELECTION)
          .map((c) => c.file);
        const canShareFiles =
          typeof navigator !== "undefined" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: filesForCheck });
        setRoute(canShareFiles ? "a" : "b");
      } catch {
        if (cancelled) return;
        setGenerating(false);
        currentToast.error(currentT("share.generationFailed"));
        const canShareText =
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function";
        setRoute(canShareText ? "a-text-only" : "b");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, context.mode, context.recipe.id, partId]);

  useFocusTrap({
    containerRef: dialogRef,
    open,
    onClose,
    initialFocusRef: closeButtonRef,
  });

  function handleToggleImage(index: number) {
    setSelectedIndexes((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      }
      if (prev.length >= SHARE_IMAGE_MAX_SELECTION) {
        return prev;
      }
      return [...prev, index].sort((a, b) => a - b);
    });
  }

  /** A系統主ボタン: awaitを一切挟まず同期的にnavigator.share({text, files})を呼ぶ */
  function handleShareWithFiles() {
    const files = selectedIndexes.map((index) => images[index].file);
    try {
      const result = navigator.share!({ text, files });
      result.catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setFallbackToB(true);
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setFallbackToB(true);
    }
  }

  /** A系統(候補0件・生成失敗時): テキストのみで共有 */
  function handleShareTextOnly() {
    try {
      const result = navigator.share!({ text });
      result.catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setFallbackToB(true);
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setFallbackToB(true);
    }
  }

  /**
   * 個別DL（FB-A: iOS Safariが連続DLで「進行中のDLを停止しますか」ダイアログを出す問題への
   * 対応。1タップ=1ファイルのみDLする）。旧一括DL（handleDownloadImages。削除済み）と同じ
   * anchor+objectURL方式・Safari対応のrevoke遅延パターン（click()直後の同期revokeはDL開始前に
   * Blobが失効し失敗することがあるため、1マクロタスク後にrevokeする）を単一画像に適用する。
   */
  async function handleDownloadSingleImage(image: ComposedShareImage) {
    const url = URL.createObjectURL(image.file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = image.file.name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    await new Promise((resolve) => setTimeout(resolve, 50));
    URL.revokeObjectURL(url);
  }

  function handleOpenIntent() {
    window.open(target.buildIntentUrl(text), "_blank", "noopener,noreferrer");
  }

  if (!open) {
    return null;
  }

  const effectiveRoute = fallbackToB ? "b" : route;
  const hasCandidates = images.length > 0 || generating;
  const primaryDisabled =
    generating ||
    (effectiveRoute === "a" &&
      (images.length === 0 || selectedIndexes.length === 0));

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      data-testid="share-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.headerText}>
            <span className={styles.overline}>{t("share.overline")}</span>
            <h2 id="share-dialog-title" className={styles.title}>
              {t(headingKey)}
            </h2>
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("editor.closePanel")}
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div
            className={styles.targetTabs}
            role="tablist"
            aria-label={t("share.targetTabsLabel")}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
              }
              event.preventDefault();
              const currentIndex = snsTargets.findIndex(
                (candidate) => candidate.key === targetKey,
              );
              const delta = event.key === "ArrowRight" ? 1 : -1;
              const nextIndex =
                (currentIndex + delta + snsTargets.length) % snsTargets.length;
              const nextTarget = snsTargets[nextIndex];
              if (!nextTarget) {
                return;
              }
              setTargetKey(nextTarget.key);
              tabRefs.current[nextIndex]?.focus();
            }}
          >
            {snsTargets.map((candidate, index) => (
              <button
                key={candidate.key}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                aria-selected={candidate.key === targetKey}
                tabIndex={candidate.key === targetKey ? 0 : -1}
                className={`${styles.targetTab} ${
                  candidate.key === targetKey ? styles.targetTabActive : ""
                }`}
                onClick={() => setTargetKey(candidate.key)}
              >
                {candidate.label}
              </button>
            ))}
          </div>

          {hasCandidates && (
            <ShareImagePreview
              generating={generating}
              images={images}
              selectedIndexes={selectedIndexes}
              photoCrops={context.recipe.photoCrops}
              onToggle={handleToggleImage}
              onDownload={(index) =>
                void handleDownloadSingleImage(images[index])
              }
            />
          )}

          <ShareTextEditor target={target} value={text} onChange={setText} />

          {effectiveRoute === "a" && (
            <div className={styles.routeA}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={primaryDisabled}
                onClick={handleShareWithFiles}
                data-testid="share-primary-button"
              >
                {t("share.shareWithFiles")}
              </button>
              <button
                type="button"
                className={styles.fallbackLink}
                onClick={() => setFallbackToB(true)}
              >
                {t("share.troubleLink")}
              </button>
            </div>
          )}

          {effectiveRoute === "a-text-only" && (
            <div className={styles.routeA}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleShareTextOnly}
                data-testid="share-primary-button"
              >
                {t("share.shareTextOnly")}
              </button>
              <button
                type="button"
                className={styles.fallbackLink}
                onClick={() => setFallbackToB(true)}
              >
                {t("share.troubleLink")}
              </button>
            </div>
          )}

          {effectiveRoute === "b" && (
            <div className={styles.routeB}>
              <div className={styles.stepsGuide}>
                <div className={styles.stepsGuideHeading}>
                  {t("share.manualStepsHeading")}
                </div>
                <ol className={styles.stepsList}>
                  <li>{t("share.step1Download")}</li>
                  <li>{t("share.step2OpenIntent")}</li>
                  <li>{t("share.step3Attach")}</li>
                </ol>
              </div>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleOpenIntent}
                data-testid="share-intent-button"
              >
                {t("share.openIntent", { target: target.label })}
              </button>

              <p className={styles.intentNotice}>{t("share.intentNotice")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShareDialog;
