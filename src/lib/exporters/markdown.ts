// lib/exporters/markdown.ts — 素のMarkdownエクスポータ（技術計画v2.2 M5 T32）
//
// RecipeDoc（models/recipe.ts §2.1）から人間可読なMarkdown文書を生成する純関数。
// 混合バッジは lib/mixRatio.ts の formatMixBadge をそのまま使用する（単一情報源。§2.3「バッジ表記の正」）。
// 技法名の解決は lib/techniques.ts の resolveTechniqueLabel に委譲する。
// i18n（ja.json/en.json）は本タスクでは編集しないため、固定文言はラベルテーブル（MarkdownLabels）
// として呼び出し側から注入する。i18n未実装時のフォールバック文言をデフォルト値として持つ。

import { formatMixBadge } from "../mixRatio";
import { resolveTechniqueLabel, TECHNIQUE_PRESET_KEYS } from "../techniques";
import type { RecipeDoc, Step } from "../../models/recipe";

/** i18n未接続時（テスト等）の技法名フォールバック辞書。ja.json techniques.* と表記を揃える。
 *  本タスクではja.json/en.jsonの編集は行わないため、実運用ではUI層が本物のt関数を注入する
 *  （buildMarkdownLabelsのtechniqueT引数）。 */
const FALLBACK_TECHNIQUE_LABELS: Record<
  (typeof TECHNIQUE_PRESET_KEYS)[number],
  string
> = {
  prime: "プライマー",
  basecoat: "ベースコート",
  layer: "レイヤー",
  wash: "ウォッシュ",
  drybrush: "ドライブラシ",
  "edge-highlight": "エッジハイライト",
  glaze: "グレーズ",
  stipple: "スティップリング",
  masking: "マスキング",
  varnish: "バーニッシュ（ニス）",
};

/** techniques.<presetKey> 解決用の既定t関数（i18n非経由の呼び出し=テスト等で使用） */
function defaultTechniqueT(key: string): string {
  const presetKey = key.replace(/^techniques\./, "");
  if (presetKey in FALLBACK_TECHNIQUE_LABELS) {
    return FALLBACK_TECHNIQUE_LABELS[
      presetKey as keyof typeof FALLBACK_TECHNIQUE_LABELS
    ];
  }
  return key;
}

/** Markdown出力の固定文言ラベルテーブル。i18n解決済み文字列を呼び出し側（UI層）から注入する。
 *  省略時はja既定文言にフォールバックする（テスト・CLI等i18n非経由の呼び出しを許容するため）。 */
export interface MarkdownLabels {
  /** 見出し「使用カラー」 */
  paletteHeading: string;
  /** 見出し「使用ツール」 */
  toolsHeading: string;
  /** 見出し「ベース工程（全体）」 */
  baseStepsHeading: string;
  /** 見出し「パーツ」 */
  partsHeading: string;
  /** 工程ラベル「STEP {{n}}」（nを埋め込んだ完成形を呼び出し側で生成するテンプレート関数） */
  stepLabel: (n: number) => string;
  /** 「塗料」ラベル（工程内の塗料一覧見出し） */
  paintsLabel: string;
  /** 「ツール」ラベル（工程内の使用ツール） */
  toolsLabel: string;
  /** 「メモ」ラベル */
  memoLabel: string;
  /** 「写真あり」ラベル（工程写真の有無を示す注記） */
  hasPhotoLabel: string;
  /** 合計≠100警告バッジ文言テンプレート（例: "⚠ 計 {{value}}%"） */
  mixTotalWarning: (total: number) => string;
  /** 塗料0件・技法未設定など、何も内容がない工程のプレースホルダ */
  emptyStepLabel: string;
  /** 技法名解決用のt関数（techniques.<presetKey>キーを解決。lib/techniques.ts resolveTechniqueLabel互換）。
   *  省略時はja既定文言にフォールバックする */
  techniqueT: (key: string) => string;
}

/** i18n未接続時（テスト等）の既定ラベル。ja.jsonの既存文言（mix.badgeWarning等）と表記を揃える */
export const DEFAULT_MARKDOWN_LABELS: MarkdownLabels = {
  paletteHeading: "使用カラー",
  toolsHeading: "使用ツール",
  baseStepsHeading: "ベース工程（全体）",
  partsHeading: "パーツ",
  stepLabel: (n) => `STEP ${n}`,
  paintsLabel: "塗料",
  toolsLabel: "ツール",
  memoLabel: "メモ",
  hasPhotoLabel: "写真あり",
  mixTotalWarning: (total) => `⚠ 計 ${total}%`,
  emptyStepLabel: "（未設定）",
  techniqueT: defaultTechniqueT,
};

/** i18nの t 関数（react-i18next互換シグネチャ）から MarkdownLabels を構築するヘルパー。
 *  UI層（ExportActionBar等）はこれを使ってラベルテーブルを注入できる。
 *  必要なi18nキー一覧は本タスクの報告を参照（このタスクではja.json/en.jsonの編集を行わない）。 */
