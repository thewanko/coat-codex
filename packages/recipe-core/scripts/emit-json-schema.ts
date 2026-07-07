// scripts/emit-json-schema.ts — publishedRecipeSchemaのJSON Schema生成スクリプト（技術計画v1 §2.3）
//
// 検証の正は常にzod（publishedRecipeSchema）であり、ここで生成するJSON Schemaは
// ドキュメント・他言語ツール向けの副産物にすぎない（§2.3「JSON Schemaは
// z.toJSONSchema(publishedRecipeSchema)で生成する副産物とし、検証の正は常にzod」）。
//
// 実行: recipe-core直下から `node scripts/emit-json-schema.ts`（または `npm run emit-json-schema`）。
// Node v24のネイティブTypeScript実行（type stripping）を使うが、Node ESMは相対importの
// 拡張子省略解決をサポートしないため（本パッケージのソースは`allowImportingTsExtensions`前提で
// 拡張子なしimportを使っている）、Node標準のmodule.register APIのみで拡張子補完フックを
// 登録してから対象モジュールを動的importする（新規npm依存の追加なし）。

import { register } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 拡張子省略の相対importに`.ts`を補完するローダーフック（本パッケージ内の
// 拡張子なしimport規約をNodeネイティブ実行から解決可能にするための最小限の橋渡し）。
const extensionFallbackLoader = `
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[a-zA-Z0-9]+$/.test(specifier)) {
    try {
      return await next(specifier + ".ts", context);
    } catch {
      // 拡張子補完で解決できない場合は元の指定のまま次へ委ねる
    }
  }
  return next(specifier, context);
}
`;
register(
  `data:text/javascript,${encodeURIComponent(extensionFallbackLoader)}`,
  pathToFileURL(__dirname + "/"),
);

async function main(): Promise<void> {
  const { z } = await import("zod");
  const { publishedRecipeSchema } = await import("../src/schema/published.ts");

  const outDir = resolve(__dirname, "../../../docs/scriptorium");
  const outFile = resolve(outDir, "published-recipe.schema.json");

  const jsonSchema = z.toJSONSchema(publishedRecipeSchema);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(jsonSchema, null, 2) + "\n", "utf-8");

  console.log(`JSON Schema written to ${outFile}`);
}

await main();
