// lib/exporters/noteMarkdown.ts — note.com向けMarkdownエクスポータ（技術計画v2.2 M5 T32）
//
// note.comのMarkdown貼り付けインポート（見出し・太字・箇条書き・区切り線に対応）に適した
// 読みやすい体裁で出力する。データ取得・混合バッジ・技法名解決はmarkdown.tsと同一の単一情報源
// （lib/mixRatio.ts formatMixBadge・lib/techniques.ts resolveTechniqueLabel）を使う。
// 素のMarkdown（markdown.ts）との違い: 絵文字装飾・区切り線(---)・末尾ハッシュタグを付与し、
// note.com記事としての読みやすさを優先する（箇条書きの入れ子は避け、フラットな段落主体の構成）。

import { formatMixBadge } from "../mixRatio";
import { resolveTechniqueLabel, TECHNIQUE_PRESET_KEYS } from "../techniques";
import type { RecipeDoc, Step } from "../../models/recipe";

/** i18n未接続時（テスト等）の技法名フォールバック辞書。markdown.tsと同一内容（重複防止のためexportはしない） */
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

function defaultTechniqueT(key: string): string {
  const presetKey = key.replace(/^techniques\./, "");
  if (presetKey in FALLBACK_TECHNIQUE_LABELS) {
    return FALLBACK_TECHNIQUE_LABELS[
      presetKey as keyof typeof FALLBACK_TECHNIQUE_LABELS
    ];
  }
  return key;
}

/** note.com向けMarkdown出力の固定文言ラベルテーブル。i18n解決済み文字列を呼び出し側から注入する。
 *  省略時はja既定文言にフォールバックする（テスト・CLI等i18n非経由の呼び出しを許容するため）。 */
export interface NoteMarkdownLabels {
  /** 見出し「使用カラー」 */
  paletteHeading: string;
  /** 見出し「使用ツール」 */
  toolsHeading: string;
  /** 見出し「ベース工程（全体）」 */
  baseStepsHeading: string;
  /** 見出し「パーツ」 */
  partsHeading: string;
  /** 工程ラベル「STEP {{n}}」 */
  stepLabel: (n: number) => string;
  /** 「塗料」ラベル */
  paintsLabel: string;
  /** 「ツール」ラベル */
  toolsLabel: string;
  /** 「メモ」ラベル */
  memoLabel: string;
  /** 「写真あり」ラベル */
  hasPhotoLabel: string;
  /** 合計≠100警告バッジ文言テンプレート */
  mixTotalWarning: (total: number) => string;
  /** 何も内容がない工程のプレースホルダ */
  emptyStepLabel: string;
  /** 技法名解決用のt関数 */
  techniqueT: (key: string) => string;
  /** 末尾ハッシュタグ（v2.3 §3.4のSNS共有と表記を揃える固定タグ）。空文字なら省略 */
  hashtag: string;
}

/** i18n未接続時（テスト等）の既定ラベル */
export const DEFAULT_NOTE_MARKDOWN_LABELS: NoteMarkdownLabels = {
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
  hashtag: "#coat-codex",
};

/** i18nの t 関数から NoteMarkdownLabels を構築するヘルパー。
 *  必要なi18nキー一覧は本タスクの報告を参照（このタスクではja.json/en.jsonの編集を行わない）。 */
export function buildNoteMarkdownLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
): NoteMarkdownLabels {
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
    hashtag: "#coat-codex",
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

/** 1工程分のnote.com向けMarkdown行群を生成（絵文字装飾つき小見出し#### ） */
function renderStep(
  step: Step,
  index: number,
  recipe: RecipeDoc,
  labels: NoteMarkdownLabels,
): string[] {
  const lines: string[] = [];
  const techniqueLabel = resolveTechniqueLabel(
    step.technique,
    labels.techniqueT,
  );
  const heading = techniqueLabel
    ? `${labels.stepLabel(index + 1)}: ${techniqueLabel}`
    : labels.stepLabel(index + 1);
  lines.push(`#### 🎨 ${heading}`);

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
    lines.push(`- **${labels.paintsLabel}**: ${paintsText}`);
  }

  const toolNames = resolveToolNames(step, recipe);
  if (toolNames.length > 0) {
    lines.push(`- **${labels.toolsLabel}**: ${toolNames.join(", ")}`);
  }

  if (step.memo.trim() !== "") {
    lines.push(`- **${labels.memoLabel}**: ${step.memo}`);
  }

  if (step.photoId !== null) {
    lines.push(`- 📷 ${labels.hasPhotoLabel}`);
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
  labels: NoteMarkdownLabels,
): string[] {
  const lines: string[] = [];
  steps.forEach((step, index) => {
    if (index > 0) lines.push("");
    lines.push(...renderStep(step, index, recipe, labels));
  });
  return lines;
}

/**
 * RecipeDocからnote.com向けMarkdown文書を生成する。
 * 構成: タイトル(h1) → 区切り線 → 使用カラー → 使用ツール → 区切り線 → ベース工程
 *       → パーツ毎の工程 → 区切り線 → ハッシュタグ
 */
export function exportRecipeToNoteMarkdown(
  recipe: RecipeDoc,
  labels: NoteMarkdownLabels = DEFAULT_NOTE_MARKDOWN_LABELS,
): string {
  const lines: string[] = [];

  lines.push(`# ${recipe.title}`);

  if (recipe.palette.length > 0 || recipe.tools.length > 0) {
    lines.push("");
    lines.push("---");
  }

  if (recipe.palette.length > 0) {
    lines.push("");
    lines.push(`## 🖌️ ${labels.paletteHeading}`);
    for (const color of recipe.palette) {
      const name = color.brand ? `${color.brand} ${color.name}` : color.name;
      lines.push(`- ${name}`);
    }
  }

  if (recipe.tools.length > 0) {
    lines.push("");
    lines.push(`## 🧰 ${labels.toolsHeading}`);
    for (const tool of recipe.tools) {
      lines.push(
        tool.note ? `- ${tool.name}（${tool.note}）` : `- ${tool.name}`,
      );
    }
  }

  if (recipe.baseSteps.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`## ${labels.baseStepsHeading}`);
    lines.push("");
    lines.push(...renderSteps(recipe.baseSteps, recipe, labels));
  }

  if (recipe.parts.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`## ${labels.partsHeading}`);
    recipe.parts.forEach((part) => {
      lines.push("");
      lines.push(`### ${part.name}`);
      if (part.steps.length > 0) {
        lines.push("");
        lines.push(...renderSteps(part.steps, recipe, labels));
      }
    });
  }

  if (labels.hashtag !== "") {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(labels.hashtag);
  }

  return lines.join("\n") + "\n";
}