export function buildMarkdownLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
): MarkdownLabels {
  return {
    paletteHeading: t("setup.paletteLabel"),
    toolsHeading: t("setup.toolsLabel"),
    baseStepsHeading: t("overview.baseOverline"),
    partsHeading: t("overview.partsHeadingJp"),
    stepLabel: (n) => t("editor.stepLabel", { n }),
    paintsLabel: t("export.markdownPaintsLabel"),
    toolsLabel: t("export.markdownToolsLabel"),
    memoLabel: t("editor.memoLabel"),
    hasPhotoLabel: t("export.markdownHasPhotoLabel"),
    mixTotalWarning: (total) => t("mix.badgeWarning", { value: total }),
    emptyStepLabel: t("export.markdownEmptyStepLabel"),
    techniqueT: t,
  };
}

function resolvePaintNames(step: Step, recipe: RecipeDoc): string[] {
  const paletteById = new Map(recipe.palette.map((c) => [c.id, c]));
  return step.paints.map((p) => {
    const color = paletteById.get(p.colorId);
    if (!color) return p.colorId;
    return color.brand ? `${color.brand} ${color.name}` : color.name;
  });
}

function resolveToolNames(step: Step, recipe: RecipeDoc): string[] {
  const toolById = new Map(recipe.tools.map((t) => [t.id, t]));
  return step.toolIds.map((id) => toolById.get(id)?.name ?? id);
}

/** 1工程分のMarkdown行群を生成（見出しレベルは呼び出し側の文脈に合わせ固定=###） */
function renderStep(
  step: Step,
  index: number,
  recipe: RecipeDoc,
  labels: MarkdownLabels,
): string[] {
  const lines: string[] = [];
  const techniqueLabel = resolveTechniqueLabel(
    step.technique,
    labels.techniqueT,
  );
  const heading = techniqueLabel
    ? `${labels.stepLabel(index + 1)}: ${techniqueLabel}`
    : labels.stepLabel(index + 1);
  lines.push(`### ${heading}`);

  const paintNames = resolvePaintNames(step, recipe);
  const badge = formatMixBadge(step.paints, step.mix);
  const total = step.mix?.reduce((sum, v) => sum + v, 0) ?? 0;
  const totalWarning =
    step.paints.length >= 2 && step.mix !== null && total !== 100
      ? ` ${labels.mixTotalWarning(total)}`
      : "";

  if (paintNames.length > 0) {
    const paintsText = badge
      ? `${paintNames.join(" + ")} — ${badge}${totalWarning}`
      : paintNames.join(" + ");
    lines.push(`- ${labels.paintsLabel}: ${paintsText}`);
  }

  const toolNames = resolveToolNames(step, recipe);
  if (toolNames.length > 0) {
    lines.push(`- ${labels.toolsLabel}: ${toolNames.join(", ")}`);
  }

  if (step.memo.trim() !== "") {
    lines.push(`- ${labels.memoLabel}: ${step.memo}`);
  }

  if (step.photoId !== null) {
    lines.push(`- ${labels.hasPhotoLabel}`);
  }

  if (
    paintNames.length === 0 &&
    toolNames.length === 0 &&
    step.memo.trim() === "" &&
    step.photoId === null &&
    !techniqueLabel
  ) {
    lines.push(`- ${labels.emptyStepLabel}`);
  }

  return lines;
}

function renderSteps(
  steps: Step[],
  recipe: RecipeDoc,
  labels: MarkdownLabels,
): string[] {
  const lines: string[] = [];
  steps.forEach((step, index) => {
    if (index > 0) lines.push("");
    lines.push(...renderStep(step, index, recipe, labels));
  });
  return lines;
}

/**
 * RecipeDocから素のMarkdown文書を生成する。
 * 構成: タイトル(h1) → 使用カラー → 使用ツール → ベース工程 → パーツ毎の工程
 */
export function exportRecipeToMarkdown(
  recipe: RecipeDoc,
  labels: MarkdownLabels = DEFAULT_MARKDOWN_LABELS,
): string {
  const lines: string[] = [];

  lines.push(`# ${recipe.title}`);

  if (recipe.palette.length > 0) {
    lines.push("");
    lines.push(`## ${labels.paletteHeading}`);
    for (const color of recipe.palette) {
      const name = color.brand ? `${color.brand} ${color.name}` : color.name;
      lines.push(`- ${name}`);
    }
  }

  if (recipe.tools.length > 0) {
    lines.push("");
    lines.push(`## ${labels.toolsHeading}`);
    for (const tool of recipe.tools) {
      lines.push(
        tool.note ? `- ${tool.name}（${tool.note}）` : `- ${tool.name}`,
      );
    }
  }

  if (recipe.baseSteps.length > 0) {
    lines.push("");
    lines.push(`## ${labels.baseStepsHeading}`);
    lines.push("");
    lines.push(...renderSteps(recipe.baseSteps, recipe, labels));
  }

  if (recipe.parts.length > 0) {
    lines.push("");
    lines.push(`## ${labels.partsHeading}`);
    recipe.parts.forEach((part) => {
      lines.push("");
      lines.push(`### ${part.name}`);
      if (part.steps.length > 0) {
        lines.push("");
        lines.push(...renderSteps(part.steps, recipe, labels).map(bumpHeading));
      }
    });
  }

  return lines.join("\n") + "\n";
}

/** パーツ配下の工程見出しはパーツ見出し(###)の下に来るため1段下げる（###→####） */
function bumpHeading(line: string): string {
  return line.startsWith("### ") ? `#${line}` : line;
}
