// lib/sns/imageComposer.ts — SNS共有用の合成カード画像生成（技術計画v2.2 §4.2 T37 / §3.4手順2 / §2.3）
//
// 「全体共有」（全体写真＋タイトルの1枚絵）と「パーツ共有」（全体画像＋工程写真＋工程情報の1枚絵）の
// 2モードの候補を列挙し（listShareCandidates）、各候補のレイアウト座標を計算し（computeCardLayout）、
// canvasで実際にPNG合成する（composeShareImages）。
//
// i18n非依存: 表示文字列はすべてresolvers（呼び出し側注入）で解決済みのものを受け取る。
// canvas 2Dはjsdomで動作しないため、canvas生成・写真取得はComposerDepsとして注入し、
// テストからスタブ可能にする（技術計画v2.2 §4.2 T37 完了条件）。

/** 対象文脈: 全体共有 or パーツ共有（§3.4手順2の2起点） */
export type ShareContext =
  | { mode: "whole"; recipe: RecipeDocLike }
  | { mode: "part"; recipe: RecipeDocLike; partId: string };

/**
 * imageComposerが必要とするCropRectの最小形（@coat-codex/recipe-coreのCropRectと構造的互換。
 * 元画像に対する正規化矩形。x/y/w/hはいずれも0〜1）。
 */
export interface CropRectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** imageComposerが必要とするRecipeDocの最小形（@coat-codex/recipe-coreのRecipeDocと構造的互換） */
export interface RecipeDocLike {
  title: string;
  overviewPhotoIds: string[];
  parts: PartLike[];
  /** まとめカード（whole）の全工程数集計に使用。@coat-codex/recipe-coreのRecipeDoc.baseStepsと構造的互換 */
  baseSteps: StepLike[];
  /** まとめカード（whole）のパレット全色スウォッチに使用。RecipeDoc.paletteと構造的互換（idのみ参照） */
  palette: { id: string }[];
  /**
   * 写真ごとのクロップ矩形（B-1・RecipeDoc.photoCropsと構造的互換）。共有カード生成時に
   * 該当photoIdのクロップを解決して各specへ伝搬する（B-3a）。省略時はクロップなし扱い
   * （既存呼び出し元・既存テストのRecipeDocLikeリテラルを壊さないためoptional）。
   */
  photoCrops?: Record<string, CropRectLike>;
}

export interface PartLike {
  id: string;
  /** まとめカード（part）のタイトル行（レシピ名＋パーツ名）に使用 */
  name: string;
  steps: StepLike[];
}

export interface StepLike {
  photoId: string | null;
  technique: { presetKey: string | null; label: string | null };
  paints: { colorId: string }[];
  mix: number[] | null;
  /** 印刷ビュー工程行相当のリッチ化（SNSまとめカード）用。RecipeDoc.Step.toolIdsと構造的互換 */
  toolIds: string[];
  /** 印刷ビュー工程行相当のリッチ化用。RecipeDoc.Step.memoと構造的互換 */
  memo: string;
}

/** 表示文字列の解決手段（i18n非依存にするための注入。呼び出し側がi18nキーで解決する） */
export interface CandidateResolvers {
  techniqueLabel(step: StepLike): string;
  mixBadge(step: StepLike): string;
  mixWarning(step: StepLike): string | null;
  /** 工程番号（1-based）→ 表示タグ文字列（例: "STEP 3"） */
  stepTag(n: number): string;
  paletteColor(colorId: string): {
    name: string;
    hex: string | null;
    /** ブランド名（レシピ内で同期解決可能。custom色・ブランド不明はnull） */
    brand: string | null;
    /** レンジ表示名（プリセットマスタ側の属性のため非同期解決が必要。未解決・custom色はnull） */
    rangeLabel: string | null;
  } | null;
  /**
   * まとめカード（whole）: パーツ数/全工程数の進捗文字列（例: "4パーツ・全12工程"）。
   * i18n解決込みで呼び出し側が組み立てる。
   */
  summaryProgress(partsCount: number, totalSteps: number): string;
  /** まとめカード: スウォッチ列が表示数（動的配分・ハード上限24色）を超えた際の残数表示（例: "+3"） */
  overflowColorsLabel(remaining: number): string;
  /** まとめカード（part）: 工程リストが収容上限を超えた際の残数表示（例: "…他4工程"） */
  overflowStepsLabel(remaining: number): string;
  /** まとめカード（part）: 工程のツール名列（recipe.toolsからtoolIdsを名前解決）。ツールなしは空配列 */
  toolLabels(step: StepLike): string[];
  /**
   * まとめカード（whole）: パーツ行の先頭に置く「ベース工程（全体）」の行名
   * （既存i18nキー overview.baseCardName の値と同一文言。呼び出し側が同じ解決結果を注入すること）。
   */
  baseSectionLabel(): string;
  /** まとめカード（whole）: パーツ行の工程数表示（例: "5工程"） */
  partStepsLabel(count: number): string;
  /** まとめカード（whole）: パーツ行が上限を超えた際の残数表示（例: "…他3パーツ"） */
  overflowPartsLabel(remaining: number): string;
  /** まとめカード（whole）: 「パーツ構成」セクション見出し */
  sectionPartsLabel(): string;
  /** まとめカード（whole）: 「使用カラー」セクション見出し */
  sectionColorsLabel(): string;
}

/** カードに描くスウォッチ1件分（解決済み） */
export interface SwatchSpec {
  name: string;
  hex: string | null;
  /**
   * ブランド名（レシピ内で同期解決可能。custom色・ブランド不明はnull）。
   * part写真カードの情報帯スウォッチ列で色名に併記する（whole側のパレット全色チップ列は
   * 色名を出さないため未使用のまま素通りする＝現状の描画に影響しない）。
   */
  brand: string | null;
}

/** whole候補: 全体写真1枚＋タイトルの1枚絵 */
export interface WholeCandidateSpec {
  kind: "whole";
  photoId: string;
  title: string;
  /**
   * photoIdに対するクロップ矩形（recipe.photoCrops[photoId]解決済み）。
   * クロップ未設定はnull（drawPhotoは元画像全体でのcover計算にフォールバックする）。
   * optional: 既存テストのリテラル（未指定）はクロップなし扱いのまま緑を維持する。
   */
  crop?: CropRectLike | null;
}

/** part候補: 全体画像（代表写真）＋工程写真＋工程情報の1枚絵 */
export interface PartCandidateSpec {
  kind: "part";
  /** タイトル行に表示するレシピ名（意匠強化: 情報帯内のタイトル行に使用） */
  title: string;
  /** タイトル行に表示するパーツ名（意匠強化: 情報帯内のタイトル行に使用） */
  partName: string;
  /** 全体画像（代表写真=overviewPhotoIds[0]）。全体写真が1枚もなければnull */
  overviewPhotoId: string | null;
  /**
   * overviewPhotoIdに対するクロップ矩形（recipe.photoCrops解決済み）。overviewPhotoIdがnullの
   * 場合はundefined/null。optional: 既存テストのリテラル（未指定）は緑を維持する。
   */
  overviewPhotoCrop?: CropRectLike | null;
  /** 対象工程の写真（呼び出し元はphotoId非nullの工程のみ列挙するため常に非null） */
  stepPhotoId: string;
  /**
   * stepPhotoIdに対するクロップ矩形（recipe.photoCrops解決済み）。クロップ未設定はnull。
   * optional: 既存テストのリテラル（未指定）は緑を維持する。
   */
  stepPhotoCrop?: CropRectLike | null;
  /** 工程番号（1-based）の表示タグ */
  stepTag: string;
  techniqueLabel: string;
  mixBadge: string;
  /** 合計≠100警告の継承（§2.3）。警告なしはnull */
  mixWarning: string | null;
  /** 塗料スウォッチ（paints順）。paletteColorがnullを返した要素は除外 */
  swatches: SwatchSpec[];
}

/** まとめカード工程行のスウォッチ1件分（印刷ビュー工程行の色名＋%併記に相当） */
export interface SummaryStepSwatchSpec {
  name: string;
  hex: string | null;
  /** 混合時のこの塗料の%表示（例: "25%"）。単色・percent情報なしはnull */
  percent: string | null;
  /** ブランド名（custom色・ブランド不明はnull） */
  brand: string | null;
  /** レンジ表示名（プリセットマスタ未解決・custom色はnull） */
  rangeLabel: string | null;
}

/**
 * まとめカードの工程リスト1行分（解決済み・印刷ビューPART節の工程行相当の情報密度）。
 * 朱番号＋技法名＋塗料スウォッチ（色名・%併記）＋混合バッジ／警告＋ツール名＋メモを持つ。
 */
export interface SummaryStepRow {
  /** 工程番号（1-based）の表示タグ（例: "STEP 3"） */
  stepTag: string;
  /** 工程番号（1-based）の朱番号表示に使う生数値 */
  stepNumber: number;
  techniqueLabel: string;
  /** 塗料スウォッチ（paints順・%併記）。paletteColorがnullを返した要素は除外 */
  swatches: SummaryStepSwatchSpec[];
  /** 混合バッジ文字列（"25% + 75% (1:3)"等）。単色・塗料0件は"" */
  mixBadge: string;
  /** 合計≠100警告の継承（§2.3）。警告なしはnull */
  mixWarning: string | null;
  /** ツール名列（recipe.toolsから解決済み）。ツールなしは空配列 */
  toolLabels: string[];
  /** 工程メモ（trim済み）。メモなしは"" */
  memo: string;
}

/** まとめカード（whole）のパーツ行1行分（解決済み）。「パーツ名 … N工程」の目次形式 */
export interface SummaryPartRow {
  name: string;
  stepsLabel: string;
}

/**
 * まとめカード（whole）: レシピ名・進捗・「レシピの目次」（パーツ構成一覧＋使用カラー一覧）の表紙1枚絵。
 * 2026-07-03実機フィードバック（「パーツ：工程数と使用カラーの一覧ぐらいでいい」）を受け、
 * summary(whole)は工程詳細を持たず目次に徹する（工程の詳細はsummary(part)の役割）。
 */
