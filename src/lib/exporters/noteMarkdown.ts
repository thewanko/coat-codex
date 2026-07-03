// lib/exporters/noteMarkdown.ts — note.com向けMarkdownエクスポータ（技術計画v2.2 M5 T32）
//
// note.com公式ヘルプ「Markdownショートカット」が実際に変換対応する記法のみを使用する:
// `## `大見出し／`### `小見出し／`- `箇条書き／`1. `番号付きリスト／`> `引用／```コードブロック／
// `---`区切り線。h1(`# `)・h4以降・太字(`**`)・リンク・画像・表は変換されない（生テキスト残留）ため
// 使用しない（2026-07-03ユーザー実機報告を受け再設計）。
// データ取得・混合バッジ・技法名解決はmarkdown.tsと同一の単一情報源
// （lib/mixRatio.ts formatMixBadge・lib/techniques.ts resolveTechniqueLabel）を使う。
// 素のMarkdown（markdown.ts）との違い: 絵文字装飾・区切り線(---)・末尾ハッシュタグを付与し、
// 1工程1行の番号付きリストへ圧縮することでnote.com記事としての読みやすさを優先する。

import { formatMixBadge } from "../mixRatio";
import { resolveTechniqueLabel, TECHNIQUE_PRESET_KEYS } from "../techniques";
import { sanitizeMarkdownText } from "./markdownSanitize";
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
    const name = color.brand ? `${color.brand} ${color.name}` : color.name;
    return sanitizeMarkdownText(name);
  });
}

function resolveToolNames(step: Step, recipe: RecipeDoc): string[] {
  const toolById = new Map(recipe.tools.map((t) => [t.id, t]));
  return step.toolIds.map((id) =>
    sanitizeMarkdownText(toolById.get(id)?.name ?? id),
  );
}

/** 1工程分をnote.com対応記法の番号付きリスト1行へ圧縮する。
 *  区切りは「 — 」（技法名と最初の要素の間）／「 ／ 」（要素間）。存在しない要素は区切りごと省略する。 */
function renderStepLine(
  step: Step,
  index: number,
  recipe: RecipeDoc,
  labels: NoteMarkdownLabels,
): string {
  const techniqueLabel = sanitizeMarkdownText(
    resolveTechniqueLabel(step.technique, labels.techniqueT),
  );
  const heading = techniqueLabel
    ? `🎨 ${techniqueLabel}`
    : labels.stepLabel(index + 1);

  const paintNames = resolvePaintNames(step, recipe);
  const badge = formatMixBadge(step.paints, step.mix);
  const total = step.mix?.reduce((sum, v) => sum + v, 0) ?? 0;
  const totalWarning =
    step.paints.length >= 2 && step.mix !== null && total !== 100
      ? ` ${labels.mixTotalWarning(total)}`
      : "";

  const segments: string[] = [];

  if (paintNames.length > 0) {
    const paintsText = badge
      ? `${paintNames.join(" + ")} — ${badge}${totalWarning}`
      : paintNames.join(" + ");
    segments.push(`${labels.paintsLabel}: ${paintsText}`);
  }

  const toolNames = resolveToolNames(step, recipe);
  if (toolNames.length > 0) {
    segments.push(`${labels.toolsLabel}: ${toolNames.join(", ")}`);
  }

  if (step.memo.trim() !== "") {
    segments.push(`${labels.memoLabel}: ${sanitizeMarkdownText(step.memo)}`);
  }

  if (step.photoId !== null) {
    segments.push(`📷 ${labels.hasPhotoLabel}`);
  }

  const number = index + 1;

  if (segments.length === 0) {
    if (!techniqueLabel) {
      return `${number}. ${labels.emptyStepLabel}`;
    }
    return `${number}. ${heading}`;
  }

  return `${number}. ${heading} — ${segments.join(" ／ ")}`;
}

function renderStepLines(
  steps: Step[],
  recipe: RecipeDoc,
  labels: NoteMarkdownLabels,
): string[] {
  return steps.map((step, index) =>
    renderStepLine(step, index, recipe, labels),
  );
}

/**
 * RecipeDocからnote.com向けMarkdown文書を生成する。note.com公式対応記法（##・###・-・1.・---）のみ使用。
 * 構成: タイトル(##) → 区切り線 → 使用カラー(###)・使用ツール(###) → 区切り線
 *       → ベース工程(###見出し＋番号付きリスト1工程1行) → パーツ毎（区切り線＋###見出し＋番号付きリスト）
 *       → 区切り線 → ハッシュタグ
 */
export function exportRecipeToNoteMarkdown(
  recipe: RecipeDoc,
  labels: NoteMarkdownLabels = DEFAULT_NOTE_MARKDOWN_LABELS,
): string {
  const lines: string[] = [];

  lines.push(`## ${sanitizeMarkdownText(recipe.title)}`);

  if (recipe.palette.length > 0 || recipe.tools.length > 0) {
    lines.push("");
    lines.push("---");
  }

  if (recipe.palette.length > 0) {
    lines.push("");
    lines.push(`### 🖌️ ${labels.paletteHeading}`);
    for (const color of recipe.palette) {
      const name = color.brand ? `${color.brand} ${color.name}` : color.name;
      lines.push(`- ${sanitizeMarkdownText(name)}`);
    }
  }

  if (recipe.tools.length > 0) {
    lines.push("");
    lines.push(`### 🧰 ${labels.toolsHeading}`);
    for (const tool of recipe.tools) {
      const line = tool.note ? `${tool.name}（${tool.note}）` : tool.name;
      lines.push(`- ${sanitizeMarkdownText(line)}`);
    }
  }

  if (recipe.baseSteps.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`### 🛡️ ${labels.baseStepsHeading}`);
    lines.push("");
    lines.push(...renderStepLines(recipe.baseSteps, recipe, labels));
  }

  recipe.parts.forEach((part) => {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`### ⚔️ ${sanitizeMarkdownText(part.name)}`);
    if (part.steps.length > 0) {
      lines.push("");
      lines.push(...renderStepLines(part.steps, recipe, labels));
    }
  });

  if (labels.hashtag !== "") {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(labels.hashtag);
  }

  return lines.join("\n") + "\n";
}
