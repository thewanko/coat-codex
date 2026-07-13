// stores/useRecipeStore.ts — 編集中レシピのZustand v5ストア（技術計画v2.3 §4.2 T16・D-8）
//
// load（lazy migration経由）・更新・autosave（debounce 500ms→Dexie書き込み）・
// 書き込み直前のtitle既定名補完（D-8）・pending塗料スロットのstrip（M4必須事項①）・
// 未使用palette色の自動GC（v2.3 §4.2 M4必須事項③）・
// 保存失敗（StorageQuotaError含む）のリスナー通知を担う。
//
// 参照同一性（M4必須事項②）: 本ストアは呼び出し側から渡されたupdaterの戻り値をそのまま
// stateへ反映するのみで、内部でdocやpalette等をdeep cloneしない。変更のない要素の参照を
// 保つ責務はupdater側（呼び出し元コンポーネント）にある。

import { create } from "zustand";
import i18next from "../i18n";
import { loadRecipe, saveRecipe } from "../db/recipeStore";
import { deletePhoto } from "../db/photoStore";
import { isPendingColorId, stripPendingPaints } from "../lib/pendingPaints";
import { gcUnusedPaletteColors } from "../lib/paletteGc";
import { collectReferencedPhotoIds } from "../lib/photoRefs";
import type { RecipeDoc, Step } from "@coat-codex/recipe-core";

const AUTOSAVE_DEBOUNCE_MS = 500;

/** autosave失敗時にリスナーへ渡すエラー情報 */
export interface SaveErrorEvent {
  error: unknown;
  recipeId: string;
}

type SaveErrorListener = (event: SaveErrorEvent) => void;

interface RecipeStoreState {
  /** 編集中のレシピ文書。未ロード時はnull */
  doc: RecipeDoc | null;
  /** load()実行中フラグ */
  isLoading: boolean;
  /** load()失敗時のエラー（成功時・未ロード時はnull） */
  loadError: unknown;
  /** 直近のautosave失敗（成功時・未発生時はnull） */
  saveError: unknown;

  /** 指定idのレシピをlazy migration込みで読み込みstateへセットする */
  load: (id: string) => Promise<void>;
  /**
   * 編集中文書をupdaterで更新し、autosaveをdebounce（500ms）でスケジュールする。
   * updaterは変更のないオブジェクト（特にpalette要素）の参照を保つこと（M4必須事項②）。
   * doc未ロード時は何もしない。
   */
  updateRecipe: (updater: (doc: RecipeDoc) => RecipeDoc) => void;
  /**
   * pending中のautosaveタイマーを即時実行（flush）してから解決するPromiseを返す。
   * pendingがない場合は即solveする。
   */
  flushAutosave: () => Promise<void>;
  /**
   * 編集セッションを終了する。pending中のautosaveがあればflushしてからstateをリセットする
   * （画面遷移時の編集内容ロスを避けるため、cancelではなくflushを既定方針とする）。
   */
  unload: () => Promise<void>;
  /** 保存失敗（StorageQuotaError含む）を通知するリスナーを登録する。unsubscribe関数を返す */
  onSaveError: (listener: SaveErrorListener) => () => void;
}

/**
 * trim後空文字なら既定名（i18nキー recipe.untitledTitle）へ置換した文書を返す（D-8②）。
 * メモリ上の編集state（doc.title）はユーザー入力のまま維持するため、この関数は
 * 保存専用の複製にのみ適用し、stateへは書き戻さない。
 */
function withResolvedTitle(doc: RecipeDoc): RecipeDoc {
  if (doc.title.trim().length !== 0) {
    return doc;
  }
  return { ...doc, title: i18next.t("recipe.untitledTitle") };
}

/**
 * Step 1件にstripPendingPaintsを適用した新しいStepを返す（実質的に変更がなければ同一参照を
 * 返す）。stripPendingPaintsはArray.filterを内部で使うため要素数0でも新規配列を返すが、
 * それはM4必須事項②が保護する「オブジェクトの参照同一性」には影響しない（配列自体の参照は
 * 各Stepごとに元々新規生成されるものであり、保護対象はpalette要素等の中身のオブジェクト）。
 * ここでは中身に変更がない場合にStepオブジェクト自体の再生成を避けることを目的とする。
 */
function stripStepPending(step: Step): Step {
  const hasPending = step.paints.some((paint) =>
    isPendingColorId(paint.colorId),
  );
  if (!hasPending) {
    return step;
  }
  const stripped = stripPendingPaints({ paints: step.paints, mix: step.mix });
  return { ...step, paints: stripped.paints, mix: stripped.mix };
}

/**
 * baseStepsとparts[].steps双方の全stepにstripPendingPaintsを適用した保存用文書を返す
 * （M4必須事項①: INV-12保護。col_pending_を持つcolorIdは永続化しない）。
 * 変更のないstep/partはそのまま同一参照を返す（M4必須事項②に合わせ不要なcloneを避ける）。
 */
function withStrippedPending(doc: RecipeDoc): RecipeDoc {
  let baseChanged = false;
  const nextBaseSteps = doc.baseSteps.map((step) => {
    const next = stripStepPending(step);
    if (next !== step) baseChanged = true;
    return next;
  });

  let partsChanged = false;
  const nextParts = doc.parts.map((part) => {
    let partStepsChanged = false;
    const nextSteps = part.steps.map((step) => {
      const next = stripStepPending(step);
      if (next !== step) partStepsChanged = true;
      return next;
    });
    if (!partStepsChanged) return part;
    partsChanged = true;
    return { ...part, steps: nextSteps };
  });

  if (!baseChanged && !partsChanged) {
    return doc;
  }

  return {
    ...doc,
    baseSteps: baseChanged ? nextBaseSteps : doc.baseSteps,
    parts: partsChanged ? nextParts : doc.parts,
  };
}