export interface SummaryWholeCandidateSpec {
  kind: "summary";
  variant: "whole";
  title: string;
  /** パーツ数/全工程数の進捗文字列（resolvers.summaryProgress解決済み） */
  progressLabel: string;
  /**
   * パーツ構成の目次行（baseSteps非空時は先頭に「ベース工程（全体）」行、以降parts順で
   * 工程数1以上のパーツのみ）。静的上限を超えた分はoverflowPartsLabelへ集約する。
   */
  partRows: SummaryPartRow[];
  /** パーツ行が上限を超えた場合の残数表示（resolvers.overflowPartsLabel解決済み）。超過なしはnull */
  overflowPartsLabel: string | null;
  /** 「パーツ構成」セクション見出し（resolvers.sectionPartsLabel解決済み） */
  sectionPartsLabel: string;
  /** パレット全色スウォッチ（computeSummaryWholeBudgetの動的配分・ハード上限24色）。超過分はoverflowColorsLabelへ集約 */
  swatches: SwatchSpec[];
  /** スウォッチが表示数を超えた場合の残数表示（resolvers.overflowColorsLabel解決済み）。超過なしはnull */
  overflowColorsLabel: string | null;
  /** 「使用カラー」セクション見出し（resolvers.sectionColorsLabel解決済み） */
  sectionColorsLabel: string;
}

/**
 * まとめカード（part）: レシピ名＋パーツ名・工程リスト（印刷ビュー工程行相当の情報密度）の表紙1枚絵。
 * 工程行自体に塗料スウォッチ・色名・%を持つため、下部スウォッチ一覧は廃止（2026-07-03実機フィードバック）。
 * 工程数はstepListArea（フッタ直上まで拡大）に収まるだけ動的に収容し、収まらない分はoverflowStepsLabelへ集約する。
 */
export interface SummaryPartCandidateSpec {
  kind: "summary";
  variant: "part";
  title: string;
  partName: string;
  /** 工程リスト（収容計算により動的な件数。最低1件は必ず含む） */
  steps: SummaryStepRow[];
  /** 収容上限を超えた工程数の残数表示（resolvers.overflowStepsLabel解決済み）。超過なしはnull */
  overflowStepsLabel: string | null;
}

export type SummaryCandidateSpec =
  SummaryWholeCandidateSpec | SummaryPartCandidateSpec;

export type ShareCandidateSpec =
  SummaryCandidateSpec | WholeCandidateSpec | PartCandidateSpec;

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const MARGIN = 48;
/** 共通ヘッダ帯の高さ（金淡の細罫＋金のオーバーライン1行分） */
const HEADER_HEIGHT = 56;
/** 共通フッタ帯の高さ（細罫＋"#coatcodex"1行分） */
const FOOTER_HEIGHT = 40;
/** タイトル行の高さ（写真つきカードは情報帯内の小見出し、summaryは表紙の主見出し） */
const TITLE_AREA_HEIGHT = 64;

/**
 * summary(whole)のパーツ行1行分の高さ・セクション小見出しの高さ。
 * computeCardLayoutのsummary(whole)分岐とdrawSummaryPartRows/drawSectionHeadingの
 * 両方が同じ値を参照する（レイアウト計算と描画実装の値の一致をここで保証する）。
 */
const SUMMARY_PART_ROW_HEIGHT = 40;
/** パーツ行内: 行頭からベースラインまでのオフセット（fillTextのy）。行高より小さい必要がある */
const SUMMARY_PART_ROW_BASELINE_OFFSET = 26;
/** パーツ行内: 行間の細罫のy位置（次行境界の直前）。行高から見た罫線の食い込み量 */
const SUMMARY_PART_ROW_RULE_INSET = 8;
/**
 * overflow行（「…他Nパーツ」）1行分の高さ予算。SUMMARY_PART_ROW_HEIGHTと同じ値を採用し
 * 「1行ぶん」として予算確保する（summary(part)のcomputeStepCapacityと同じ「overflow行の
 * 高さをareaの予算に含める」パターン）。
 */
const SUMMARY_PART_OVERFLOW_ROW_HEIGHT = SUMMARY_PART_ROW_HEIGHT;
/**
 * overflow行内: 行頭（rows.length行ぶんの直後）からベースラインまでのオフセット。
 * 通常行のSUMMARY_PART_ROW_BASELINE_OFFSET(26/フォント20px)よりオーバーラインが軽い
 * フォント18pxのぶん小さい値。SUMMARY_PART_OVERFLOW_ROW_HEIGHT(40)の予算内に収まる。
 */
const SUMMARY_PART_OVERFLOW_ROW_BASELINE_OFFSET = 20;
const SUMMARY_SECTION_HEADING_HEIGHT = 30;

/**
 * summary(whole)の「使用カラー」グリッドの列数（色名・ブランド併記セルを3列で並べる。
 * FB-3: 旧実装drawSwatchGridは名前なしの正方形を1行に並べるだけだったため、
 * summary(part)工程行のスウォッチ表記（色名・ブランド併記）に意匠を揃える）。
 */
const SUMMARY_COLOR_GRID_COLUMNS = 3;
/**
 * 使用カラーグリッド1行分の高さ。スウォッチ40px＋色名（15px）＋ブランド小字（13px）を
 * 縦に収めて44px（swatch下端から4pxの余白）。この値はcomputeCardLayoutのsummary(whole)
 * 分岐（colorsGridHeight計算）とdrawSummaryColorGridの両方が参照する（値の一致を保証）。
 */
const SUMMARY_COLOR_GRID_ROW_HEIGHT = 44;

/**
 * summary(whole)の行予算（bodyTop〜contentBottomの1166pxから固定オーバーヘッドを
 * 差し引いた、パーツ行・カラーグリッドの純粋な収容用高さ）。
 * 固定オーバーヘッド148px = progressReserve(48) + sectionGapTop(12) + partsHeading(30)
 *   + sectionGapMid(28) + colorsHeading(30)（computeCardLayoutのsummary(whole)分岐と同じ内訳）。
 * 1166 - 148 = 1018px。この値はcomputeSummaryWholeBudgetとcomputeCardLayoutの両方が
 * 同じ数値を参照する前提（オーバーヘッドの内訳を変更したらここも更新すること）。
 */
const SUMMARY_WHOLE_ROW_BUDGET = 1018;
/** summary(whole)のパーツ行表示数のハード上限（バランス配分の暴走防止。カラーがほぼ0でも際限なく伸ばさない） */
const SUMMARY_PARTS_HARD_MAX = 16;
/** summary(whole)のカラー表示数のハード上限（=8行×3列。パーツがほぼ0でも際限なく伸ばさない） */
const SUMMARY_COLORS_HARD_MAX = 24;
/** summary(whole)のカラー表示の最低保証行数（=6色。パーツ数が多くてもカラーセクションを潰さない） */
const SUMMARY_COLORS_MIN_ROWS = 2;

/**
 * summary(whole)のパーツ行・カラーグリッドの表示数を動的配分する（純関数）。
 * パーツ優先・カラーは残り空間へ自動拡張・最低保証ありのバランス配分（2026-07-05ユーザー要望対応）。
 *
 * 手順:
 * 1. カラーの最低予約行数（colorCount=0なら0、それ以外はceil(min(colorCount,24)/3)行と
 *    SUMMARY_COLORS_MIN_ROWS(2)行の小さい方）を先に確保する。
 * 2. 残り予算（SUMMARY_WHOLE_ROW_BUDGET − カラー最低予約）内でパーツ行数を決める
 *    （全件が収まればoverflow行なし、収まらなければoverflow行40px分を予算に含めて詰める）。
 * 3. パーツ使用後の残り予算をカラーグリッドへ渡し、行単位（44px）で表示色数を決める
 *    （3列グリッドのため行数×3が表示数の上限。超過分は最終セルの「+N」ラベルへ集約＝呼び出し側の責務）。
 *
 * export: 単体テスト対象（配分アルゴリズムの正しさをcomputeCardLayoutと独立に検算するため）。
 */
export function computeSummaryWholeBudget(
  partCount: number,
  colorCount: number,
): { partsDisplay: number; colorsDisplay: number } {
  const colorCapForReserve = Math.min(colorCount, SUMMARY_COLORS_HARD_MAX);
  const colorReserveRows =
    colorCount > 0
      ? Math.min(
          Math.ceil(colorCapForReserve / SUMMARY_COLOR_GRID_COLUMNS),
          SUMMARY_COLORS_MIN_ROWS,
        )
      : 0;
  const colorReserveHeight = colorReserveRows * SUMMARY_COLOR_GRID_ROW_HEIGHT;

  const partsBudget = SUMMARY_WHOLE_ROW_BUDGET - colorReserveHeight;
  const partsHardCapped = Math.min(partCount, SUMMARY_PARTS_HARD_MAX);
  const fitsFully =
    partsHardCapped === partCount &&
    partsHardCapped * SUMMARY_PART_ROW_HEIGHT <= partsBudget;

  let partsDisplay: number;
  let partsUsedHeight: number;
  if (fitsFully) {
    partsDisplay = partsHardCapped;
    partsUsedHeight = partsDisplay * SUMMARY_PART_ROW_HEIGHT;
  } else {
    const budgetWithOverflowRow =
      partsBudget - SUMMARY_PART_OVERFLOW_ROW_HEIGHT;
    partsDisplay = Math.min(
      partsHardCapped,
      Math.max(0, Math.floor(budgetWithOverflowRow / SUMMARY_PART_ROW_HEIGHT)),
    );
    partsUsedHeight =
      partsDisplay * SUMMARY_PART_ROW_HEIGHT +
      (partsDisplay < partCount ? SUMMARY_PART_OVERFLOW_ROW_HEIGHT : 0);
  }

  const remainingHeight = SUMMARY_WHOLE_ROW_BUDGET - partsUsedHeight;
  const colorRowsAvailable = Math.max(
    0,
    Math.floor(remainingHeight / SUMMARY_COLOR_GRID_ROW_HEIGHT),
  );
  const colorsDisplay = Math.min(
    colorCount,
    SUMMARY_COLORS_HARD_MAX,
    colorRowsAvailable * SUMMARY_COLOR_GRID_COLUMNS,
  );

  return { partsDisplay, colorsDisplay };
}

/** summary(part)の工程行1行分の高さ（技法行のみ。印刷ビュー工程行の翻案） */
const SUMMARY_STEP_ROW_HEIGHT = 44;
/** summary(part)のメモ行の高さ（memo非空の工程のみ追加） */
const SUMMARY_STEP_MEMO_ROW_HEIGHT = 30;
/** summary(part)のoverflow行（「…他N工程」）の高さ */
const SUMMARY_STEP_OVERFLOW_ROW_HEIGHT = 32;

