// src/server/moderation/screenImage.ts — NSFW スクリーニングフック（技術計画v1 §8-2 / S6 ST-29）
//
// Workers AI には専用の NSFW 分類モデルが現存しない。ここでは汎用 vision-instruct
// モデルへプロンプトで分類させる方式を採る（精度限界あり・§8-2）。
// 入力スキーマ（image を bytes 配列にした形式）はモデル固有の仕様であり、
// デプロイ環境で screening を on にした際に実疎通確認が必要。
// 既定は settings.nsfw_screening = 'off' のため、未確認の間も本番挙動には影響しない
// （postRecipe.ts のフック呼び出しは screening === 'on' のときのみ実行される）。

/** Workers AI の `env.AI.run` と同形の、注入可能な最小インターフェース。 */
export interface AiRunner {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export const SCREEN_IMAGE_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

export type ScreenImageVerdict = "pass" | "flag" | "unavailable";

const CLASSIFICATION_PROMPT =
  "You are an image content classifier. " +
  "If the image contains nudity, sexual content, gore, or other unsafe content, respond with exactly UNSAFE. " +
  "Otherwise respond with exactly SAFE. Answer with only that one word.";

const UNSAFE_PATTERN = /\bUNSAFE\b/;
const SAFE_PATTERN = /\bSAFE\b/;

/**
 * NSFW スクリーニングフックを生成する。`postRecipe.ts` の `PostRecipeDeps.screenImage`
 * にそのまま注入できる形（`(bytes) => Promise<{ verdict }>`）で返す。
 * モデル呼び出しが失敗した場合は fail-open（verdict: "unavailable"）とし、例外は投げない。
 */
export function createScreenImage(
  ai: AiRunner,
  model: string = SCREEN_IMAGE_MODEL,
): (imageBytes: Uint8Array) => Promise<{ verdict: ScreenImageVerdict }> {
  return async (imageBytes: Uint8Array) => {
    let raw: unknown;
    try {
      raw = await ai.run(model, {
        prompt: CLASSIFICATION_PROMPT,
        image: Array.from(imageBytes),
        max_tokens: 16,
      });
    } catch (error) {
      console.warn("nsfw screening request failed; fail-open", error);
      return { verdict: "unavailable" };
    }
    return { verdict: parseVerdict(raw) };
  };
}

function parseVerdict(raw: unknown): ScreenImageVerdict {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("response" in raw) ||
    typeof (raw as { response: unknown }).response !== "string"
  ) {
    return "unavailable";
  }
  const upper = (raw as { response: string }).response.toUpperCase();
  if (UNSAFE_PATTERN.test(upper)) return "flag";
  if (SAFE_PATTERN.test(upper)) return "pass";
  return "unavailable";
}
