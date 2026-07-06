// lib/exporters/markdown.ts — 素のMarkdownエクスポータ（技術計画v2.2 M5 T32・2026-07-04 FB-F改訂）
//
// RecipeDocから人間可読なMarkdown文書を、印刷ビュー（components/print/PrintRecipeSheet.tsx）と
// 同一の情報構造で生成する純関数。構造の正はPrintRecipeSheet.tsx（本ファイルは変更禁止・参照のみ）。
// 混合バッジは @coat-codex/recipe-core の formatMixBadge をそのまま使用する
// （単一情報源。§2.3「バッジ表記の正」）。
// 技法名の解決は @coat-codex/recipe-core の resolveTechniqueLabel に委譲する。
// i18n（ja.json/en.json）は固定文言をラベルテーブル（MarkdownLabels）として呼び出し側から注入する。
// i18n未実装時のフォールバック文言をデフォルト値として持つ。
//
// noteMarkdown.ts（note.com向け）とは別実装・別仕様のため変更禁止（本タスクのスコープ外）。

import { sanitizeMarkdownText } from "./markdownSanitize";
import {
  formatMixBadge,
  resolveTechniqueLabel,
  TECHNIQUE_PRESET_KEYS,
  type RecipeDoc,
  type Step,
} from "@coat-codex/recipe-core";

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

const ROMAN_NUMERALS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
] as const;

/** 1始まりのパーツ順序をローマ数字表記へ（15超は算用数字にフォールバック）。
 *  PrintRecipeSheet.tsx の toRoman と同一規則（印刷ビューと同一のパーツ見出し表記にするための
 *  小さな純関数。PrintRecipeSheet.tsx はRead専用＝変更禁止のためexportで共有せずここに複製する）。 */
function toRoman(order: number): string {
  return ROMAN_NUMERALS[order - 1] ?? String(order);
}

/** Markdown出力の固定文言ラベルテーブル。i18n解決済み文字列を呼び出し側（UI層）から注入する。
 *  省略時はja既定文言にフォールバックする（テスト・CLI等i18n非経由の呼び出しを許容するため）。 */
export interface MarkdownLabels {
  /** 概要行テンプレート「全N工程・Nパーツ ・ 更新日」。区切りを一系統に統一するため
   *  工程・パーツ・日付の3値をまとめて1つの文言として持つ（レビューM2対応。
   *  以前はtotalMeta（印刷ヘッダのtotalMeta相当）に日付を別途連結していたため
   *  DEFAULTとi18n注入版で区切りの出方が異なっていた） */
  summaryLine: (steps: number, parts: number, date: string) => string;
  /** 見出し「PALETTE — 使用カラー」の英語overline部分 */
  paletteHeading: string;
  /** 見出し「PALETTE — 使用カラー」の日本語gloss部分 */
  paletteHeadingJp: string;
  /** 見出し「TOOLS — 使用ツール」の英語overline部分 */
  toolsHeading: string;
  /** 見出し「TOOLS — 使用ツール」の日本語gloss部分 */
  toolsHeadingJp: string;
  /** 見出し「BASE — ベース工程（全体）」の英語overline部分 */
  baseHeading: string;
  /** 見出し「BASE — ベース工程（全体）」の日本語gloss部分 */
  baseHeadingJp: string;
  /** パーツ見出しテンプレート「PART {{roman}}」 */
  partHeading: (roman: string) => string;
  /** パーツ見出しの工程数メタ「{{count}} steps」 */
  stepsMeta: (count: number) => string;
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
  /** 技法名解決用のt関数（techniques.<presetKey>キーを解決。@coat-codex/recipe-core resolveTechniqueLabel互換）。
   *  省略時はja既定文言にフォールバックする */
  techniqueT: (key: string) => string;
}

/** i18n未接続時（テスト等）の既定ラベル。ja.jsonの既存文言（mix.badgeWarning等）と表記を揃える */
export const DEFAULT_MARKDOWN_LABELS: MarkdownLabels = {
  summaryLine: (steps, parts, date) =>
    `全${steps}工程・${parts}パーツ ・ ${date}`,
  paletteHeading: "PALETTE",
  paletteHeadingJp: "使用カラー",
  toolsHeading: "TOOLS",
  toolsHeadingJp: "使用ツール",
  baseHeading: "BASE",
  baseHeadingJp: "ベース工程（全体）",
  partHeading: (roman) => `PART ${roman}`,
  stepsMeta: (count) => `${count}工程`,
  paintsLabel: "塗料",
  toolsLabel: "ツール",
  memoLabel: "メモ",
  hasPhotoLabel: "写真あり",
  mixTotalWarning: (total) => `⚠ 計 ${total}%`,
  emptyStepLabel: "（未設定）",
  techniqueT: defaultTechniqueT,
};

/** i18nの t 関数（react-i18next互換シグネチャ）から MarkdownLabels を構築するヘルパー。
 *  UI層（ExportActionBar等）はこれを使ってラベルテーブルを注入できる。 */
export function buildMarkdownLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
): MarkdownLabels {
  return {
    summaryLine: (steps, parts, date) =>
      t("export.markdownSummaryLine", { steps, parts, date }),
    paletteHeading: t("print.paletteHeading"),
    paletteHeadingJp: t("print.paletteHeadingJp"),
    toolsHeading: t("print.toolsHeading"),
    toolsHeadingJp: t("print.toolsHeadingJp"),
    baseHeading: t("print.baseHeading"),
    baseHeadingJp: t("print.baseHeadingJp"),
    partHeading: (roman) => t("print.partHeading", { roman }),
    stepsMeta: (count) => t("print.stepsMeta", { count }),
    paintsLabel: t("export.markdownPaintsLabel"),
    toolsLabel: t("export.markdownToolsLabel"),
    memoLabel: t("editor.memoLabel"),
    hasPhotoLabel: t("export.markdownHasPhotoLabel"),
    mixTotalWarning: (total) => t("mix.badgeWarning", { value: total }),
    emptyStepLabel: t("export.markdownEmptyStepLabel"),
    techniqueT: t,
  };
}

