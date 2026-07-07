// src/server/ogp.ts — OGP メタタグ組み立て＋ HTMLRewriter 注入（技術計画v1 §4.2/§4.6）
//
// 純ロジック部（buildOgpMeta・escapeHtmlAttribute・renderMetaTag）は
// unit test 対象。HTMLRewriter は Pages Functions（Workers ランタイム）
// グローバルのため、実行そのものは wrangler pages dev の結合確認で検証する
// （§4.7: HTMLRewriter実行はunit test対象外と明記）。

/** OGP メタタグ注入に必要な入力（D1 recipes 行の一部＋オリジン）。 */
export interface OgpMetaInput {
  id: string;
  title: string;
  handle: string;
  coverKey: string | null;
  origin: string;
}

/** 注入する単一メタタグ（property または name のどちらかを持つ）。 */
export interface MetaTag {
  attr: "property" | "name";
  key: string;
  content: string;
}

/**
 * HTML 属性値としてのエスケープ（& < > " ' の5文字）。
 * title/handle はユーザー投稿由来のため、`<script>`・引用符・& 注入を無害化する。
 * & は最初に変換すること（他の変換で生成された実体参照を二重エスケープしないため）。
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 注入する OGP/Twitter Card メタタグ配列を組み立てる（未エスケープの生値を受け取り、この関数内でエスケープする）。 */
export function buildOgpMeta(input: OgpMetaInput): MetaTag[] {
  const { id, title, handle, coverKey, origin } = input;

  const ogTitle = `${title} | Coat Scriptorium`;
  const ogDescription = `A miniature painting recipe shared by ${handle} on Coat Scriptorium.`;
  // id/coverKey はURLセグメントとしてエンコードする（属性エスケープはXSSを防ぐが
  // URL自体の破損は防がないため。coverKeyは`covers/xxx.webp`の区切りを保持）
  const ogUrl = `${origin}/r/${encodeURIComponent(id)}`;

  const tags: MetaTag[] = [
    { attr: "property", key: "og:title", content: ogTitle },
    { attr: "property", key: "og:description", content: ogDescription },
    { attr: "property", key: "og:url", content: ogUrl },
    { attr: "property", key: "og:type", content: "article" },
  ];

  if (coverKey) {
    tags.push({
      attr: "property",
      key: "og:image",
      content: `${origin}/img/${coverKey.split("/").map(encodeURIComponent).join("/")}`,
    });
    tags.push({
      attr: "name",
      key: "twitter:card",
      content: "summary_large_image",
    });
  } else {
    tags.push({ attr: "name", key: "twitter:card", content: "summary" });
  }

  return tags;
}

/** MetaTag を `<meta property="..." content="...">` 形式の HTML 文字列にレンダリングする（属性値エスケープ込み）。 */
export function renderMetaTag(tag: MetaTag): string {
  return `<meta ${tag.attr}="${escapeHtmlAttribute(tag.key)}" content="${escapeHtmlAttribute(tag.content)}">`;
}

/**
 * index.html の Response の `<head>` へ OGP メタタグ群を追記した新しい Response を返す。
 * HTMLRewriter は Workers ランタイムのグローバルのため、この関数自体は
 * unit test（vitest node環境）では呼び出されず、wrangler pages dev の結合確認で検証する。
 */
export function injectOgp(response: Response, tags: MetaTag[]): Response {
  const markup = tags.map(renderMetaTag).join("");
  const rewriter = new HTMLRewriter().on("head", {
    element(element) {
      element.append(markup, { html: true });
    },
  });
  return rewriter.transform(response);
}
