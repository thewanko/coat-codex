// models/migrations.ts — schemaVersionマイグレーション骨組み（技術計画v2.2 §2.7/§4.2 T11）
//
// ロード時lazy migration（§2.7）およびインポート3段検証の第2段（migrate）から呼ばれる。
// zodによる検証は行わない（形の変換のみ。検証は呼び出し側の責務 — §2.7）。
//
// key = 変換元バージョン。v2導入時は docRegistry[1] = (v1Doc) => v2Doc を追加する。
// 現行はv1のみのためレジストリは空（v1は恒等＝そのまま返す）。

export const CURRENT_SCHEMA_VERSION = 1;

/** RecipeDoc本体のバージョン間変換関数レジストリ。キーn = vn→vn+1変換 */
export type DocMigrationRegistry = Record<number, (doc: unknown) => unknown>;

/** RecipeExportFile.photos部のバージョン間変換関数レジストリ。キーn = vn→vn+1変換（将来分。現行は空） */
export type PhotosMigrationRegistry = Record<
  number,
  (photos: unknown) => unknown
>;

const docRegistry: DocMigrationRegistry = {};
const photosRegistry: PhotosMigrationRegistry = {};

/** fromVersionがtargetVersionより新しい（未知の将来バージョンである）場合に投げる */
export class UnsupportedSchemaVersionError extends Error {
  constructor(fromVersion: number) {
    super(
      `schemaVersion ${fromVersion} は現在のアプリ（対応最大: ${CURRENT_SCHEMA_VERSION}）より新しいバージョンです`,
    );
    this.name = "UnsupportedSchemaVersionError";
  }
}

/** 順次適用の途中でregistryに中間バージョンの変換関数が欠落している場合に投げる。
 * サイレントスキップ（旧仕様）は未変換のデータを後段の検証まで見逃す危険があるため、
 * 欠落を検知した時点で即座に失敗させる（M1 opusレビュー指摘）。 */
export class MissingMigrationError extends Error {
  constructor(version: number) {
    super(
      `schemaVersion ${version}→${version + 1} の変換関数がregistryに存在しません`,
    );
    this.name = "MissingMigrationError";
  }
}

/**
 * fromVersionからtargetVersionまで、registry[fromVersion] → registry[fromVersion+1] → …
 * の順に変換関数を適用する共通ヘルパー。registryは呼び出し側から注入可能（テスト用ダミー注入含む）。
 * 途中のバージョンに対応する変換関数が欠落している場合はMissingMigrationErrorを投げる
 * （サイレントスキップしない）。
 */
function applyMigrations(
  raw: unknown,
  fromVersion: number,
  registry: Record<number, (value: unknown) => unknown>,
  targetVersion: number,
): unknown {
  if (fromVersion > targetVersion) {
    throw new UnsupportedSchemaVersionError(fromVersion);
  }

  let value = raw;
  for (let v = fromVersion; v < targetVersion; v++) {
    const migrate = registry[v];
    if (!migrate) {
      throw new MissingMigrationError(v);
    }
    value = migrate(value);
  }
  return value;
}

/**
 * RecipeDoc（rawなunknown）をfromVersionからtargetVersionまで順次マイグレーションする。
 * registryを省略した場合は本番用docRegistryを使用する（テストではダミーレジストリを注入できる）。
 * targetVersionを省略した場合はCURRENT_SCHEMA_VERSIONを使用する（テストでは目標バージョンを注入できる）。
 */
export function migrateRecipeDoc(
  raw: unknown,
  fromVersion: number,
  registry: DocMigrationRegistry = docRegistry,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): unknown {
  return applyMigrations(raw, fromVersion, registry, targetVersion);
}

/**
 * RecipeExportFile（rawなunknown）をfromVersionからtargetVersionまで順次マイグレーションする。
 * recipe部分にはmigrateRecipeDocを適用し、photos部分は将来分のphotosRegistryを適用する。
 * どちらのレジストリもテスト用に引数注入できる。targetVersionを省略した場合は
 * CURRENT_SCHEMA_VERSIONを使用する（テストでは目標バージョンを注入できる）。
 */
export function migrateExportFile(
  raw: unknown,
  fromVersion: number,
  docReg: DocMigrationRegistry = docRegistry,
  photosReg: PhotosMigrationRegistry = photosRegistry,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): unknown {
  if (fromVersion > targetVersion) {
    throw new UnsupportedSchemaVersionError(fromVersion);
  }

  if (fromVersion === targetVersion) {
    return raw;
  }

  const file = raw as Record<string, unknown>;
  const migratedRecipe = migrateRecipeDoc(
    file.recipe,
    fromVersion,
    docReg,
    targetVersion,
  );
  const migratedPhotos = applyMigrations(
    file.photos,
    fromVersion,
    photosReg,
    targetVersion,
  );

  return {
    ...file,
    schemaVersion: targetVersion,
    recipe: migratedRecipe,
    photos: migratedPhotos,
  };
}
