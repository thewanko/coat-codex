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
}

export interface PartLike {
  id: string;
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

export type ShareCandidateSpec = WholeCandidateSpec | PartCandidateSpec;

/**
 * 候補列挙（純関数）。
 * whole: recipe.overviewPhotoIdsの写真順に「全体写真＋タイトル」カードのスペック。
 * part:  対象パーツの steps[].photoId 非null の工程順に「全体画像＋工程写真＋工程情報」のスペック。
 * 候補0件（全体写真なし／写真つき工程なし）・存在しないpartIdは空配列。
 */
export function listShareCandidates(
  ctx: ShareContext,
  resolvers: CandidateResolvers,
): ShareCandidateSpec[] {
  if (ctx.mode === "whole") {
    return ctx.recipe.overviewPhotoIds.map((photoId): WholeCandidateSpec => ({
      kind: "whole",
      photoId,
      title: ctx.recipe.title,
    }));
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
      overviewPhotoId,
      stepPhotoId: step.photoId,
      stepTag: resolvers.stepTag(index + 1),
      techniqueLabel: resolvers.techniqueLabel(step),
      mixBadge: resolvers.mixBadge(step),
      mixWarning: resolvers.mixWarning(step),
      swatches,
    });
  });

  return candidates;
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
  /** whole: 全体写真の描画領域 / part: 工程写真の描画領域（メイン写真） */
  mainPhoto: Rect;
  /** part専用: 全体画像（代表写真）のインセット領域。whole・overviewPhotoId=nullのpartはnull */
  insetPhoto: Rect | null;
  /** タイトル・工程情報テキストの描画領域 */
  textArea: Rect;
  /** part専用: スウォッチ列の描画領域。whole・swatches=0件はnull */
  swatchArea: Rect | null;
}

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 900;
const MARGIN = 48;

/**
 * カードレイアウト計算（純関数）。カードは1200×900（4:3）固定。
 * whole: 上部に全体写真、下部にタイトル帯。
 * part: 主写真（工程写真）をフルブリード寄りに配置し、左下に全体画像インセット、
 *       下部帯に工程情報テキスト、テキスト帯の下にスウォッチ列。
 */
export function computeCardLayout(spec: ShareCandidateSpec): CardLayout {
  if (spec.kind === "whole") {
    const textAreaHeight = 180;
    const photoHeight = CARD_HEIGHT - textAreaHeight;
    return {
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      mainPhoto: { x: 0, y: 0, width: CARD_WIDTH, height: photoHeight },
      insetPhoto: null,
      textArea: {
        x: MARGIN,
        y: photoHeight,
        width: CARD_WIDTH - MARGIN * 2,
        height: textAreaHeight - MARGIN,
      },
      swatchArea: null,
    };
  }

  // part: 下部に情報帯（工程情報テキスト＋スウォッチ列）、上部を主写真領域とする。
  const infoAreaHeight = 260;
  const swatchAreaHeight = spec.swatches.length > 0 ? 64 : 0;
  const textAreaHeight = infoAreaHeight - swatchAreaHeight;
  const photoAreaHeight = CARD_HEIGHT - infoAreaHeight;

  const insetSize = spec.overviewPhotoId !== null ? 220 : 0;
  const insetPhoto: Rect | null =
    spec.overviewPhotoId !== null
      ? {
          x: MARGIN,
          y: photoAreaHeight - insetSize - MARGIN,
          width: insetSize,
          height: insetSize,
        }
      : null;

  const textAreaY = photoAreaHeight + MARGIN / 2;

  return {
    cardWidth: CARD_WIDTH,
    cardHeight: CARD_HEIGHT,
    mainPhoto: { x: 0, y: 0, width: CARD_WIDTH, height: photoAreaHeight },
    insetPhoto,
    textArea: {
      x: MARGIN,
      y: textAreaY,
      width: CARD_WIDTH - MARGIN * 2,
      height: textAreaHeight - MARGIN / 2,
    },
    swatchArea:
      spec.swatches.length > 0
        ? {
            x: MARGIN,
            y: textAreaY + (textAreaHeight - MARGIN / 2),
            width: CARD_WIDTH - MARGIN * 2,
            height: swatchAreaHeight,
          }
        : null,
  };
}

/** テーマトークン値（docs/design/theme.css 由来。canvasはCSS変数を直接読めないため定数化） */
export const THEME_COLORS = {
  paper: "#F6F0E2",
  ink: "#2B241C",
  gold: "#8F6B2E",
  goldSoft: "#C9A85C",
  line: "#A69576",
} as const;

/** タイトル用フォントスタック */
export const TITLE_FONT_STACK =
  "'Shippori Mincho', 'Hiragino Mincho ProN', serif";
/** 本文用フォントスタック */
export const BODY_FONT_STACK =
  "'Inter', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif";

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

function drawWholeCard(
  ctx: CanvasContextLike,
  spec: WholeCandidateSpec,
  layout: CardLayout,
): void {
  ctx.fillStyle = THEME_COLORS.ink;
  ctx.font = `600 40px ${TITLE_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    spec.title,
    layout.textArea.x,
    layout.textArea.y + 60,
    layout.textArea.width,
  );
}

function drawPartCard(
  ctx: CanvasContextLike,
  spec: PartCandidateSpec,
  layout: CardLayout,
): void {
  ctx.fillStyle = THEME_COLORS.gold;
  ctx.font = `600 28px ${BODY_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(spec.stepTag, layout.textArea.x, layout.textArea.y + 32);

  ctx.fillStyle = THEME_COLORS.ink;
  ctx.font = `500 26px ${BODY_FONT_STACK}`;
  ctx.fillText(
    spec.techniqueLabel,
    layout.textArea.x,
    layout.textArea.y + 68,
    layout.textArea.width,
  );

  if (spec.mixBadge !== "") {
    ctx.fillStyle = THEME_COLORS.goldSoft;
    ctx.font = `400 22px ${BODY_FONT_STACK}`;
    ctx.fillText(
      spec.mixBadge,
      layout.textArea.x,
      layout.textArea.y + 100,
      layout.textArea.width,
    );
  }

  if (spec.mixWarning !== null) {
    ctx.fillStyle = THEME_COLORS.ink;
    ctx.font = `400 20px ${BODY_FONT_STACK}`;
    ctx.fillText(
      spec.mixWarning,
      layout.textArea.x,
      layout.textArea.y + 132,
      layout.textArea.width,
    );
  }

  if (layout.swatchArea !== null) {
    const swatchSize = 40;
    const gap = 12;
    spec.swatches.forEach((swatch, index) => {
      const x = layout.swatchArea!.x + index * (swatchSize + gap);
      const y = layout.swatchArea!.y;
      ctx.fillStyle = swatch.hex ?? THEME_COLORS.line;
      ctx.fillRect(x, y, swatchSize, swatchSize);
      ctx.strokeStyle = THEME_COLORS.line;
      ctx.strokeRect(x, y, swatchSize, swatchSize);
    });
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

    if (spec.kind === "whole") {
      await drawPhoto(ctx, layout.mainPhoto, spec.photoId, photoDeps);
      drawWholeCard(ctx, spec, layout);
    } else {
      await drawPhoto(ctx, layout.mainPhoto, spec.stepPhotoId, photoDeps);
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