/**
 * summary(part)の工程リスト領域（summaryStepListArea）の高さ。
 * computeCardLayoutのsummary(part)分岐と同じ計算式（bodyTop〜contentBottom）を、
 * レイアウト計算前の候補構築フェーズ（buildSummaryPartCandidate）でも使えるよう定数として複製する。
 * summarySwatchAreaを廃止したため、この高さはspecの内容に依存しない固定値になる
 * （computeCardLayoutのsummary(part)分岐を変更したら、ここも合わせて更新すること）。
 * export: 2箇所の計算式が一致し続けることをテストで固定する（レビュー指摘L3対応。
 * computeCardLayout(summaryPartSpec).summaryStepListArea.height と比較する）。
 */
export const SUMMARY_STEP_LIST_AREA_HEIGHT =
  CARD_HEIGHT -
  FOOTER_HEIGHT -
  (HEADER_HEIGHT + MARGIN / 2 + TITLE_AREA_HEIGHT);

/**
 * 工程数・メモ有無からstepListAreaに収まる件数を動的に計算する（最低1件は必ず含む）。
 * 収まらない残りがある場合はoverflow行の高さ分を予算に確保してから収容数を決める。
 */
function computeStepCapacity(rows: { hasMemo: boolean }[]): number {
  if (rows.length === 0) {
    return 0;
  }

  const rowHeight = (row: { hasMemo: boolean }) =>
    SUMMARY_STEP_ROW_HEIGHT + (row.hasMemo ? SUMMARY_STEP_MEMO_ROW_HEIGHT : 0);

  // まず全件が収まるかを確認する（overflow行の予算を取らずに済むケース）
  const totalHeight = rows.reduce((sum, row) => sum + rowHeight(row), 0);
  if (totalHeight <= SUMMARY_STEP_LIST_AREA_HEIGHT) {
    return rows.length;
  }

  // 収まらない: overflow行の高さ分を予算から差し引いてから、収まるだけ詰める
  const budget =
    SUMMARY_STEP_LIST_AREA_HEIGHT - SUMMARY_STEP_OVERFLOW_ROW_HEIGHT;
  let used = 0;
  let count = 0;
  for (const row of rows) {
    const next = used + rowHeight(row);
    if (next > budget) {
      break;
    }
    used = next;
    count += 1;
  }
  // 最低1件は必ず表示する（1件目がoverflow予算内に収まらないほど長大でも表示は保証する）
  return Math.max(1, count);
}

/**
 * whole用まとめカードのパーツ行（目次）を構築する。baseStepsが非空なら先頭に
 * 「ベース工程（全体）」行、以降parts順で工程数1以上のパーツのみを行にする
 * （工程0件のパーツは書きかけとみなしスキップ）。
 */
function buildSummaryPartRows(
  recipe: RecipeDocLike,
  resolvers: CandidateResolvers,
): SummaryPartRow[] {
  const rows: SummaryPartRow[] = [];

  if (recipe.baseSteps.length > 0) {
    rows.push({
      name: resolvers.baseSectionLabel(),
      stepsLabel: resolvers.partStepsLabel(recipe.baseSteps.length),
    });
  }

  for (const part of recipe.parts) {
    if (part.steps.length === 0) {
      continue;
    }
    rows.push({
      name: part.name,
      stepsLabel: resolvers.partStepsLabel(part.steps.length),
    });
  }

  return rows;
}

/** whole用まとめカードのスペックを構築する（全体写真の有無を問わず常に1枚生成する「レシピの表紙」） */
function buildSummaryWholeCandidate(
  recipe: RecipeDocLike,
  resolvers: CandidateResolvers,
): SummaryWholeCandidateSpec {
  const totalSteps =
    recipe.baseSteps.length +
    recipe.parts.reduce((sum, part) => sum + part.steps.length, 0);

  const allSwatches: SwatchSpec[] = recipe.palette
    .map((color) => resolvers.paletteColor(color.id))
    .filter(
      (
        color,
      ): color is NonNullable<ReturnType<CandidateResolvers["paletteColor"]>> =>
        color !== null,
    )
    .map((color) => ({ name: color.name, hex: color.hex, brand: color.brand }));

  const allPartRows = buildSummaryPartRows(recipe, resolvers);

  const { partsDisplay, colorsDisplay } = computeSummaryWholeBudget(
    allPartRows.length,
    allSwatches.length,
  );

  const partRows = allPartRows.slice(0, partsDisplay);
  const overflowPartsLabel =
    allPartRows.length > partsDisplay
      ? resolvers.overflowPartsLabel(allPartRows.length - partsDisplay)
      : null;

  const swatches = allSwatches.slice(0, colorsDisplay);
  const overflowColorsLabel =
    allSwatches.length > colorsDisplay
      ? resolvers.overflowColorsLabel(allSwatches.length - colorsDisplay)
      : null;

  return {
    kind: "summary",
    variant: "whole",
    title: recipe.title,
    progressLabel: resolvers.summaryProgress(recipe.parts.length, totalSteps),
    partRows,
    overflowPartsLabel,
    sectionPartsLabel: resolvers.sectionPartsLabel(),
    swatches,
    overflowColorsLabel,
    sectionColorsLabel: resolvers.sectionColorsLabel(),
  };
}

/** 工程1件分をpaletteColor解決込みのSummaryStepRowへ変換する（印刷ビュー工程行相当の情報密度） */
function buildSummaryStepRow(
  step: StepLike,
  index: number,
  resolvers: CandidateResolvers,
): SummaryStepRow {
  const isMixed = step.paints.length >= 2;
  const swatches: SummaryStepSwatchSpec[] = step.paints
    .map((paint, paintIndex) => {
      const color = resolvers.paletteColor(paint.colorId);
      if (color === null) {
        return null;
      }
      const percent =
        isMixed && step.mix !== null && step.mix[paintIndex] !== undefined
          ? `${step.mix[paintIndex]}%`
          : null;
      return {
        name: color.name,
        hex: color.hex,
        percent,
        brand: color.brand,
        rangeLabel: color.rangeLabel,
      };
    })
    .filter((swatch): swatch is SummaryStepSwatchSpec => swatch !== null);

  return {
    stepTag: resolvers.stepTag(index + 1),
    stepNumber: index + 1,
    techniqueLabel: resolvers.techniqueLabel(step),
    swatches,
    mixBadge: resolvers.mixBadge(step),
    mixWarning: resolvers.mixWarning(step),
    toolLabels: resolvers.toolLabels(step),
    memo: step.memo.trim(),
  };
}

/**
 * part用まとめカードのスペックを構築する（写真つき工程が0件でも常に1枚生成する「パーツの表紙」）。
 * 工程数はstepListAreaに収まるだけ動的に収容し（最低1件は必ず表示）、
 * 収まらない残りはoverflowStepsLabelへ集約する。
 */
function buildSummaryPartCandidate(
  recipe: RecipeDocLike,
  part: PartLike,
  resolvers: CandidateResolvers,
): SummaryPartCandidateSpec {
  const allRows = part.steps.map((step, index) =>
    buildSummaryStepRow(step, index, resolvers),
  );

  const capacity = computeStepCapacity(
    allRows.map((row) => ({ hasMemo: row.memo !== "" })),
  );
  const steps = allRows.slice(0, capacity);
  const overflowStepsLabel =
    allRows.length > capacity
      ? resolvers.overflowStepsLabel(allRows.length - capacity)
      : null;

  return {
    kind: "summary",
    variant: "part",
    title: recipe.title,
    partName: part.name,
    steps,
    overflowStepsLabel,
  };
}

/**
 * 候補列挙（純関数）。
 * まとめカード（kind: "summary"）が常に先頭に1枚配置される（写真ゼロのレシピでも成立する表紙）。
 * whole: まとめカード＋recipe.overviewPhotoIdsの写真順に「全体写真＋タイトル」カードのスペック。
 * part:  まとめカード（対象パーツが存在する場合のみ）＋対象パーツの steps[].photoId 非null の
 *        工程順に「全体画像＋工程写真＋工程情報」のスペック。
 * whole写真0件／part写真つき工程0件は、まとめカード以外は空（＝候補が空配列になることは実質なくなる）。
 * 存在しないpartIdは空配列（まとめカードも含めて0件。既存挙動を維持）。
 */
export function listShareCandidates(
  ctx: ShareContext,
  resolvers: CandidateResolvers,
): ShareCandidateSpec[] {
  if (ctx.mode === "whole") {
    const summary = buildSummaryWholeCandidate(ctx.recipe, resolvers);
    const wholeCards = ctx.recipe.overviewPhotoIds.map(
      (photoId): WholeCandidateSpec => ({
        kind: "whole",
        photoId,
        title: ctx.recipe.title,
        crop: ctx.recipe.photoCrops?.[photoId] ?? null,
      }),
    );
    return [summary, ...wholeCards];
  }

  const part = ctx.recipe.parts.find((p) => p.id === ctx.partId);
  if (part === undefined) {
    return [];
  }

  const overviewPhotoId = ctx.recipe.overviewPhotoIds[0] ?? null;
  const overviewPhotoCrop =
    overviewPhotoId !== null
      ? (ctx.recipe.photoCrops?.[overviewPhotoId] ?? null)
      : null;

  const candidates: PartCandidateSpec[] = [];
  part.steps.forEach((step, index) => {
    if (step.photoId === null) {
      return;
    }
    const swatches: SwatchSpec[] = step.paints
      .map((paint) => resolvers.paletteColor(paint.colorId))
      .filter(
        (
          color,
        ): color is NonNullable<
          ReturnType<CandidateResolvers["paletteColor"]>
        > => color !== null,
      )
      .map((color) => ({
        name: color.name,
        hex: color.hex,
        brand: color.brand,
      }));

    candidates.push({
      kind: "part",
      title: ctx.recipe.title,
      partName: part.name,
      overviewPhotoId,
      overviewPhotoCrop,
      stepPhotoId: step.photoId,
      stepPhotoCrop: ctx.recipe.photoCrops?.[step.photoId] ?? null,
      stepTag: resolvers.stepTag(index + 1),
      techniqueLabel: resolvers.techniqueLabel(step),
      mixBadge: resolvers.mixBadge(step),
      mixWarning: resolvers.mixWarning(step),
      swatches,
    });
  });

  const summary = buildSummaryPartCandidate(ctx.recipe, part, resolvers);
  return [summary, ...candidates];
}