function resolvePaintFragments(step: Step, recipe: RecipeDoc): string[] {
  const paletteById = new Map(recipe.palette.map((c) => [c.id, c]));
  return step.paints.map((p) => {
    const color = paletteById.get(p.colorId);
    if (!color) return p.colorId;
    const name = color.brand ? `${color.brand} ${color.name}` : color.name;
    const hex = color.hex ?? "";
    const label = hex ? `${name} (${hex})` : name;
    return sanitizeMarkdownText(label);
  });
}

function resolveToolNames(step: Step, recipe: RecipeDoc): string[] {
  const toolById = new Map(recipe.tools.map((t) => [t.id, t]));
  return step.toolIds.map((id) =>
    sanitizeMarkdownText(toolById.get(id)?.name ?? id),
  );
}

/** 1工程分のMarkdown行群を生成（番号付きリストの1項目。印刷の工程行と同一情報構造）。
 *  numberは1始まりの表示用工程番号。継続行は3スペースインデントの箇条書きにする。 */
function renderStep(
  step: Step,
  number: number,
  recipe: RecipeDoc,
  labels: MarkdownLabels,
): string[] {
  const lines: string[] = [];
  const techniqueLabel = sanitizeMarkdownText(
    resolveTechniqueLabel(step.technique, labels.techniqueT),
  );

  const paintFragments = resolvePaintFragments(step, recipe);
  const badge = formatMixBadge(step.paints, step.mix);
  const total = step.mix?.reduce((sum, v) => sum + v, 0) ?? 0;
  const totalWarning =
    step.paints.length >= 2 && step.mix !== null && total !== 100
      ? ` ${labels.mixTotalWarning(total)}`
      : "";

  const heading = techniqueLabel || labels.emptyStepLabel;
  lines.push(`${number}. ${heading}`);

  if (paintFragments.length > 0) {
    const paintsText = badge
      ? `${paintFragments.join(" + ")} — ${badge}${totalWarning}`
      : paintFragments.join(" + ");
    lines.push(`   - ${labels.paintsLabel}: ${paintsText}`);
  }

  const toolNames = resolveToolNames(step, recipe);
  if (toolNames.length > 0) {
    lines.push(`   - ${labels.toolsLabel}: ${toolNames.join(", ")}`);
  }

  if (step.memo.trim() !== "") {
    lines.push(`   - ${labels.memoLabel}: ${sanitizeMarkdownText(step.memo)}`);
  }

  if (step.photoId !== null) {
    lines.push(`   - ${labels.hasPhotoLabel}`);
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
    lines.push(...renderStep(step, index + 1, recipe, labels));
  });
  return lines;
}

/**
 * RecipeDocから素のMarkdown文書を生成する（印刷ビューと同一の情報構造）。
 * 構成: タイトル(h1)＋概要行 → PALETTE（使用カラー） → TOOLS（使用ツール）
 *       → BASE（ベース工程、番号付きリスト） → PART I〜（パーツ毎、番号付きリスト）
 */
export function exportRecipeToMarkdown(
  recipe: RecipeDoc,
  labels: MarkdownLabels = DEFAULT_MARKDOWN_LABELS,
): string {
  const lines: string[] = [];
  const totalStepCount =
    recipe.baseSteps.length +
    recipe.parts.reduce((sum, part) => sum + part.steps.length, 0);
  const dateLabel = recipe.updatedAt.slice(0, 10);

  lines.push(`# ${sanitizeMarkdownText(recipe.title)}`);
  lines.push("");
  lines.push(
    labels.summaryLine(totalStepCount, recipe.parts.length, dateLabel),
  );

  if (recipe.palette.length > 0) {
    lines.push("");
    lines.push(`## ${labels.paletteHeading} — ${labels.paletteHeadingJp}`);
    for (const color of recipe.palette) {
      const brandText = color.brand ? sanitizeMarkdownText(color.brand) : "";
      const nameText = sanitizeMarkdownText(color.name);
      const hexSuffix = color.hex ? ` ・ ${color.hex}` : "";
      const label = brandText ? `${nameText}（${brandText}）` : nameText;
      lines.push(`- ${label}${hexSuffix}`);
    }
  }

  if (recipe.tools.length > 0) {
    lines.push("");
    lines.push(`## ${labels.toolsHeading} — ${labels.toolsHeadingJp}`);
    for (const tool of recipe.tools) {
      const nameText = sanitizeMarkdownText(tool.name);
      const noteText = tool.note ? sanitizeMarkdownText(tool.note) : "";
      const line = noteText ? `${nameText}（${noteText}）` : nameText;
      lines.push(`- ${line}`);
    }
  }

  if (recipe.baseSteps.length > 0) {
    lines.push("");
    lines.push(`## ${labels.baseHeading} — ${labels.baseHeadingJp}`);
    lines.push("");
    lines.push(...renderSteps(recipe.baseSteps, recipe, labels));
  }

  recipe.parts.forEach((part, partIndex) => {
    lines.push("");
    const roman = toRoman(partIndex + 1);
    lines.push(
      `## ${labels.partHeading(roman)} — ${sanitizeMarkdownText(part.name)}（${labels.stepsMeta(part.steps.length)}）`,
    );
    if (part.steps.length > 0) {
      lines.push("");
      lines.push(...renderSteps(part.steps, recipe, labels));
    }
  });

  return lines.join("\n") + "\n";
}
