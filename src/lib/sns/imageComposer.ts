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

/** imageComposerが必要とするRecipeDocの最小形（models/recipe.tsのRecipeDocと構造的互換） */
export interface RecipeDocLike {
  title: string;
  overviewPhotoIds: string[];
  parts: PartLike[];
  /** まとめカード（whole）の全工程数集計に使用。models/recipe.tsのRecipeDoc.baseStepsと構造的互換 */
  baseSteps: StepLike[];
  /** まとめカード（whole）のパレット全色スウォッチに使用。RecipeDoc.paletteと構造的互換（idのみ参照） */
  palette: { id: string }[];
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
}

/** 表示文字列の解決手段（i18n非依存にするための注入。呼び出し側がi18nキーで解決する） */
export interface CandidateResolvers {
  techniqueLabel(step: StepLike): string;
  mixBadge(step: StepLike): string;
  mixWarning(step: StepLike): string | null;
  /** 工程番号（1-based）→ 表示タグ文字列（例: "STEP 3"） */
  stepTag(n: number): string;
  paletteColor(colorId: string): { name: string; hex: string | null } | null;
  /**
   * まとめカード（whole）: パーツ数/全工程数の進捗文字列（例: "4パーツ・全12工程"）。
   * i18n解決込みで呼び出し側が組み立てる。
   */
  summaryProgress(partsCount: number, totalSteps: number): string;
  /** まとめカード: スウォッチ列が上限（12色）を超えた際の残数表示（例: "+3"） */
  overflowColorsLabel(remaining: number): string;
  /** まとめカード（part）: 工程リストが上限（8行）を超えた際の残数表示（例: "…他4工程"） */
  overflowStepsLabel(remaining: number): string;
}

/** カードに描くスウォッチ1件分（解決済み） */
export interface SwatchSpec {
  name: string;
  hex: string | null;
}

/** whole候補: 全体写真1枚＋タイトルの1枚絵 */
export interface WholeCandidateSpec {
  kind: "whole";
  photoId: string;
  title: string;
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
  /** 対象工程の写真（呼び出し元はphotoId非nullの工程のみ列挙するため常に非null） */
  stepPhotoId: string;
  /** 工程番号（1-based）の表示タグ */
  stepTag: string;
  techniqueLabel: string;
  mixBadge: string;
  /** 合計≠100警告の継承（§2.3）。警告なしはnull */
  mixWarning: string | null;
  /** 塗料スウォッチ（paints順）。paletteColorがnullを返した要素は除外 */
  swatches: SwatchSpec[];
}

/** まとめカードの工程リスト1行分（解決済み） */
export interface SummaryStepRow {
  /** 工程番号（1-based）の表示タグ（例: "STEP 3"） */
  stepTag: string;
  techniqueLabel: string;
}

/** まとめカード（whole）: レシピ名・パーツ数/全工程数・パレット全色スウォッチの表紙1枚絵 */
export interface SummaryWholeCandidateSpec {
  kind: "summary";
  variant: "whole";
  title: string;
  /** パーツ数/全工程数の進捗文字列（resolvers.summaryProgress解決済み） */
  progressLabel: string;
  /** パレット全色スウォッチ（上限12色）。13色目以降はoverflowColorsLabelへ集約 */
  swatches: SwatchSpec[];
  /** スウォッチが12色を超えた場合の残数表示（resolvers.overflowColorsLabel解決済み）。超過なしはnull */
  overflowColorsLabel: string | null;
}

/** まとめカード（part）: レシピ名＋パーツ名・工程リスト（最大8行）・パーツ内使用色スウォッチの表紙1枚絵 */
export interface SummaryPartCandidateSpec {
  kind: "summary";
  variant: "part";
  title: string;
  partName: string;
  /** 工程リスト（1-based番号＋技法ラベル。上限8行） */
  steps: SummaryStepRow[];
  /** 工程数が8を超えた場合の残数表示（resolvers.overflowStepsLabel解決済み）。超過なしはnull */
  overflowStepsLabel: string | null;
  /** パーツ内で使用される色のスウォッチ（重複除去・上限12色） */
  swatches: SwatchSpec[];
  /** スウォッチが12色を超えた場合の残数表示。超過なしはnull */
  overflowColorsLabel: string | null;
}

export type SummaryCandidateSpec =
  SummaryWholeCandidateSpec | SummaryPartCandidateSpec;

