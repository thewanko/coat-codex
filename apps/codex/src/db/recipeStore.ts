// db/recipeStore.ts — レシピCRUD・ロード時lazy migration（技術計画v2.2 §2.7・D-8）
//
// zodパース（@coat-codex/recipe-core）・migration（@coat-codex/recipe-core）のロジックはここで
// 重複実装しない。UIやReactには依存しない（storeはM4でZustandから使われる）。

import { db, type RecipeRecord } from "./db";
import { recipeDocSchema, type RecipeDoc } from "@coat-codex/recipe-core";
import {
  CURRENT_SCHEMA_VERSION,
  migrateRecipeDoc,
} from "@coat-codex/recipe-core";

/**
 * 保存済み文書のschemaVersionがCURRENT_SCHEMA_VERSIONより新しい（未知の将来バージョンである）
 * 場合にloadRecipeが投げる（§2.7）。UI表示: 「新しいバージョンのアプリで作成されたデータです」
 */
export class UnsupportedSchemaError extends Error {
  constructor(id: string, schemaVersion: number) {
    super(
      `recipe "${id}" の schemaVersion ${schemaVersion} は現在のアプリ（対応最大: ${CURRENT_SCHEMA_VERSION}）より新しいバージョンです`,
    );
    this.name = "UnsupportedSchemaError";
  }
}

/**
 * migration適用後もrecipeDocSchemaのparseに失敗する（破損している）場合にloadRecipeが投げる
 * （§2.7）。自動削除はしない（ユーザーにエラー表示のみ行い、データは保持する）。
 */
export class CorruptRecipeError extends Error {
  constructor(id: string) {
    super(`recipe "${id}" は破損しています（スキーマ検証に失敗）`);
    this.name = "CorruptRecipeError";
  }
}

/**
 * 一覧表示用: updatedAt降順の全レシピ文書一覧（§2.7・§3.3 HomePage RecipeCardGrid）。
 *
 * lazy migrationをここにも適用する（B-4実機バグ対応）: 従来はloadRecipe（個別ロード）にしか
 * migrationが無く、一覧経路はv1文書（例: photoCropsフィールド欠落）がそのまま流れていた。
 * RecipeCardがrecipe.photoCropsに直アクセスするようになったことでこの穴が顕在化し、
 * v1データが混在する実環境でHome全体がクラッシュする事象が発生した。
 *
 * 修正方針:
 * - schemaVersion < CURRENT の文書は migrateRecipeDoc を適用してから返す（in-memoryのみ。
 *   DBへの書き戻しはしない。書き戻しは既存どおり個別loadRecipeのtx内責務のままとする —
 *   一覧表示のたびに全件へ書き戻しtxを走らせるのは、個別編集との並行書き込みに対する
 *   lost update耐性が無く並行性リスクが大きいため）。
 * - schemaVersion > CURRENT（未来バージョン）の文書は、loadRecipeと異なり一覧全体を
 *   道連れにthrowせず、当該レコードのみスキップしconsole.warnで記録する。個別ロードと
 *   一覧表示は可用性要求が異なり、1件の将来バージョン文書のせいでHome全体が表示不能に
 *   なる方が実害が大きいと判断したため（1件アプリ内部で完結する部分機能が失われるより、
 *   一覧そのものが死ぬ方が影響範囲が広い）。
 * - migration適用後もrecipeDocSchemaのparseに失敗する（破損）文書も同様の理由でスキップする
 *   （loadRecipeはCorruptRecipeErrorをthrowして個別編集画面でエラー提示する設計だが、
 *   一覧はその1件だけ欠落させて他を表示できる方が望ましい）。
 */
export async function listRecipes(): Promise<RecipeDoc[]> {
  const records = await db.recipes.orderBy("updatedAt").reverse().toArray();

  const result: RecipeDoc[] = [];
  for (const raw of records) {
    const schemaVersion = (raw as { schemaVersion?: unknown }).schemaVersion;

    if (
      typeof schemaVersion === "number" &&
      schemaVersion > CURRENT_SCHEMA_VERSION
    ) {
      console.warn(
        `listRecipes: recipe "${(raw as { id?: unknown }).id}" のschemaVersion ${schemaVersion} は現在のアプリ（対応最大: ${CURRENT_SCHEMA_VERSION}）より新しいため一覧から除外します`,
      );
      continue;
    }

    const needsMigration =
      typeof schemaVersion === "number" &&
      schemaVersion < CURRENT_SCHEMA_VERSION;
    const candidate: unknown = needsMigration
      ? migrateRecipeDoc(raw, schemaVersion)
      : raw;

    const parsed = recipeDocSchema.safeParse(candidate);
    if (!parsed.success) {
      console.warn(
        `listRecipes: recipe "${(raw as { id?: unknown }).id}" はスキーマ検証に失敗したため一覧から除外します`,
      );
      continue;
    }

    result.push(parsed.data);
  }

  return result;
}

