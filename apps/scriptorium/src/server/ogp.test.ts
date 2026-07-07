// @vitest-environment node
// src/server/ogp.test.ts — OGP メタタグ組み立て・エスケープの unit test（技術計画v1 §4.2/§4.6/§4.7）
//
// HTMLRewriter を使う injectOgp は Workers ランタイムグローバル依存のため対象外
// （wrangler pages dev の結合確認で検証する）。純関数部（buildOgpMeta・
// escapeHtmlAttribute・renderMetaTag）のみを検証する。

import { describe, expect, test } from "vitest";
import { buildOgpMeta, escapeHtmlAttribute, renderMetaTag } from "./ogp";

describe("escapeHtmlAttribute", () => {
  test("& < > \" ' の5文字をエスケープする", () => {
    expect(escapeHtmlAttribute(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  test("script タグ注入を無害化する", () => {
    const input = `<script>alert(1)</script>`;
    const escaped = escapeHtmlAttribute(input);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("引用符注入（属性エスケープ）を無害化する", () => {
    const input = `" onmouseover="alert(1)`;
    const escaped = escapeHtmlAttribute(input);
    expect(escaped).not.toMatch(/(?<!&quot;)"(?!&)/);
    expect(escaped).toBe("&quot; onmouseover=&quot;alert(1)");
  });

  test("& を二重エスケープしない（先に&を変換してから他の文字を変換する）", () => {
    expect(escapeHtmlAttribute("&amp;")).toBe("&amp;amp;");
    expect(escapeHtmlAttribute("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  test("通常文字列はそのまま", () => {
    expect(escapeHtmlAttribute("wolfpainter")).toBe("wolfpainter");
  });
});

describe("buildOgpMeta", () => {
  const baseInput = {
    id: "scr_seed_wolf",
    title: "Timber Wolf Fur Study",
    handle: "wolfpainter",
    origin: "http://localhost:8788",
  };

  test("cover_key ありの場合: og:image絶対URL・twitter:card=summary_large_image", () => {
    const tags = buildOgpMeta({
      ...baseInput,
      coverKey: "covers/scr_seed_wolf.webp",
    });

    const byKey = (key: string) => tags.find((t) => t.key === key);

    expect(byKey("og:title")?.content).toBe(
      "Timber Wolf Fur Study | Coat Scriptorium",
    );
    expect(byKey("og:description")?.content).toContain("wolfpainter");
    expect(byKey("og:url")?.content).toBe(
      "http://localhost:8788/r/scr_seed_wolf",
    );
    expect(byKey("og:type")?.content).toBe("article");
    expect(byKey("og:image")?.content).toBe(
      "http://localhost:8788/img/covers/scr_seed_wolf.webp",
    );
    expect(byKey("twitter:card")?.content).toBe("summary_large_image");
  });

  test("cover_key なしの場合: og:image を含まない・twitter:card=summary", () => {
    const tags = buildOgpMeta({ ...baseInput, coverKey: null });

    const byKey = (key: string) => tags.find((t) => t.key === key);

    expect(byKey("og:image")).toBeUndefined();
    expect(byKey("twitter:card")?.content).toBe("summary");
    expect(byKey("og:title")).toBeDefined();
    expect(byKey("og:url")).toBeDefined();
  });

  test("id/coverKey の特殊文字はURLエンコードされる（og:url/og:imageのURL破損防止）", () => {
    const tags = buildOgpMeta({
      ...baseInput,
      id: `x"y z<s>`,
      coverKey: `covers/we ird".webp`,
    });
    const byKey = (key: string) => tags.find((t) => t.key === key);

    // URLセグメントとしてエンコード済み（引用符・空白・山括弧が残らない）
    expect(byKey("og:url")?.content).toBe(
      "http://localhost:8788/r/x%22y%20z%3Cs%3E",
    );
    expect(byKey("og:image")?.content).toBe(
      "http://localhost:8788/img/covers/we%20ird%22.webp",
    );
    // レンダリング後も生の <script> や引用符破りが現れない
    const urlTag = byKey("og:url");
    const rendered = urlTag ? renderMetaTag(urlTag) : "";
    expect(rendered).not.toContain("<s>");
    expect(rendered).not.toContain('content="http://localhost:8788/r/x"');
  });

  test("title/handle のXSS注入は buildOgpMeta 時点では未エスケープ・renderMetaTag でエスケープされる", () => {
    const tags = buildOgpMeta({
      id: "scr_seed_xss",
      title: `<script>alert(1)</script>`,
      handle: `" onmouseover="alert(1)`,
      coverKey: null,
      origin: "http://localhost:8788",
    });

    const ogTitleTag = tags.find((t) => t.key === "og:title")!;
    const ogDescriptionTag = tags.find((t) => t.key === "og:description")!;

    const renderedTitle = renderMetaTag(ogTitleTag);
    const renderedDescription = renderMetaTag(ogDescriptionTag);

    expect(renderedTitle).not.toContain("<script>");
    expect(renderedTitle).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(renderedDescription).not.toContain(`" onmouseover="alert(1)`);
    expect(renderedDescription).toContain("&quot; onmouseover=&quot;alert(1)");
  });
});

describe("renderMetaTag", () => {
  test("property属性のメタタグをレンダリングする", () => {
    const html = renderMetaTag({
      attr: "property",
      key: "og:title",
      content: "Timber Wolf Fur Study | Coat Scriptorium",
    });
    expect(html).toBe(
      '<meta property="og:title" content="Timber Wolf Fur Study | Coat Scriptorium">',
    );
  });

  test("name属性のメタタグをレンダリングする（twitter:card）", () => {
    const html = renderMetaTag({
      attr: "name",
      key: "twitter:card",
      content: "summary",
    });
    expect(html).toBe('<meta name="twitter:card" content="summary">');
  });
});