export type ShareCandidateSpec =
  SummaryCandidateSpec | WholeCandidateSpec | PartCandidateSpec;

/** まとめカードのスウォッチ列表示上限（超過分は「+N」に集約） */
const SUMMARY_SWATCH_LIMIT = 12;
/** まとめカード（part）の工程リスト表示上限（超過分は「…他N工程」に集約） */
const SUMMARY_STEP_LIST_LIMIT = 8;

/** スウォッチ配列を上限で切り詰め、超過分のoverflowラベルを解決する（resolvers注入・重複除去は呼び出し元の責務） */
function capSwatches(
  swatches: SwatchSpec[],
  resolvers: CandidateResolvers,
): { swatches: SwatchSpec[]; overflowColorsLabel: string | null } {
  if (swatches.length <= SUMMARY_SWATCH_LIMIT) {
    return { swatches, overflowColorsLabel: null };
  }
  return {
    swatches: swatches.slice(0, SUMMARY_SWATCH_LIMIT),
    overflowColorsLabel: resolvers.overflowColorsLabel(
      swatches.length - SUMMARY_SWATCH_LIMIT,
    ),
  };
}

/** パーツ配下の全工程からpaletteColorを解決し、重複除去したスウォッチ列を返す（col_missing等nullは除外） */
function collectPartSwatches(
  part: PartLike,
  resolvers: CandidateResolvers,
): SwatchSpec[] {
  const seen = new Set<string>();
  const swatches: SwatchSpec[] = [];
  for (const step of part.steps) {
    for (const paint of step.paints) {
      if (seen.has(paint.colorId)) {
        continue;
      }
      seen.add(paint.colorId);
      const color = resolvers.paletteColor(paint.colorId);
      if (color !== null) {
        swatches.push(color);
      }
    }
  }
  return swatches;
}

/** whole用まとめカードのスペックを構築する（全体写真の有無を問わず常に1枚生成する「レシピの表紙」） */
function buildSummaryWholeCandidate(
  recipe: RecipeDocLike,
  resolvers: CandidateResolvers,
): SummaryWholeCandidateSpec {
  const totalSteps =
    recipe.baseSteps.length +
    recipe.parts.reduce((sum, part) => sum + part.steps.length, 0);

  const allSwatches = recipe.palette
    .map((color) => resolvers.paletteColor(color.id))
    .filter((color): color is SwatchSpec => color !== null);
  const { swatches, overflowColorsLabel } = capSwatches(allSwatches, resolvers);

  return {
    kind: "summary",
    variant: "whole",
    title: recipe.title,
    progressLabel: resolvers.summaryProgress(recipe.parts.length, totalSteps),
    swatches,
    overflowColorsLabel,
  };
}