/** 矩形（px）。canvas座標系（原点左上・x右+・y下+） */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** カードレイアウト計算結果（1080×1350・4:5固定） */
export interface CardLayout {
  cardWidth: number;
  cardHeight: number;
  /** 共通ヘッダ帯（金淡の細罫＋金のオーバーライン）。全カード共通で最上部に確保 */
  headerArea: Rect;
  /** 共通フッタ帯（細罫＋"#coatcodex"）。全カード共通で最下部に確保 */
  footerArea: Rect;
  /** whole: 全体写真の描画領域 / part: 工程写真の描画領域（メイン写真）/ summary: null（写真を載せない） */
  mainPhoto: Rect | null;
  /** part専用: 全体画像（代表写真）のインセット領域。whole・summary・overviewPhotoId=nullのpartはnull */
  insetPhoto: Rect | null;
  /** タイトル（レシピ名／レシピ名＋パーツ名）の描画領域。全カード共通で常設 */
  titleArea: Rect;
  /** whole/part専用: 工程情報テキスト（STEP n・技法名・バッジ等）の描画領域。summaryはnull */
  textArea: Rect | null;
  /** part専用: スウォッチ列の描画領域。whole・swatches=0件・summaryはnull（summaryはsummarySwatchArea） */
  swatchArea: Rect | null;
  /** summary(part)専用: 工程リスト（収容計算による動的行数＋overflow行）の描画領域。タイトル直下〜フッタ直上まで拡大。whole/part・summary(whole)はnull */
  summaryStepListArea: Rect | null;
  /** summary(whole)専用: 「パーツ構成」セクション（見出し＋パーツ行リスト）の描画領域。whole/part・summary(part)はnull */
  summaryPartRowsArea: Rect | null;
  /** summary(whole)専用: 「使用カラー」セクション（見出し＋パレット全色スウォッチ列）の描画領域。summary(part)は工程行に色が出るため廃止済み。whole/partはnull */
  summarySwatchArea: Rect | null;
}

/**
 * カードレイアウト計算（純関数）。カードは1080×1350（4:5）固定。
 * 全カード共通: 最上部にheaderArea・最下部にfooterAreaを確保する（秘伝書テイストの共通意匠）。
 * whole: ヘッダ直下に全体写真、下部にタイトル＋情報帯。
 * part: 主写真（工程写真）をフルブリード寄りに配置し、左下に全体画像インセット、
 *       下部帯にタイトル・工程情報テキスト、テキスト帯の下にスウォッチ列。
 * summary: 写真を載せない「表紙」。ヘッダ直下にタイトル、以降を進捗/工程リスト・スウォッチ列に充てる。
 */
export function computeCardLayout(spec: ShareCandidateSpec): CardLayout {
  const headerArea: Rect = {
    x: 0,
    y: 0,
    width: CARD_WIDTH,
    height: HEADER_HEIGHT,
  };
  const footerArea: Rect = {
    x: 0,
    y: CARD_HEIGHT - FOOTER_HEIGHT,
    width: CARD_WIDTH,
    height: FOOTER_HEIGHT,
  };
  const contentTop = HEADER_HEIGHT;
  const contentBottom = CARD_HEIGHT - FOOTER_HEIGHT;

  if (spec.kind === "summary") {
    const titleArea: Rect = {
      x: MARGIN,
      y: contentTop + MARGIN / 2,
      width: CARD_WIDTH - MARGIN * 2,
      height: TITLE_AREA_HEIGHT,
    };
    const bodyTop = titleArea.y + titleArea.height;

    if (spec.variant === "whole") {
      // summary(whole)は「レシピの目次」（2026-07-03実機フィードバック）: 進捗行の下に
      // 「パーツ構成」セクション（見出し＋パーツ行リスト。spec.partRows.length/spec.swatches.length
      // はbuildSummaryWholeCandidateでcomputeSummaryWholeBudgetによる動的バランス配分
      // （2026-07-05: 固定上限8行/12色から、パーツ優先・カラー残り空間自動拡張へ改訂）が
      // 済んでいるため、ここでは渡された件数をそのまま信じて上詰めレイアウトする＝FB-3）、
      // その下に「使用カラー」セクション（見出し＋色名・ブランド併記の3列グリッド）を縦に並べる。
      // overflow行の高さ予算はcomputeStepCapacity（summary(part)）と同じ考え方で
      // area側に含める（drawSummaryPartRowsのoverflow行がrect外にはみ出さないための保証）。
      //
      // 予算内訳（bodyTop〜contentBottomの1166pxに対して）: 固定オーバーヘッド148px
      //   = progressReserve(48) + sectionGapTop(12) + partsHeading(30) + sectionGapMid(28)
      //   + colorsHeading(30)。残り1018px（SUMMARY_WHOLE_ROW_BUDGET）をパーツ行(40px/行・
      //   overflow行も40px)とカラーグリッド(44px/行・3列)へcomputeSummaryWholeBudgetが動的配分する
      //   （配分の保証によりbottomMostはcontentBottom(1310)を超過しない。SUMMARY_COLORS_HARD_MAX/
      //   SUMMARY_PARTS_HARD_MAXはここでも二重の安全弁として掛けておく）。
      const progressReserve = 48;
      const sectionGapTop = 12;
      const sectionGapMid = 28;
      const colorSlotCount = Math.min(
        spec.swatches.length,
        SUMMARY_COLORS_HARD_MAX,
      );
      const colorGridRows = Math.max(
        1,
        Math.ceil(colorSlotCount / SUMMARY_COLOR_GRID_COLUMNS),
      );
      const colorsGridHeight = colorGridRows * SUMMARY_COLOR_GRID_ROW_HEIGHT;

      const partsHeadingY = bodyTop + progressReserve + sectionGapTop;
      const partsAreaHeight =
        SUMMARY_SECTION_HEADING_HEIGHT +
        spec.partRows.length * SUMMARY_PART_ROW_HEIGHT +
        (spec.overflowPartsLabel !== null
          ? SUMMARY_PART_OVERFLOW_ROW_HEIGHT
          : 0);
      const summaryPartRowsArea: Rect = {
        x: MARGIN,
        y: partsHeadingY,
        width: CARD_WIDTH - MARGIN * 2,
        height: partsAreaHeight,
      };

      const colorsHeadingY = partsHeadingY + partsAreaHeight + sectionGapMid;
      const colorsAreaHeight =
        SUMMARY_SECTION_HEADING_HEIGHT + colorsGridHeight;
      const summarySwatchArea: Rect = {
        x: MARGIN,
        y: colorsHeadingY,
        width: CARD_WIDTH - MARGIN * 2,
        height: colorsAreaHeight,
      };

      return {
        cardWidth: CARD_WIDTH,
        cardHeight: CARD_HEIGHT,
        headerArea,
        footerArea,
        mainPhoto: null,
        insetPhoto: null,
        titleArea,
        textArea: null,
        swatchArea: null,
        summaryStepListArea: null,
        summaryPartRowsArea,
        summarySwatchArea,
      };
    }

    // summary(part): タイトル直下からフッタ直上まで工程リストに充てる（下部スウォッチ一覧は廃止 —
    // 工程行自体に色スウォッチ・色名・%を持つため冗長。SUMMARY_STEP_LIST_AREA_HEIGHT
    // と同じ計算式のため、定数を変更したらそちらも合わせて更新すること）。
    const summaryStepListArea: Rect = {
      x: MARGIN,
      y: bodyTop,
      width: CARD_WIDTH - MARGIN * 2,
      height: contentBottom - bodyTop,
    };
    return {
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      headerArea,
      footerArea,
      mainPhoto: null,
      insetPhoto: null,
      titleArea,
      textArea: null,
      swatchArea: null,
      summaryStepListArea,
      summaryPartRowsArea: null,
      summarySwatchArea: null,
    };
  }

  if (spec.kind === "whole") {
    const infoAreaHeight = 200;
    const photoHeight = contentBottom - contentTop - infoAreaHeight;
    const photoY = contentTop;
    const titleArea: Rect = {
      x: MARGIN,
      y: photoY + photoHeight + MARGIN / 4,
      width: CARD_WIDTH - MARGIN * 2,
      height: 44,
    };
    return {
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      headerArea,
      footerArea,
      mainPhoto: { x: 0, y: photoY, width: CARD_WIDTH, height: photoHeight },
      insetPhoto: null,
      titleArea,
      textArea: {
        x: MARGIN,
        y: titleArea.y + titleArea.height,
        width: CARD_WIDTH - MARGIN * 2,
        height: contentBottom - (titleArea.y + titleArea.height),
      },
      swatchArea: null,
      summaryStepListArea: null,
      summaryPartRowsArea: null,
      summarySwatchArea: null,
    };
  }

  // part: 下部に情報帯（タイトル・工程情報テキスト・スウォッチ列）、上部を主写真領域とする。
  // infoAreaHeightは「写真領域の下端〜フッタ上端」の間に確保する帯の高さの予算。
  // titleAreaは写真領域の下端からMARGIN/2空けて始まる（= その分も予算に含めないと
  // footerAreaへ食い込む。元実装はここが未計上でswatchArea/textAreaがフッタと24px重なっていた）。
  // 修正: titleGap（MARGIN/2）をinfoAreaHeightの予算内に含め、情報帯全体をフッタ上端に揃える
  // （レビューRound1 High対応）。whole分岐は衝突なしのため据え置き。
  const titleGap = MARGIN / 2;
  const infoAreaHeight = 280;
  const swatchAreaHeight = spec.swatches.length > 0 ? 64 : 0;
  const titleHeight = 36;
  const textAreaHeight =
    infoAreaHeight - titleGap - swatchAreaHeight - titleHeight;
  const photoAreaHeight = contentBottom - contentTop - infoAreaHeight;
  const photoY = contentTop;

  const insetSize = spec.overviewPhotoId !== null ? 220 : 0;
  const insetPhoto: Rect | null =
    spec.overviewPhotoId !== null
      ? {
          x: MARGIN,
          y: photoY + photoAreaHeight - insetSize - MARGIN,
          width: insetSize,
          height: insetSize,
        }
      : null;

  const titleArea: Rect = {
    x: MARGIN,
    y: photoY + photoAreaHeight + titleGap,
    width: CARD_WIDTH - MARGIN * 2,
    height: titleHeight,
  };
  const textAreaY = titleArea.y + titleArea.height;

  return {
    cardWidth: CARD_WIDTH,
    cardHeight: CARD_HEIGHT,
    headerArea,
    footerArea,
    mainPhoto: { x: 0, y: photoY, width: CARD_WIDTH, height: photoAreaHeight },
    insetPhoto,
    titleArea,
    textArea: {
      x: MARGIN,
      y: textAreaY,
      width: CARD_WIDTH - MARGIN * 2,
      height: textAreaHeight,
    },
    swatchArea:
      spec.swatches.length > 0
        ? {
            x: MARGIN,
            y: textAreaY + textAreaHeight,
            width: CARD_WIDTH - MARGIN * 2,
            height: swatchAreaHeight,
          }
        : null,
    summaryStepListArea: null,
    summaryPartRowsArea: null,
    summarySwatchArea: null,
  };
}