/**
 * 新規ドラフトを作成・保存して返す（§2.1初期形・D-8）。
 * titleは呼び出し側からi18n解決済み既定名（i18nキー recipe.untitledTitle）を受け取る想定。
 * 空文字は不変条件15（title空文字不可）に反するため許容しない。
 */
export async function createDraft(title: string): Promise<RecipeDoc> {
  if (title.trim().length === 0) {
    throw new Error(
      "createDraft: title は空文字にできません（D-8・不変条件15）",
    );
  }

  const now = new Date().toISOString();
  const draft: RecipeDoc = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: `rcp_${crypto.randomUUID()}`,
    title,
    createdAt: now,
    updatedAt: now,
    overviewPhotoIds: [],
    palette: [],
    tools: [],
    baseSteps: [],
    parts: [],
    photoCrops: {},
  };

  const parsed = recipeDocSchema.parse(draft);
  await db.recipes.put(parsed as RecipeRecord);
  return parsed;
}

/** updatedAtを更新してput（保存）する */
export async function saveRecipe(doc: RecipeDoc): Promise<RecipeDoc> {
  const updated: RecipeDoc = { ...doc, updatedAt: new Date().toISOString() };
  await db.recipes.put(updated as RecipeRecord);
  return updated;
}

/**
 * レシピ削除。photosのGC（当該レシピに紐づく写真の削除）はT14（写真ストア）の責務なので
 * ここでは行わない。
 */
export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id);
}

/**
 * レシピをロードする（lazy migration。§2.7）:
 * 1. 文書のschemaVersion > CURRENT → UnsupportedSchemaError
 * 2. schemaVersion < CURRENT → migrateRecipeDoc適用 → recipeDocSchema.parse →
 *    書き戻してから返す（次回以降はmigration不要）
 * 3. schemaVersion === CURRENT → parseして返す
 * 4. parse失敗（破損） → CorruptRecipeError（自動削除しない）
 * 5. 存在しない → null
 *
 * migration不要経路はトランザクションなしの単純read（パフォーマンス優先）。
 * migration書き戻しが必要な場合のみ`db.transaction("rw", ...)`で読み直し→書き戻しを囲み、
 * 同一idへの並行saveとのlost updateを防ぐ（tx内で版数を再確認し、その時点で既にmigration不要
 * になっていれば書き戻しをスキップする）。
 */
export async function loadRecipe(id: string): Promise<RecipeDoc | null> {
  const raw = await db.recipes.get(id);
  if (raw === undefined) {
    return null;
  }

  const schemaVersion = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (
    typeof schemaVersion === "number" &&
    schemaVersion > CURRENT_SCHEMA_VERSION
  ) {
    throw new UnsupportedSchemaError(id, schemaVersion);
  }

  const needsMigration =
    typeof schemaVersion === "number" && schemaVersion < CURRENT_SCHEMA_VERSION;

  if (!needsMigration) {
    const result = recipeDocSchema.safeParse(raw);
    if (!result.success) {
      throw new CorruptRecipeError(id);
    }
    return result.data;
  }

  return db.transaction("rw", db.recipes, async () => {
    const current = await db.recipes.get(id);
    if (current === undefined) {
      return null;
    }

    const currentSchemaVersion = (current as { schemaVersion?: unknown })
      .schemaVersion;
    if (
      typeof currentSchemaVersion === "number" &&
      currentSchemaVersion > CURRENT_SCHEMA_VERSION
    ) {
      throw new UnsupportedSchemaError(id, currentSchemaVersion);
    }

    const stillNeedsMigration =
      typeof currentSchemaVersion === "number" &&
      currentSchemaVersion < CURRENT_SCHEMA_VERSION;

    const candidate: unknown = stillNeedsMigration
      ? migrateRecipeDoc(current, currentSchemaVersion)
      : current;

    const result = recipeDocSchema.safeParse(candidate);
    if (!result.success) {
      throw new CorruptRecipeError(id);
    }

    if (stillNeedsMigration) {
      await db.recipes.put(result.data as RecipeRecord);
    }

    return result.data;
  });
}