/** part用まとめカードのスペックを構築する（写真つき工程が0件でも常に1枚生成する「パーツの表紙」） */
function buildSummaryPartCandidate(
  recipe: RecipeDocLike,
  part: PartLike,
  resolvers: CandidateResolvers,
): SummaryPartCandidateSpec {
  const allSteps = part.steps.map((step, index): SummaryStepRow => ({
    stepTag: resolvers.stepTag(index + 1),
    techniqueLabel: resolvers.techniqueLabel(step),
  }));
  const steps = allSteps.slice(0, SUMMARY_STEP_LIST_LIMIT);
  const overflowStepsLabel =
    allSteps.length > SUMMARY_STEP_LIST_LIMIT
      ? resolvers.overflowStepsLabel(allSteps.length - SUMMARY_STEP_LIST_LIMIT)
      : null;

  const { swatches, overflowColorsLabel } = capSwatches(
    collectPartSwatches(part, resolvers),
    resolvers,
  );

  return {
    kind: "summary",
    variant: "part",
    title: recipe.title,
    partName: part.name,
    steps,
    overflowStepsLabel,
    swatches,
    overflowColorsLabel,
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
      }),
    );
    return [summary, ...wholeCards];
  }

  const part = ctx.recipe.parts.find((p) => p.id === ctx.partId);
  if (part === undefined) {
    return [];
  }

  const overviewPhotoId = ctx.recipe.overviewPhotoIds[0] ?? null;

  const candidates: PartCandidateSpec[] = [];
  part.steps.forEach((step, index) => {
    if (step.photoId === null) {
      return;
    }
    const swatches = step.paints
      .map((paint) => resolvers.paletteColor(paint.colorId))
      .filter((color): color is SwatchSpec => color !== null);

    candidates.push({
      kind: "part",
      title: ctx.recipe.title,
      partName: part.name,
      overviewPhotoId,
      stepPhotoId: step.photoId,
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

/** カードレイアウト計算結果（1200×900・4:3固定） */
export interface CardLayout {
  cardWidth: number;
  cardHeight: number;
  /** 共通ヘッダ帯（金淡の細罫＋金のオーバーライン）。全カード共通で最上部に確保 */
  headerArea: Rect;
  /** 共通フッタ帯（細罫＋"#coat-codex"）。全カード共通で最下部に確保 */
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
  /** summary(part)専用: 工程リスト（最大8行＋overflow行）の描画領域。whole/part・summary(whole)はnull */
  summaryStepListArea: Rect | null;
  /** summary専用: パレットスウォッチ列の描画領域（whole=全色／part=パーツ内使用色）。whole/partはnull */
  summarySwatchArea: Rect | null;
}

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 900;
const MARGIN = 48;
/** 共通ヘッダ帯の高さ（金淡の細罫＋金のオーバーライン1行分） */
const HEADER_HEIGHT = 56;
/** 共通フッタ帯の高さ（細罫＋"#coat-codex"1行分） */
const FOOTER_HEIGHT = 40;
/** タイトル行の高さ（写真つきカードは情報帯内の小見出し、summaryは表紙の主見出し） */
const TITLE_AREA_HEIGHT = 64;

/**
 * カードレイアウト計算（純関数）。カードは1200×900（4:3）固定。
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
      const swatchAreaHeight = 200;
      const summarySwatchArea: Rect = {
        x: MARGIN,
        y: contentBottom - swatchAreaHeight,
        width: CARD_WIDTH - MARGIN * 2,
        height: swatchAreaHeight,
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
        summarySwatchArea,
      };
    }

    // summary(part): タイトル直下に工程リスト、下部にスウォッチ列
    const swatchAreaHeight = 120;
    const summarySwatchArea: Rect = {
      x: MARGIN,
      y: contentBottom - swatchAreaHeight,
      width: CARD_WIDTH - MARGIN * 2,
      height: swatchAreaHeight,
    };
    const summaryStepListArea: Rect = {
      x: MARGIN,
      y: bodyTop,
      width: CARD_WIDTH - MARGIN * 2,
      height: summarySwatchArea.y - bodyTop,
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
      summarySwatchArea,
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
const FOOTER_TAG_TEXT = "#coat-codex";

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

/** ファイル名生成（純関数）。1-basedの連番でPNG命名する（B系統の連番一括DL用） */
export function buildFileName(index1Based: number): string {
  return `coat-codex-share-${index1Based}.png`;
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
  drawImage(
    image: CanvasImageSource,
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

/** 写真Blobをrect内へアスペクト維持のcover配置で描画する。decode失敗時はプレースホルダ */
async function drawPhoto(
  ctx: CanvasContextLike,
  rect: Rect,
  photoId: string | null,
  deps: Required<Pick<ComposerDeps, "loadPhoto" | "decodeImage">>,
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
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
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
  ctx.strokeStyle = THEME_COLORS.goldSoft;
  ctx.beginPath();
  ctx.rect(
    layout.headerArea.x,
    layout.headerArea.y + layout.headerArea.height - 1,
    layout.headerArea.width,
    1,
  );
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

/** 共通フッタ帯（背景→写真の後、前景として描く）: 下辺の細罫＋"#coat-codex"の金の右寄せ小文字 */
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

/** スウォッチ列を描く共通ヘルパー（whole/part/summary共通の意匠）。overflowLabelがあれば末尾に金文字で添える */
function drawSwatchRow(
  ctx: CanvasContextLike,
  area: Rect,
  swatches: SwatchSpec[],
  overflowLabel: string | null,
): void {
  const swatchSize = 40;
  const gap = 12;
  swatches.forEach((swatch, index) => {
    const x = area.x + index * (swatchSize + gap);
    const y = area.y;
    ctx.fillStyle = swatch.hex ?? THEME_COLORS.line;
    ctx.fillRect(x, y, swatchSize, swatchSize);
    ctx.strokeStyle = THEME_COLORS.line;
    ctx.strokeRect(x, y, swatchSize, swatchSize);
  });

  if (overflowLabel !== null) {
    const x = area.x + swatches.length * (swatchSize + gap);
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

/** まとめカード（summary/whole）: レシピ名＋進捗＋パレット全色スウォッチの表紙意匠 */
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

  if (layout.summarySwatchArea !== null) {
    // スウォッチは複数行に折り返す（12色を1行で収めるとカード幅を超えるため）
    drawSwatchGrid(
      ctx,
      layout.summarySwatchArea,
      spec.swatches,
      spec.overflowColorsLabel,
    );
  }
}

/** まとめカード（summary/part）: レシピ名＋パーツ名・工程リスト（最大8行）・使用色スウォッチの表紙意匠 */
function drawSummaryPartCard(
  ctx: CanvasContextLike,
  spec: SummaryPartCandidateSpec,
  layout: CardLayout,
): void {
  drawTitle(ctx, layout, `${spec.title} — ${spec.partName}`);

  if (layout.summaryStepListArea !== null) {
    const area = layout.summaryStepListArea;
    const rowHeight = Math.min(
      36,
      area.height /
        Math.max(spec.steps.length + (spec.overflowStepsLabel ? 1 : 0), 1),
    );
    spec.steps.forEach((row, index) => {
      const y = area.y + rowHeight * index + rowHeight * 0.7;
      ctx.fillStyle = THEME_COLORS.accent;
      ctx.font = `600 20px ${BODY_FONT_STACK}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(row.stepTag, area.x, y);

      ctx.fillStyle = THEME_COLORS.ink;
      ctx.font = `400 19px ${BODY_FONT_STACK}`;
      ctx.fillText(row.techniqueLabel, area.x + 90, y, area.width - 90);
    });

    if (spec.overflowStepsLabel !== null) {
      const y = area.y + rowHeight * spec.steps.length + rowHeight * 0.7;
      ctx.fillStyle = THEME_COLORS.goldSoft;
      ctx.font = `400 18px ${BODY_FONT_STACK}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(spec.overflowStepsLabel, area.x, y);
    }
  }

  if (layout.summarySwatchArea !== null) {
    drawSwatchGrid(
      ctx,
      layout.summarySwatchArea,
      spec.swatches,
      spec.overflowColorsLabel,
    );
  }
}

/** スウォッチをグリッド状（1行6個まで）に描く。まとめカードは最大12色＋overflow文字を収めるため折り返す */
function drawSwatchGrid(
  ctx: CanvasContextLike,
  area: Rect,
  swatches: SwatchSpec[],
  overflowLabel: string | null,
): void {
  const swatchSize = 40;
  const gap = 12;
  const perRow = Math.max(
    1,
    Math.floor((area.width + gap) / (swatchSize + gap)),
  );

  swatches.forEach((swatch, index) => {
    const col = index % perRow;
    const row = Math.floor(index / perRow);
    const x = area.x + col * (swatchSize + gap);
    const y = area.y + row * (swatchSize + gap);
    ctx.fillStyle = swatch.hex ?? THEME_COLORS.line;
    ctx.fillRect(x, y, swatchSize, swatchSize);
    ctx.strokeStyle = THEME_COLORS.line;
    ctx.strokeRect(x, y, swatchSize, swatchSize);
  });

  if (overflowLabel !== null) {
    const index = swatches.length;
    const col = index % perRow;
    const row = Math.floor(index / perRow);
    const x = area.x + col * (swatchSize + gap);
    const y = area.y + row * (swatchSize + gap);
    ctx.fillStyle = THEME_COLORS.gold;
    ctx.font = `600 20px ${BODY_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(overflowLabel, x, y + swatchSize / 2 + 7);
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
 * 連番ファイル名は「生成に成功したカードの順に1から」振る（欠番なし）。
 * 最大4枚の選定は呼び出し側（T39）の責務なので全件生成する。
 */
export async function composeShareImages(
  specs: ShareCandidateSpec[],
  deps: ComposerDeps,
): Promise<ComposedShareImage[]> {
  await waitForFontsReady();

  const decodeImage = deps.decodeImage ?? defaultDecodeImage;
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
      await drawPhoto(ctx, layout.mainPhoto!, spec.photoId, photoDeps);
      drawWholeCard(ctx, spec, layout);
    } else {
      await drawPhoto(ctx, layout.mainPhoto!, spec.stepPhotoId, photoDeps);
      if (layout.insetPhoto !== null) {
        await drawPhoto(
          ctx,
          layout.insetPhoto,
          spec.overviewPhotoId,
          photoDeps,
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

    const file = new File([blob], buildFileName(results.length + 1), {
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