/** テーマトークン値（docs/design/theme.css 由来。canvasはCSS変数を直接読めないため定数化） */
export const THEME_COLORS = {
  paper: "#F6F0E2",
  ink: "#2B241C",
  gold: "#8F6B2E",
  goldSoft: "#C9A85C",
  line: "#A69576",
  /** 朱（印刷紙面のstepNumber・工程番号色と同一。dc.html セクション06 PRINT準拠） */
  accent: "#7A2E1F",
} as const;

/** タイトル用フォントスタック（'Shippori Mincho'系明朝） */
export const TITLE_FONT_STACK =
  "'Shippori Mincho', 'Hiragino Mincho ProN', serif";
/** 本文用フォントスタック */
export const BODY_FONT_STACK =
  "'Inter', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif";
/** ヘッダ・フッタのオーバーライン用フォントスタック（EB Garamond系。dc.html ヘッダブランド文字と同一系統） */
export const OVERLINE_FONT_STACK = "'EB Garamond', 'Inter', serif";

/** ヘッダのオーバーライン文言（印刷紙面ヘッダ「coat codex — paint recipe」相当。全角表記） */
const HEADER_OVERLINE_TEXT = "COAT CODEX — PAINT RECIPE";
/** フッタの固定文言 */
const FOOTER_TAG_TEXT = "#coatcodex";

/**
 * 文字間を空けて描画する（letter-spacing風）。canvas fillTextにletter-spacingはないため、
 * 1文字ずつmeasureTextして送り幅に間隔を足しながら描く。
 */
function fillTextTracked(
  ctx: CanvasContextLike,
  text: string,
  x: number,
  y: number,
  tracking: number,
): void {
  let cursor = x;
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
}

/** 省略記号（末尾トリム用） */
const ELLIPSIS = "…";

/**
 * テキストがmaxWidthに収まらない場合、末尾を「…」に置き換えて収まるまで切り詰める
 * （ctx.measureTextで幅超過を判定。呼び出し側がctx.fontを設定済みであること）。
 * 収まる場合はそのまま返す。1文字も入らない極小幅では"…"のみを返す。
 * export: 純関数単体テスト対象（レビュー指摘M1対応。measureText幅0固定スタブでは
 * トリムロジックの分岐が実質未検証だったため、実測相当スタブでの単体テストを可能にする）。
 */
export function truncateToWidth(
  ctx: CanvasContextLike,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  if (ctx.measureText(ELLIPSIS).width > maxWidth) {
    return ELLIPSIS;
  }

  let truncated = text;
  while (
    truncated.length > 0 &&
    ctx.measureText(`${truncated}${ELLIPSIS}`).width > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}${ELLIPSIS}`;
}

/**
 * ファイル名不可文字（`/ \ : * ? " < > |`）と制御文字（U+0000–U+001F）を除去し、
 * 連続空白を1つに圧縮のうえ前後をtrimする（純関数）。結果が空文字なら"recipe"にフォールバックする。
 * 日本語等の非ASCII文字はそのまま残す。
 */
const FORBIDDEN_FILENAME_CHARS = new Set([
  "/",
  "\\",
  ":",
  "*",
  "?",
  '"',
  "<",
  ">",
  "|",
]);

export function sanitizeFileNamePart(raw: string): string {
  let withoutForbidden = "";
  for (const char of raw) {
    const codePoint = char.codePointAt(0) ?? 0;
    const isControlChar = codePoint <= 0x1f;
    if (isControlChar || FORBIDDEN_FILENAME_CHARS.has(char)) {
      continue;
    }
    withoutForbidden += char;
  }
  const stripped = withoutForbidden.replace(/\s+/g, " ").trim();
  return stripped === "" ? "recipe" : stripped;
}

/**
 * `crypto.getRandomValues`由来の`[a-z0-9]`5文字のランダム文字列を生成する。
 * Uint8Arrayから36種（a-z0-9）への剰余写像（一様性の厳密さは不要）。Math.randomは使わない。
 */
export function generateRandomSuffix(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  let result = "";
  for (const byte of bytes) {
    result += alphabet[byte % alphabet.length];
  }
  return result;
}

/**
 * ファイル名生成（純関数）。レシピ名（＋工程カードは工程名）＋ランダム5文字でPNG命名する
 * （A系統共有・B系統個別保存の両方のFile名に使用。2026-07-05ユーザー要望: 「全部同じ名前だと
 * 不便」を受け、旧・連番命名（coat-codex-share-N.png）から差し替え）。
 * - whole / summary(whole): `{title}-{suffix}.png`
 * - part（工程カード）: `{title}-{工程名}-{suffix}.png`。工程名はtechniqueLabelをsanitizeして
 *   非空ならそれ、空ならstepTag（例 "STEP 1"）にフォールバックする
 * - summary(part): `{title}-{partName}-{suffix}.png`
 */
export function buildFileName(
  spec: ShareCandidateSpec,
  randomSuffix: string,
): string {
  const title = sanitizeFileNamePart(spec.title);

  if (
    spec.kind === "whole" ||
    (spec.kind === "summary" && spec.variant === "whole")
  ) {
    return `${title}-${randomSuffix}.png`;
  }

  if (spec.kind === "part") {
    const trimmedTechnique = spec.techniqueLabel.trim();
    const stepName =
      trimmedTechnique !== ""
        ? sanitizeFileNamePart(spec.techniqueLabel)
        : spec.stepTag;
    return `${title}-${stepName}-${randomSuffix}.png`;
  }

  // summary(part)
  const partName = sanitizeFileNamePart(spec.partName);
  return `${title}-${partName}-${randomSuffix}.png`;
}

/** canvas 2D contextの最小形（本番はCanvasRenderingContext2D、テストはspy互換オブジェクト） */
export interface CanvasContextLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  /** 全面描画（画像全体をdest矩形へ引き伸ばして描く）。naturalSize取得不能時のフォールバックに使う */
  drawImage(
    image: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  measureText(text: string): { width: number };
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
}

/** canvas要素の最小形（本番はHTMLCanvasElement、テストはspy互換オブジェクト） */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: "2d"): CanvasContextLike | null;
  toBlob(
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void;
}

/** composeShareImagesの依存注入（canvasと写真取得。jsdomでcanvas 2Dが動かないため配線テスト可能にする） */
export interface ComposerDeps {
  loadPhoto(photoId: string): Promise<Blob | null>;
  createCanvas(w: number, h: number): CanvasLike;
  /** Blob→描画可能なImageSourceへの変換。省略時はcreateImageBitmapを使う既定実装 */
  decodeImage?: (blob: Blob) => Promise<CanvasImageSource>;
  /**
   * ファイル名のランダム5文字サフィックスを生成する関数。省略時はgenerateRandomSuffix
   * （crypto.getRandomValues実装）を既定にする。テスト決定化のためのDI（decodeImageと同じパターン）。
   */
  randomSuffix?: () => string;
}

/** documentの有無を問わず安全にfonts.readyをawaitする（存在しない環境ではスキップ） */
async function waitForFontsReady(): Promise<void> {
  if (
    typeof document !== "undefined" &&
    "fonts" in document &&
    document.fonts !== undefined
  ) {
    try {
      await document.fonts.ready;
    } catch {
      // fonts.readyが失敗する環境でも合成自体は継続する
    }
  }
}