/**
 * doc.photoCrops のうち、collectReferencedPhotoIds（overviewPhotoIds・全step＝baseSteps＋
 * parts[].stepsのphotoId）のいずれからも参照されていないキーを除去した新しい文書を返す
 * （純関数。写真削除の各UI経路（StepPhotoTile/PhotoUploader等）を個別に変更せず、保存時GCで
 * 一元的にdangling cropを掃除する設計。palette[].chipPhotoIdはクロップ対象外仕様のため
 * 参照集合に含めない＝collectReferencedPhotoIdsのdocコメント参照）。
 * 除去対象が無ければdocをそのまま返す（M4必須事項②の参照同一性方針に倣う）。
 */
function gcUnusedPhotoCrops(doc: RecipeDoc): RecipeDoc {
  const referencedPhotoIds = collectReferencedPhotoIds(doc);

  const cropEntries = Object.entries(doc.photoCrops);
  const nextEntries = cropEntries.filter(([photoId]) =>
    referencedPhotoIds.has(photoId),
  );

  if (nextEntries.length === cropEntries.length) {
    return doc;
  }

  return { ...doc, photoCrops: Object.fromEntries(nextEntries) };
}

/**
 * 保存直前の変換（title既定名補完 → pending strip → dangling photoCropsのGC →
 * 未使用palette色の自動GC）をまとめて適用する（v2.3 §4.2 M4必須事項③）。除去した色の
 * chipPhotoIdはBlob削除のためremovedChipPhotoIdsとして返す（削除自体は呼び出し側=
 * performSaveの責務）。
 */
function toPersistedDoc(doc: RecipeDoc): {
  doc: RecipeDoc;
  removedChipPhotoIds: string[];
} {
  const stripped = gcUnusedPhotoCrops(
    withStrippedPending(withResolvedTitle(doc)),
  );
  return gcUnusedPaletteColors(stripped);
}

// debounceタイマー・リスナー集合はモジュールスコープで保持する（Reactの再レンダーで
// 失われてはならない実装詳細のため、Zustand stateの外に置く）。
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSaveDoc: RecipeDoc | null = null;
const saveErrorListeners = new Set<SaveErrorListener>();

function notifySaveError(event: SaveErrorEvent): void {
  for (const listener of saveErrorListeners) {
    listener(event);
  }
}

function clearAutosaveTimer(): void {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

export const useRecipeStore = create<RecipeStoreState>((set, get) => {
  /** pendingSaveDocを実際にDexieへ書き込む（タイマー経由・flush経由の共通処理） */
  async function performSave(): Promise<void> {
    const docToSave = pendingSaveDoc;
    pendingSaveDoc = null;
    clearAutosaveTimer();
    if (docToSave === null) {
      return;
    }

    const { doc: persistedDoc, removedChipPhotoIds } =
      toPersistedDoc(docToSave);

    try {
      await saveRecipe(persistedDoc);
      set({ saveError: null });
    } catch (error) {
      set({ saveError: error });
      notifySaveError({ error, recipeId: docToSave.id });
      return;
    }

    // GCで参照0になったcustom色のチップ写真Blobを回収する（v2.3 §4.2 M4必須事項③）。
    // 保存自体は完了しているため、Blob削除の成否は保存結果に影響させない
    // （失敗してもconsole.warnのみ・fire-and-forget）。
    for (const photoId of removedChipPhotoIds) {
      deletePhoto(photoId).catch((error: unknown) => {
        console.warn(
          `[useRecipeStore] GC対象のチップ写真Blob削除に失敗しました（photoId=${photoId}）`,
          error,
        );
      });
    }
  }

  function scheduleAutosave(doc: RecipeDoc): void {
    pendingSaveDoc = doc;
    clearAutosaveTimer();
    autosaveTimer = setTimeout(() => {
      void performSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  return {
    doc: null,
    isLoading: false,
    loadError: null,
    saveError: null,

    load: async (id: string) => {
      // 別レシピへの切替時に前のレシピの保存待ちが残らないよう、load開始時点でflushする。
      await performSave();
      set({ isLoading: true, loadError: null, doc: null });
      try {
        const loaded = await loadRecipe(id);
        set({ doc: loaded, isLoading: false });
      } catch (error) {
        set({ loadError: error, isLoading: false });
      }
    },

    updateRecipe: (updater) => {
      const current = get().doc;
      if (current === null) {
        return;
      }
      const next = updater(current);
      set({ doc: next });
      scheduleAutosave(next);
    },

    flushAutosave: async () => {
      await performSave();
    },

    unload: async () => {
      // pending中のautosaveはcancelではなくflushする（編集内容ロス回避を既定方針とする）。
      await performSave();
      set({ doc: null, isLoading: false, loadError: null, saveError: null });
    },

    onSaveError: (listener) => {
      saveErrorListeners.add(listener);
      return () => {
        saveErrorListeners.delete(listener);
      };
    },
  };
});

/** テスト専用: モジュールスコープの状態（タイマー・リスナー）をリセットする */
export function __resetRecipeStoreForTest(): void {
  clearAutosaveTimer();
  pendingSaveDoc = null;
  saveErrorListeners.clear();
  useRecipeStore.setState({
    doc: null,
    isLoading: false,
    loadError: null,
    saveError: null,
  });
}