/** 写真領域をプレースホルダ塗りする（Blobがnullの場合） */
function drawPhotoPlaceholder(ctx: CanvasContextLike, rect: Rect): void {
  ctx.fillStyle = THEME_COLORS.line;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

/** drawImageの9引数形式に渡す元画像側の切り出し矩形（cover配置計算の結果） */
export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * cover配置（rect全面を埋め、はみ出す側を中央クロップ・レターボックス無し）で描画するための
 * 元画像側の切り出し矩形を計算する（純関数）。dest（描画先rect）のアスペクト比を保ったまま、
 * 元画像内で最大となる中央矩形を返す。
 * ゼロ・負値ガード: src/destいずれかの幅高さが0以下の場合は例外を投げず、
 * フォールバックとして元画像全面 `{0, 0, srcWidth, srcHeight}` を返す。
 *
 * crop引数（B-3a）: 指定時は「まずcrop矩形（元画像に対する正規化矩形）でソース空間を制限し、
 * その制限された空間内でdestアスペクトのcover矩形を計算する」（クロップ→その中でcover、の2段階）。
 * 戻り値は常に元画像のピクセル座標系（cropのオフセット・スケールを織り込み済み）。
 * crop未指定（undefined/null）時は現行と完全に同一の結果を返す（既存呼び出し元・既存テスト非破壊）。
 */
export function computeCoverSourceRect(
  srcWidth: number,
  srcHeight: number,
  destWidth: number,
  destHeight: number,
  crop?: CropRectLike | null,
): SourceRect {
  if (srcWidth <= 0 || srcHeight <= 0 || destWidth <= 0 || destHeight <= 0) {
    return { sx: 0, sy: 0, sw: srcWidth, sh: srcHeight };
  }

  const cropped = crop != null;
  const spaceX = cropped ? crop.x * srcWidth : 0;
  const spaceY = cropped ? crop.y * srcHeight : 0;
  const spaceWidth = cropped ? crop.w * srcWidth : srcWidth;
  const spaceHeight = cropped ? crop.h * srcHeight : srcHeight;

  if (spaceWidth <= 0 || spaceHeight <= 0) {
    // crop矩形が退化（幅か高さが0以下）: フォールバックとしてcrop空間全体をそのまま返す
    return { sx: spaceX, sy: spaceY, sw: spaceWidth, sh: spaceHeight };
  }

  const spaceAspect = spaceWidth / spaceHeight;
  const destAspect = destWidth / destHeight;

  if (spaceAspect > destAspect) {
    // crop空間の方が横長: 高さいっぱいを使い、左右をクロップする
    const sw = spaceHeight * destAspect;
    return {
      sx: spaceX + (spaceWidth - sw) / 2,
      sy: spaceY,
      sw,
      sh: spaceHeight,
    };
  }

  if (spaceAspect < destAspect) {
    // crop空間の方が縦長: 幅いっぱいを使い、上下をクロップする
    const sh = spaceWidth / destAspect;
    return {
      sx: spaceX,
      sy: spaceY + (spaceHeight - sh) / 2,
      sw: spaceWidth,
      sh,
    };
  }

  // アスペクト比が同一: クロップ空間全体を使う
  return { sx: spaceX, sy: spaceY, sw: spaceWidth, sh: spaceHeight };
}

/**
 * CanvasImageSource（ImageBitmap等）から安全に自然寸法（width/height）を読む。
 * width/heightがnumberでない実装（SVGElement系はSVGAnimatedLength等を持つ）の場合はnullを返し、
 * 呼び出し側でcover計算をスキップして従来どおりの全面描画にフォールバックできるようにする。
 */
function readImageNaturalSize(
  image: CanvasImageSource,
): { width: number; height: number } | null {
  const candidate = image as { width?: unknown; height?: unknown };
  if (
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  ) {
    return { width: candidate.width, height: candidate.height };
  }
  return null;
}

/**
 * 写真Blobをrect内へアスペクト維持のcover配置で描画する。decode失敗時はプレースホルダ。
 * crop引数（B-3a）: 指定時はcomputeCoverSourceRectへそのまま伝搬し、クロップ矩形内でのcoverに
 * 制限する。naturalSize取得不能時の5引数フォールバック（画像全体をdestへ全面描画）は
 * ソース側の部分指定ができない形式のため、cropの有無を問わず現行のまま（全面描画）でよい
 * （クロップ不能なケースであり、意図的に非対応）。
 */
async function drawPhoto(
  ctx: CanvasContextLike,
  rect: Rect,
  photoId: string | null,
  deps: Required<Pick<ComposerDeps, "loadPhoto" | "decodeImage">>,
  crop?: CropRectLike | null,
): Promise<void> {
  if (photoId === null) {
    drawPhotoPlaceholder(ctx, rect);
    return;
  }

  const blob = await deps.loadPhoto(photoId);
  if (blob === null) {
    drawPhotoPlaceholder(ctx, rect);
    return;
  }

  try {
    const image = await deps.decodeImage(blob);
    const naturalSize = readImageNaturalSize(image);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    if (naturalSize) {
      const source: SourceRect = computeCoverSourceRect(
        naturalSize.width,
        naturalSize.height,
        rect.width,
        rect.height,
        crop,
      );
      ctx.drawImage(
        image,
        source.sx,
        source.sy,
        source.sw,
        source.sh,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
      );
    } else {
      // naturalSize取得不能: cover計算ができないため、画像全体をrect全面へ描画する
      // （5引数形式=「画像全体をdestへ」で、ソースを画像全体に固定する意味的に非等価な
      // 部分クロップを避ける。ネイティブCanvasRenderingContext2D.drawImageの正規オーバーロード）。
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    }
    ctx.restore();
  } catch {
    drawPhotoPlaceholder(ctx, rect);
  }
}

/** カード背景（紙色）の全面塗り。写真描画より前に呼ぶこと（後に呼ぶと写真を上書きしてしまう） */
function drawCardBackground(ctx: CanvasContextLike, layout: CardLayout): void {
  ctx.fillStyle = THEME_COLORS.paper;
  ctx.fillRect(0, 0, layout.cardWidth, layout.cardHeight);
}

/**
 * 共通ヘッダ帯（背景→写真の後、前景として描く）: 上辺の金淡細罫＋金のオーバーライン小文字。
 * 描画順序の不変条件（背景→写真→前景）を維持するため、composeShareImages内で写真描画の後に呼ぶこと。
 */
function drawCardHeader(ctx: CanvasContextLike, layout: CardLayout): void {
  ctx.fillStyle = THEME_COLORS.goldSoft;
  ctx.fillRect(
    layout.headerArea.x,
    layout.headerArea.y + layout.headerArea.height - 1,
    layout.headerArea.width,
    1,
  );

  ctx.fillStyle = THEME_COLORS.gold;
  ctx.font = `500 13px ${OVERLINE_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  fillTextTracked(
    ctx,
    HEADER_OVERLINE_TEXT,
    MARGIN,
    layout.headerArea.y + layout.headerArea.height / 2 + 5,
    2.5,
  );
}

/** 共通フッタ帯（背景→写真の後、前景として描く）: 下辺の細罫＋"#coatcodex"の金の右寄せ小文字 */
function drawCardFooter(ctx: CanvasContextLike, layout: CardLayout): void {
  ctx.fillStyle = THEME_COLORS.line;
  ctx.fillRect(
    layout.footerArea.x,
    layout.footerArea.y,
    layout.footerArea.width,
    1,
  );

  ctx.fillStyle = THEME_COLORS.gold;
  ctx.font = `400 16px ${BODY_FONT_STACK}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    FOOTER_TAG_TEXT,
    layout.footerArea.x + layout.footerArea.width - MARGIN,
    layout.footerArea.y + layout.footerArea.height / 2 + 6,
  );
  ctx.textAlign = "left";
}

/**
 * タイトル行（レシピ名／レシピ名＋パーツ名）を明朝で描く。全カード共通の常設要素。
 * fontSizeは呼び出し側の階層意図で変える（summary/whole=主見出し、part=STEP nの下の小見出し）。
 */
function drawTitle(
  ctx: CanvasContextLike,
  layout: CardLayout,
  text: string,
  fontSize = 32,
): void {
  ctx.fillStyle = THEME_COLORS.ink;
  ctx.font = `600 ${fontSize}px ${TITLE_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    text,
    layout.titleArea.x,
    layout.titleArea.y + layout.titleArea.height * 0.7,
    layout.titleArea.width,
  );
}

/** part写真カードのスウォッチ列1ブロック分の幅（チップ＋色名/ブランドラベルの収容幅） */
const PART_SWATCH_BLOCK_WIDTH = 190;

/**
 * スウォッチ列を描く共通ヘルパー（whole/part/summary共通の意匠）。overflowLabelがあれば末尾に金文字で添える。
 * 色名（＋ブランド。あれば）をチップの右にmuted小文字で併記する（レンジはこの列の高さの都合で省略。
 * §3.4 SNSカード塗料表示 要件3: part写真カード情報帯スウォッチ列のブランド併記）。
 */
function drawSwatchRow(
  ctx: CanvasContextLike,
  area: Rect,
  swatches: SwatchSpec[],
  overflowLabel: string | null,
): void {
  const swatchSize = 40;
  const blockWidth = PART_SWATCH_BLOCK_WIDTH;
  const labelMaxWidth = blockWidth - swatchSize - 10;

  swatches.forEach((swatch, index) => {
    const x = area.x + index * blockWidth;
    const y = area.y;
    ctx.fillStyle = swatch.hex ?? THEME_COLORS.line;
    ctx.fillRect(x, y, swatchSize, swatchSize);
    ctx.strokeStyle = THEME_COLORS.line;
    ctx.strokeRect(x, y, swatchSize, swatchSize);

    const labelX = x + swatchSize + 10;
    ctx.fillStyle = THEME_COLORS.ink;
    ctx.font = `400 15px ${BODY_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      truncateToWidth(ctx, swatch.name, labelMaxWidth),
      labelX,
      y + swatchSize / 2 - 3,
    );

    if (swatch.brand !== null) {
      ctx.fillStyle = THEME_COLORS.line;
      ctx.font = `400 13px ${BODY_FONT_STACK}`;
      ctx.fillText(
        truncateToWidth(ctx, swatch.brand, labelMaxWidth),
        labelX,
        y + swatchSize / 2 + 14,
      );
    }
  });

  if (overflowLabel !== null) {
    const x = area.x + swatches.length * blockWidth;
    ctx.fillStyle = THEME_COLORS.gold;
    ctx.font = `600 20px ${BODY_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(overflowLabel, x, area.y + swatchSize / 2 + 7);
  }
}

function drawWholeCard(
  ctx: CanvasContextLike,
  spec: WholeCandidateSpec,
  layout: CardLayout,
): void {
  drawTitle(ctx, layout, spec.title);
}

function drawPartCard(
  ctx: CanvasContextLike,
  spec: PartCandidateSpec,
  layout: CardLayout,
): void {
  const textArea = layout.textArea!;

  drawTitle(ctx, layout, `${spec.title} — ${spec.partName}`, 22);

  ctx.fillStyle = THEME_COLORS.accent;
  ctx.font = `600 28px ${BODY_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(spec.stepTag, textArea.x, textArea.y + 32);

  ctx.fillStyle = THEME_COLORS.ink;
  ctx.font = `500 26px ${BODY_FONT_STACK}`;
  ctx.fillText(
    spec.techniqueLabel,
    textArea.x,
    textArea.y + 68,
    textArea.width,
  );

  if (spec.mixBadge !== "") {
    ctx.fillStyle = THEME_COLORS.goldSoft;
    ctx.font = `400 22px ${BODY_FONT_STACK}`;
    ctx.fillText(spec.mixBadge, textArea.x, textArea.y + 100, textArea.width);
  }

  if (spec.mixWarning !== null) {
    ctx.fillStyle = THEME_COLORS.ink;
    ctx.font = `400 20px ${BODY_FONT_STACK}`;
    ctx.fillText(spec.mixWarning, textArea.x, textArea.y + 132, textArea.width);
  }

  if (layout.swatchArea !== null) {
    drawSwatchRow(ctx, layout.swatchArea, spec.swatches, null);
  }
}

/**
 * まとめカード共通のセクション小見出しを描く（金のオーバーライン風小文字。既存カード意匠と一貫）。
 * areaの最上部に描き、戻り値としてこの見出し直下のyオフセット（次要素の開始位置）を返す。
 */
function drawSectionHeading(
  ctx: CanvasContextLike,
  area: Rect,
  label: string,
): number {
  ctx.fillStyle = THEME_COLORS.gold;
  ctx.font = `500 15px ${OVERLINE_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  fillTextTracked(ctx, label, area.x, area.y + 14, 1.5);
  return area.y + SUMMARY_SECTION_HEADING_HEIGHT;
}

/**
 * summary(whole)のパーツ行リストを描く（「パーツ名 … N工程」の目次形式）。
 * パーツ名は左寄せ・工程数ラベルは行右端に右寄せ。名前が幅超過時はtruncateToWidthで詰める。
 */
function drawSummaryPartRows(
  ctx: CanvasContextLike,
  area: Rect,
  headingLabel: string,
  rows: SummaryPartRow[],
  overflowLabel: string | null,
): void {
  const rowsTop = drawSectionHeading(ctx, area, headingLabel);
  const rowWidth = area.width;

  rows.forEach((row, index) => {
    // SUMMARY_PART_ROW_HEIGHT（行高）を前提としたベースライン位置（行頭からのオフセット）
    const baselineY =
      rowsTop +
      index * SUMMARY_PART_ROW_HEIGHT +
      SUMMARY_PART_ROW_BASELINE_OFFSET;

    ctx.font = `400 20px ${BODY_FONT_STACK}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = THEME_COLORS.goldSoft;
    ctx.fillText(row.stepsLabel, area.x + rowWidth, baselineY);
    const stepsLabelWidth = ctx.measureText(row.stepsLabel).width;

    ctx.font = `500 20px ${BODY_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.fillStyle = THEME_COLORS.ink;
    const nameMaxWidth = rowWidth - stepsLabelWidth - 24;
    ctx.fillText(
      truncateToWidth(ctx, row.name, Math.max(0, nameMaxWidth)),
      area.x,
      baselineY,
    );

    // 行間の細罫（印刷ビューstepRowのborder-bottom相当。次行境界からSUMMARY_PART_ROW_RULE_INSETぶん上）
    const ruleY =
      rowsTop +
      (index + 1) * SUMMARY_PART_ROW_HEIGHT -
      SUMMARY_PART_ROW_RULE_INSET;
    ctx.fillStyle = THEME_COLORS.line;
    ctx.fillRect(area.x, ruleY, rowWidth, 1);
  });

  if (overflowLabel !== null) {
    // overflow行はrows.length行ぶんの直後（SUMMARY_PART_OVERFLOW_ROW_HEIGHT予算の枠内）に
    // ベースラインオフセットSUMMARY_PART_OVERFLOW_ROW_BASELINE_OFFSETで配置する。
    const y =
      rowsTop +
      rows.length * SUMMARY_PART_ROW_HEIGHT +
      SUMMARY_PART_OVERFLOW_ROW_BASELINE_OFFSET;
    ctx.fillStyle = THEME_COLORS.gold;
    ctx.font = `600 18px ${BODY_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(overflowLabel, area.x, y);
  }
}

/**
 * まとめカード（summary/whole）: レシピ名＋進捗＋「パーツ構成」（目次）＋「使用カラー」の表紙意匠。
 * 2026-07-03実機フィードバック（「パーツ：工程数と使用カラーの一覧ぐらいでいい」）を受け、
 * summary(whole)は「レシピの目次」に徹する（工程の詳細はsummary(part)の役割）。
 */
function drawSummaryWholeCard(
  ctx: CanvasContextLike,
  spec: SummaryWholeCandidateSpec,
  layout: CardLayout,
): void {
  drawTitle(ctx, layout, spec.title);

  ctx.fillStyle = THEME_COLORS.accent;
  ctx.font = `500 22px ${BODY_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    spec.progressLabel,
    layout.titleArea.x,
    layout.titleArea.y + layout.titleArea.height + 32,
  );

  if (layout.summaryPartRowsArea !== null) {
    drawSummaryPartRows(
      ctx,
      layout.summaryPartRowsArea,
      spec.sectionPartsLabel,
      spec.partRows,
      spec.overflowPartsLabel,
    );
  }

  if (layout.summarySwatchArea !== null) {
    const area = layout.summarySwatchArea;
    const gridTop = drawSectionHeading(ctx, area, spec.sectionColorsLabel);
    const gridArea: Rect = {
      x: area.x,
      y: gridTop,
      width: area.width,
      height: area.height - SUMMARY_SECTION_HEADING_HEIGHT,
    };
    // 色名・ブランド併記の3列グリッド（FB-3: 旧drawSwatchGridは名前なしの正方形羅列だった）
    drawSummaryColorGrid(
      ctx,
      gridArea,
      spec.swatches,
      spec.overflowColorsLabel,
    );
  }
}

/** summary(part)工程行内の小スウォッチの1辺サイズ（印刷ビューSwatchChip smサイズの翻案） */
const STEP_SWATCH_SIZE = 16;
/** stepNumber列の固定幅（右揃え。印刷ビューstepNumber列の翻案） */
const STEP_NUMBER_COLUMN_WIDTH = 40;
/** 技法名列の開始x（stepNumber列の直後） */
const STEP_TECHNIQUE_COLUMN_X = STEP_NUMBER_COLUMN_WIDTH + 16;
/** 技法名列の固定幅（この直後からスウォッチ列が始まる） */
const STEP_TECHNIQUE_COLUMN_WIDTH = 160;

/**
 * summary(part)の工程行1行を描く（印刷ビューPART節の工程行の翻案）。
 * 朱番号（右揃え固定幅）→技法名→塗料スウォッチ（16px＋色名＋%）→混合バッジ（警告時は朱文字併記）
 * →ツール名（行右端に右寄せ）の順。長い色名・ツール名はtruncateToWidthで領域内にトリムする。
 * メモがあれば技法行の下にmuted 1行トリムで描く。戻り値はこの行が占めた高さ（次行のyオフセット計算用）。
 */
function drawSummaryStepRow(
  ctx: CanvasContextLike,
  row: SummaryStepRow,
  area: Rect,
  rowTop: number,
): number {
  const baselineY = rowTop + 28;

  // 朱番号（stepNumber列内で右揃え）
  ctx.fillStyle = THEME_COLORS.accent;
  ctx.font = `600 20px ${BODY_FONT_STACK}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    String(row.stepNumber),
    area.x + STEP_NUMBER_COLUMN_WIDTH,
    baselineY,
  );
  ctx.textAlign = "left";

  // 技法名（600・墨）
  ctx.fillStyle = THEME_COLORS.ink;
  ctx.font = `600 20px ${BODY_FONT_STACK}`;
  const techniqueX = area.x + STEP_TECHNIQUE_COLUMN_X;
  ctx.fillText(
    truncateToWidth(ctx, row.techniqueLabel, STEP_TECHNIQUE_COLUMN_WIDTH),
    techniqueX,
    baselineY,
    STEP_TECHNIQUE_COLUMN_WIDTH,
  );

  // ツール名（行右端に右寄せ・muted）を先に幅計算しておき、スウォッチ/バッジ列の右限とする
  const toolText = row.toolLabels.join("、");
  let rightLimit = area.x + area.width;
  if (toolText !== "") {
    ctx.font = `400 15px ${BODY_FONT_STACK}`;
    const toolMaxWidth = area.width * 0.22;
    const truncatedTool = truncateToWidth(ctx, toolText, toolMaxWidth);
    ctx.fillStyle = THEME_COLORS.line;
    ctx.textAlign = "right";
    ctx.fillText(truncatedTool, rightLimit, baselineY);
    ctx.textAlign = "left";
    rightLimit -= ctx.measureText(truncatedTool).width + 20;
  }

  // 塗料スウォッチ（16px矩形＋色名＋%）とその後の混合バッジ／警告
  let cursorX =
    area.x + STEP_TECHNIQUE_COLUMN_X + STEP_TECHNIQUE_COLUMN_WIDTH + 16;
  const swatchTop = rowTop + 6;
  const swatchStartX = cursorX;

  // mixBadge・mixWarningの表示分を先にrightLimitから予約する（色名に食われてバッジ/警告が
  // 消えないため）。実測幅を使うが、行の大半を占有しないよう上限（行幅の28%）を設ける。
  const reserveMaxWidth = area.width * 0.28;
  ctx.font = `400 14px ${BODY_FONT_STACK}`;
  const mixBadgeReserve =
    row.mixBadge !== ""
      ? Math.min(ctx.measureText(row.mixBadge).width, reserveMaxWidth) + 12
      : 0;
  ctx.font = `400 13px ${BODY_FONT_STACK}`;
  const mixWarningReserve =
    row.mixWarning !== null
      ? Math.min(ctx.measureText(row.mixWarning).width, reserveMaxWidth) + 12
      : 0;
  const swatchRightLimit = Math.max(
    swatchStartX,
    rightLimit - mixBadgeReserve - mixWarningReserve,
  );

  // 色ブロック（スウォッチ16px＋ギャップ6px＋色名/%＋ブランド・レンジ併記＋末尾ギャップ18px）の
  // 固定コストを除いた残り幅を、残り色数で公平分配する（固定上限130pxを撤廃 — 単色工程では
  // 大量に余白が余るのに早期に「…」トリムされていた問題の是正・2026-07-03ユーザー指摘）。
  const swatchFixedCost = STEP_SWATCH_SIZE + 6 + 18;

  for (let i = 0; i < row.swatches.length; i += 1) {
    const swatch = row.swatches[i];
    if (cursorX >= swatchRightLimit - STEP_SWATCH_SIZE) {
      break;
    }
    ctx.fillStyle = swatch.hex ?? THEME_COLORS.paper;
    ctx.fillRect(cursorX, swatchTop, STEP_SWATCH_SIZE, STEP_SWATCH_SIZE);
    ctx.strokeStyle = THEME_COLORS.line;
    ctx.strokeRect(cursorX, swatchTop, STEP_SWATCH_SIZE, STEP_SWATCH_SIZE);
    cursorX += STEP_SWATCH_SIZE + 6;

    const remainingColors = row.swatches.length - i;
    const remainingWidth = swatchRightLimit - cursorX;
    const otherBlocksFixedCost = (remainingColors - 1) * swatchFixedCost;
    const maxSwatchWidth = Math.max(
      0,
      (remainingWidth - otherBlocksFixedCost) / remainingColors,
    );

    const label =
      swatch.percent !== null
        ? `${swatch.name} ${swatch.percent}`
        : swatch.name;
    ctx.fillStyle = THEME_COLORS.ink;
    ctx.font = `400 15px ${BODY_FONT_STACK}`;
    const available = Math.min(maxSwatchWidth, swatchRightLimit - cursorX);
    const truncatedLabel = truncateToWidth(ctx, label, Math.max(0, available));
    ctx.fillText(truncatedLabel, cursorX, baselineY - 5);
    cursorX += ctx.measureText(truncatedLabel).width + 6;

    // ブランド・レンジ併記（muted小サイズ）。両方nullは省略、brandのみ・両方ありの2形態
    const meta =
      swatch.brand !== null && swatch.rangeLabel !== null
        ? `${swatch.brand}・${swatch.rangeLabel}`
        : (swatch.brand ?? null);
    if (meta !== null) {
      ctx.fillStyle = THEME_COLORS.line;
      ctx.font = `400 12px ${BODY_FONT_STACK}`;
      const metaAvailable = swatchRightLimit - cursorX;
      if (metaAvailable > 0) {
        const truncatedMeta = truncateToWidth(ctx, meta, metaAvailable);
        ctx.fillText(truncatedMeta, cursorX, baselineY - 5);
        cursorX += ctx.measureText(truncatedMeta).width;
      }
    }
    cursorX += 18;
  }

  // バッジ/警告は予約済みのrightLimit（swatchRightLimitを差し引く前のoriginal）まで使える
  if (row.mixBadge !== "" && cursorX < rightLimit) {
    ctx.font = `400 14px ${BODY_FONT_STACK}`;
    const available = rightLimit - cursorX;
    const truncatedBadge = truncateToWidth(
      ctx,
      row.mixBadge,
      Math.max(0, available),
    );
    ctx.fillStyle = THEME_COLORS.goldSoft;
    ctx.fillText(truncatedBadge, cursorX, baselineY - 5);
    cursorX += ctx.measureText(truncatedBadge).width + 12;
  }

  if (row.mixWarning !== null && cursorX < rightLimit) {
    ctx.font = `400 13px ${BODY_FONT_STACK}`;
    const available = rightLimit - cursorX;
    const truncatedWarning = truncateToWidth(
      ctx,
      row.mixWarning,
      Math.max(0, available),
    );
    ctx.fillStyle = THEME_COLORS.accent;
    ctx.fillText(truncatedWarning, cursorX, baselineY - 5);
  }

  let usedHeight = SUMMARY_STEP_ROW_HEIGHT;

  // メモ行（memo非空時のみ・muted・1行トリム）
  if (row.memo !== "") {
    const memoY = rowTop + SUMMARY_STEP_ROW_HEIGHT + 8;
    ctx.fillStyle = THEME_COLORS.line;
    ctx.font = `400 15px ${BODY_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.fillText(
      truncateToWidth(ctx, row.memo, area.width - STEP_TECHNIQUE_COLUMN_X),
      area.x + STEP_TECHNIQUE_COLUMN_X,
      memoY,
    );
    usedHeight += SUMMARY_STEP_MEMO_ROW_HEIGHT;
  }

  // 行間の細罫（印刷ビューstepRowのborder-bottom相当）
  ctx.fillStyle = THEME_COLORS.line;
  ctx.fillRect(area.x, rowTop + usedHeight - 4, area.width, 1);

  return usedHeight;
}

/** まとめカード（summary/part）: レシピ名＋パーツ名・工程リスト（印刷ビュー工程行相当の情報密度）の表紙意匠 */
function drawSummaryPartCard(
  ctx: CanvasContextLike,
  spec: SummaryPartCandidateSpec,
  layout: CardLayout,
): void {
  drawTitle(ctx, layout, `${spec.title} — ${spec.partName}`);

  if (layout.summaryStepListArea !== null) {
    const area = layout.summaryStepListArea;
    let rowTop = area.y;
    for (const row of spec.steps) {
      rowTop += drawSummaryStepRow(ctx, row, area, rowTop);
    }

    if (spec.overflowStepsLabel !== null) {
      const y = rowTop + SUMMARY_STEP_OVERFLOW_ROW_HEIGHT * 0.6;
      ctx.fillStyle = THEME_COLORS.goldSoft;
      ctx.font = `400 18px ${BODY_FONT_STACK}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(spec.overflowStepsLabel, area.x, y);
    }
  }
}

/** 使用カラーグリッド1セル内のスウォッチ辺長（drawSwatchRowと共通の意匠） */
const SUMMARY_COLOR_SWATCH_SIZE = 40;

/**
 * summary(whole)「使用カラー」セクション専用: 色名・ブランド併記のセルを
 * SUMMARY_COLOR_GRID_COLUMNS列のグリッドで描く（FB-3）。
 * 1セル =「スウォッチ（塗り＋線色枠）＋右に色名（ink・15px）＋その下にブランド小字
 * （line色・13px。brandがnullなら省略）」で、summary(part)工程行のスウォッチ表記
 * （drawSummaryStepRow）と意匠を揃える。色名はセル幅内でtruncateToWidthして詰める。
 * overflowLabelはbuildSummaryWholeCandidate（computeSummaryWholeBudget）の仕様上、
 * swatches.length===colorsDisplay（配分された表示数ぶんグリッドが埋まっている）の
 * 時のみ非nullになるため、新規セル/行を追加せず最終行の右端に金文字で添える。
 */
function drawSummaryColorGrid(
  ctx: CanvasContextLike,
  area: Rect,
  swatches: SwatchSpec[],
  overflowLabel: string | null,
): void {
  const swatchSize = SUMMARY_COLOR_SWATCH_SIZE;
  const columns = SUMMARY_COLOR_GRID_COLUMNS;
  const cellWidth = area.width / columns;
  const labelMaxWidth = cellWidth - swatchSize - 12 - 8;

  swatches.forEach((swatch, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = area.x + col * cellWidth;
    const y = area.y + row * SUMMARY_COLOR_GRID_ROW_HEIGHT;

    ctx.fillStyle = swatch.hex ?? THEME_COLORS.line;
    ctx.fillRect(x, y, swatchSize, swatchSize);
    ctx.strokeStyle = THEME_COLORS.line;
    ctx.strokeRect(x, y, swatchSize, swatchSize);

    const labelX = x + swatchSize + 12;
    ctx.fillStyle = THEME_COLORS.ink;
    ctx.font = `400 15px ${BODY_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      truncateToWidth(ctx, swatch.name, Math.max(0, labelMaxWidth)),
      labelX,
      y + swatchSize / 2 - 3,
    );

    if (swatch.brand !== null) {
      ctx.fillStyle = THEME_COLORS.line;
      ctx.font = `400 13px ${BODY_FONT_STACK}`;
      ctx.fillText(
        truncateToWidth(ctx, swatch.brand, Math.max(0, labelMaxWidth)),
        labelX,
        y + swatchSize / 2 + 14,
      );
    }
  });

  if (overflowLabel !== null) {
    const lastRow = Math.max(0, Math.ceil(swatches.length / columns) - 1);
    const y = area.y + lastRow * SUMMARY_COLOR_GRID_ROW_HEIGHT;
    ctx.fillStyle = THEME_COLORS.gold;
    ctx.font = `600 20px ${BODY_FONT_STACK}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(overflowLabel, area.x + area.width, y + swatchSize / 2 + 7);
    ctx.textAlign = "left";
  }
}

async function defaultDecodeImage(blob: Blob): Promise<CanvasImageSource> {
  return createImageBitmap(blob);
}

/** canvas.toBlobをPromise化する */
function canvasToBlob(canvas: CanvasLike): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/**
 * composeShareImagesが返す1候補分のペア（候補スペックと生成されたFileの対応）。
 * 呼び出し側（T39）が候補カードとFileをindexズレなく対応させられるようにする。
 */
export interface ComposedShareImage {
  spec: ShareCandidateSpec;
  file: File;
}

/**
 * 合成本体: 全候補を {spec, file} のペア配列（image/png）で返す。
 * canvas取得失敗・toBlob null時は当該候補のみスキップし、候補とFileの対応を崩さない。
 * ファイル名は候補ごとにbuildFileName（レシピ名＋内容＋ランダム5文字）で生成する
 * （2026-07-05ユーザー要望対応。旧・連番命名から差し替え）。
 * 最大4枚の選定は呼び出し側（T39）の責務なので全件生成する。
 */
export async function composeShareImages(
  specs: ShareCandidateSpec[],
  deps: ComposerDeps,
): Promise<ComposedShareImage[]> {
  await waitForFontsReady();

  const decodeImage = deps.decodeImage ?? defaultDecodeImage;
  const randomSuffix = deps.randomSuffix ?? generateRandomSuffix;
  const photoDeps = { loadPhoto: deps.loadPhoto, decodeImage };

  const results: ComposedShareImage[] = [];

  for (const spec of specs) {
    const layout = computeCardLayout(spec);
    const canvas = deps.createCanvas(layout.cardWidth, layout.cardHeight);
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      continue;
    }

    drawCardBackground(ctx, layout);

    if (spec.kind === "summary") {
      // summaryは写真を載せない（背景→前景のみ。写真描画ステップ自体が存在しない）
      if (spec.variant === "whole") {
        drawSummaryWholeCard(ctx, spec, layout);
      } else {
        drawSummaryPartCard(ctx, spec, layout);
      }
    } else if (spec.kind === "whole") {
      await drawPhoto(
        ctx,
        layout.mainPhoto!,
        spec.photoId,
        photoDeps,
        spec.crop ?? null,
      );
      drawWholeCard(ctx, spec, layout);
    } else {
      await drawPhoto(
        ctx,
        layout.mainPhoto!,
        spec.stepPhotoId,
        photoDeps,
        spec.stepPhotoCrop ?? null,
      );
      if (layout.insetPhoto !== null) {
        await drawPhoto(
          ctx,
          layout.insetPhoto,
          spec.overviewPhotoId,
          photoDeps,
          spec.overviewPhotoCrop ?? null,
        );
      }
      drawPartCard(ctx, spec, layout);
    }

    // 共通ヘッダ/フッタは前景要素（背景→写真→前景の不変条件を維持し、写真描画の後に呼ぶ）
    drawCardHeader(ctx, layout);
    drawCardFooter(ctx, layout);

    const blob = await canvasToBlob(canvas);
    if (blob === null) {
      continue;
    }

    const file = new File([blob], buildFileName(spec, randomSuffix()), {
      type: "image/png",
    });
    results.push({ spec, file });
  }

  return results;
}

/**
 * 本番用ComposerDepsファクトリ。document.createElement("canvas")を実配線する。
 * loadPhoto実装（本番はdb.photos読み。src/db/photoStore.ts参照）は呼び出し側から注入させる
 * （db層への直接依存を避け、imageComposerを独立モジュールに保つため）。
 */
export function createDefaultComposerDeps(
  loadPhoto: (photoId: string) => Promise<Blob | null>,
): ComposerDeps {
  return {
    loadPhoto,
    createCanvas: (w, h) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      return canvas as unknown as CanvasLike;
    },
    decodeImage: defaultDecodeImage,
  };
}
