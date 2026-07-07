#!/usr/bin/env node
// scripts/seed.mjs — D1/R2ローカル(既定)/リモート(--remote)シード投入スクリプト（技術計画v1 §3.1/§3.2/§2.1〜2.3）
//
// PublishedRecipeをスクリプト内で組み立て、@coat-codex/recipe-coreのstrictスキーマで
// parse検証してから挿入する（検証失敗時は非0終了）。挿入はwrangler d1 execute / r2 object put を
// child_processで実行する。冪等（同一seed idを先にDELETEしてからINSERT）。
//
// 実行: apps/scriptorium直下から `node scripts/seed.mjs`（ローカル既定）/ `node scripts/seed.mjs --remote`。
//
// Node v24のネイティブTypeScript実行（type stripping）で@coat-codex/recipe-coreのソースを
// 直接importするが、Node ESMは相対importの拡張子省略解決をサポートしないため
// （recipe-core内部は拡張子なしimport規約。かつindex.tsは`./convert`のような
// ディレクトリimportも行う）、拡張子補完＋ディレクトリindex補完フックを
// module.registerで登録してから対象パッケージを動的importする
// （packages/recipe-core/scripts/emit-json-schema.tsの前例を踏襲・新規npm依存なし）。

import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTORIUM_ROOT = resolve(__dirname, "..");

const extensionFallbackLoader = `
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[a-zA-Z0-9]+$/.test(specifier)) {
    try {
      return await next(specifier + ".ts", context);
    } catch {
      // 拡張子補完で解決できない場合はディレクトリindexを試す
    }
    try {
      return await next(specifier + "/index.ts", context);
    } catch {
      // それでも解決できない場合は元の指定のまま次へ委ねる
    }
  }
  return next(specifier, context);
}
`;
register(
  `data:text/javascript,${encodeURIComponent(extensionFallbackLoader)}`,
  pathToFileURL(resolve(SCRIPTORIUM_ROOT, "../../packages/recipe-core/")),
);

const { publishedRecipeStrictSchema, SCRIPTORIUM_SCHEMA_VERSION } =
  await import("@coat-codex/recipe-core");

// ---------------------------------------------------------------------------
// CLIフラグ
// ---------------------------------------------------------------------------

const REMOTE = process.argv.includes("--remote");
const MODE_FLAG = REMOTE ? "--remote" : "--local";
const D1_DATABASE = "coat-scriptorium-db";
const R2_BUCKET = "coat-scriptorium-images";

console.error(`[seed] mode=${REMOTE ? "remote" : "local"}`);

// ---------------------------------------------------------------------------
// PBKDF2削除パスワードハッシュ（§3.1 delete_pw_hash。auth/password.tsのST-18実装を先取りしない
// 素朴なワンオフ実装 — 形式 'pbkdf2-sha256$<iter>$<saltB64>$<hashB64>' のみ満たす）
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const SEED_DELETE_PASSWORD = "seed-delete-pw"; // 全シード共通の固定パスワード（シードデータのみで使用。実運用には使わない）

function hashDeletePassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

// ---------------------------------------------------------------------------
// 最小の実WebP（1x1 VP8Lロスレス・単色不透明ピクセル。RIFF/WEBP/VP8Lヘッダを持つ本物のWebP）
// cover/thumb共通で使い回す（シードの目的は「実WebPとしてR2投入・取得できること」の検証のため）
// ---------------------------------------------------------------------------

const MINI_WEBP_BASE64 = "UklGRhgAAABXRUJQVlA4TAwAAAAvAAAAEChyySrT/wA=";

// ---------------------------------------------------------------------------
// シードデータ組み立て（出口実機検証の分岐: §2.1 mix・技法・palette混在・cover有無・
// published_atタイブレーク・status分岐）
// ---------------------------------------------------------------------------

const NOW = new Date("2026-07-07T12:00:00.000Z");
const isoMinusMinutes = (min) =>
  new Date(NOW.getTime() - min * 60_000).toISOString();

/** @type {(doc: unknown) => import("@coat-codex/recipe-core").PublishedRecipe} */
function buildWolfRecipe() {
  return {
    scriptoriumSchemaVersion: SCRIPTORIUM_SCHEMA_VERSION,
    title: "Timber Wolf Fur Study",
    palette: [
      {
        id: "col_preset_grey",
        source: "preset",
        brand: null,
        name: "Wolf Grey",
        presetId: "preset_wolf_grey",
        hex: null,
      },
      {
        id: "col_custom_brown",
        source: "custom",
        brand: "Vallejo",
        name: "Custom Umber Mix",
        presetId: null,
        hex: "#5A3B22",
      },
      {
        id: "col_custom_white",
        source: "custom",
        brand: null,
        name: "Bone White",
        presetId: null,
        hex: "#EDE6D6",
      },
    ],
    tools: [
      { id: "tool_brush_small", name: "Small drybrush" },
      { id: "tool_sponge", name: "Stippling sponge" },
    ],
    baseSteps: [
      {
        id: "step_base_prime",
        technique: { presetKey: "prime", label: null },
        paints: [{ colorId: "col_preset_grey" }],
        mix: null,
        toolIds: [],
      },
      {
        id: "step_base_custom_blend",
        technique: { presetKey: null, label: "Hand-mixed fur blend" },
        // mix合計≠100（意図的。INV-2/3/4は満たすがINV-10〔合計100〕は未実装のため受理される分岐）
        paints: [
          { colorId: "col_custom_brown" },
          { colorId: "col_custom_white" },
        ],
        mix: [30, 30],
        toolIds: ["tool_brush_small"],
      },
    ],
    parts: [
      {
        id: "part_body",
        name: "Body",
        steps: [
          {
            id: "step_body_basecoat",
            technique: { presetKey: "basecoat", label: null },
            paints: [{ colorId: "col_preset_grey" }],
            mix: null,
            toolIds: [],
          },
          {
            id: "step_body_drybrush",
            technique: { presetKey: "drybrush", label: null },
            paints: [{ colorId: "col_custom_white" }],
            mix: null,
            toolIds: ["tool_brush_small"],
          },
        ],
      },
      {
        id: "part_muzzle",
        name: "Muzzle",
        steps: [
          {
            id: "step_muzzle_stipple",
            technique: { presetKey: null, label: "Stipple texture pass" },
            paints: [{ colorId: "col_custom_brown" }],
            mix: null,
            toolIds: ["tool_sponge"],
          },
        ],
      },
      {
        id: "part_tail",
        name: "Tail",
        steps: [
          {
            id: "step_tail_wash",
            technique: { presetKey: "wash", label: null },
            paints: [{ colorId: "col_custom_brown" }],
            mix: null,
            toolIds: [],
          },
        ],
      },
    ],
  };
}

function buildPlainRecipe() {
  return {
    scriptoriumSchemaVersion: SCRIPTORIUM_SCHEMA_VERSION,
    title: "Plain Base Grey Test Mini",
    palette: [
      {
        id: "col_plain_grey",
        source: "custom",
        brand: null,
        name: "Base Grey",
        presetId: null,
        hex: "#808080",
      },
      {
        id: "col_plain_black",
        source: "custom",
        brand: null,
        name: "Wash Black",
        presetId: null,
        hex: "#1A1A1A",
      },
    ],
    tools: [],
    baseSteps: [
      {
        id: "step_plain_base",
        technique: { presetKey: "basecoat", label: null },
        paints: [{ colorId: "col_plain_grey" }],
        mix: null,
        toolIds: [],
      },
      {
        id: "step_plain_wash",
        technique: { presetKey: "wash", label: null },
        paints: [{ colorId: "col_plain_black" }],
        mix: null,
        toolIds: [],
      },
    ],
    parts: [],
  };
}

function buildGrandRecipe() {
  const partNames = [
    "Head",
    "Torso",
    "Left Arm",
    "Right Arm",
    "Left Leg",
    "Right Leg",
  ];
  const paletteHexes = [
    "#111111",
    "#222222",
    "#333333",
    "#444444",
    "#555555",
    "#666666",
    "#777777",
    "#888888",
    "#999999",
    "#AAAAAA",
    "#BBBBBB",
    "#CCCCCC",
  ];
  const palette = paletteHexes.map((hex, i) => ({
    id: `col_grand_${i}`,
    source: "custom",
    brand: null,
    name: `Grand Color ${i + 1}`,
    presetId: null,
    hex,
  }));
  const parts = partNames.map((name, pi) => ({
    id: `part_grand_${pi}`,
    name,
    steps: [
      {
        id: `step_grand_${pi}_base`,
        technique: { presetKey: "basecoat", label: null },
        paints: [{ colorId: palette[pi % palette.length].id }],
        mix: null,
        toolIds: [],
      },
      {
        id: `step_grand_${pi}_layer`,
        technique: { presetKey: "layer", label: null },
        paints: [{ colorId: palette[(pi + 1) % palette.length].id }],
        mix: null,
        toolIds: [],
      },
    ],
  }));
  return {
    scriptoriumSchemaVersion: SCRIPTORIUM_SCHEMA_VERSION,
    title: "Grand Multi-Part Legion",
    palette,
    tools: [{ id: "tool_grand_brush", name: "Detail brush" }],
    baseSteps: [
      {
        id: "step_grand_prime",
        technique: { presetKey: "prime", label: null },
        paints: [{ colorId: palette[0].id }],
        mix: null,
        toolIds: [],
      },
    ],
    parts,
  };
}

function buildPendingRecipe() {
  return {
    scriptoriumSchemaVersion: SCRIPTORIUM_SCHEMA_VERSION,
    title: "Pending Review Miniature",
    palette: [
      {
        id: "col_pending_a",
        source: "custom",
        brand: null,
        name: "Pending Red",
        presetId: null,
        hex: "#CC2222",
      },
    ],
    tools: [],
    baseSteps: [
      {
        id: "step_pending_base",
        technique: { presetKey: "basecoat", label: null },
        paints: [{ colorId: "col_pending_a" }],
        mix: null,
        toolIds: [],
      },
    ],
    parts: [],
  };
}

function buildFlaggedRecipe() {
  return {
    scriptoriumSchemaVersion: SCRIPTORIUM_SCHEMA_VERSION,
    title: "Flagged Content Sample",
    palette: [
      {
        id: "col_flagged_a",
        source: "custom",
        brand: null,
        name: "Flag Blue",
        presetId: null,
        hex: "#2222CC",
      },
    ],
    tools: [],
    baseSteps: [
      {
        id: "step_flagged_base",
        technique: { presetKey: "basecoat", label: null },
        paints: [{ colorId: "col_flagged_a" }],
        mix: null,
        toolIds: [],
      },
    ],
    parts: [],
  };
}

// published_atは scr_seed_plain と scr_seed_grand が同時刻（keysetタイブレーク分岐）。
// それ以外のpublished分は明確に降順へずらす。
const TIE_PUBLISHED_AT = isoMinusMinutes(60 * 24 * 2); // 2日前・plain/grand共通

const SEEDS = [
  {
    id: "scr_seed_wolf",
    status: "published",
    handle: "wolfpainter",
    lang: "ja",
    recipe: buildWolfRecipe(),
    hasCover: true,
    createdAt: isoMinusMinutes(60 * 24 * 1),
    publishedAt: isoMinusMinutes(60 * 24 * 1),
  },
  {
    id: "scr_seed_plain",
    status: "published",
    handle: "plainminis",
    lang: "en",
    recipe: buildPlainRecipe(),
    hasCover: false,
    createdAt: TIE_PUBLISHED_AT,
    publishedAt: TIE_PUBLISHED_AT,
  },
  {
    id: "scr_seed_grand",
    status: "published",
    handle: "legionbuilder",
    lang: "en",
    recipe: buildGrandRecipe(),
    hasCover: false,
    createdAt: TIE_PUBLISHED_AT,
    publishedAt: TIE_PUBLISHED_AT,
  },
  {
    id: "scr_seed_pending",
    status: "pending",
    handle: "newcomer",
    lang: "en",
    recipe: buildPendingRecipe(),
    hasCover: false,
    createdAt: isoMinusMinutes(30),
    publishedAt: null,
  },
  {
    id: "scr_seed_flagged",
    status: "flagged",
    handle: "reportedartist",
    lang: "en",
    recipe: buildFlaggedRecipe(),
    hasCover: false,
    createdAt: isoMinusMinutes(60 * 24 * 5),
    publishedAt: isoMinusMinutes(60 * 24 * 5),
    reportCount: 3,
  },
];

// ---------------------------------------------------------------------------
// strict検証
// ---------------------------------------------------------------------------

for (const seed of SEEDS) {
  const result = publishedRecipeStrictSchema.safeParse(seed.recipe);
  if (!result.success) {
    console.error(`[seed] strict検証失敗: ${seed.id}`);
    console.error(result.error.issues);
    process.exit(1);
  }
  console.error(`[seed] strict検証OK: ${seed.id}`);
}

// ---------------------------------------------------------------------------
// SQL組み立て（単引用符二重化エスケープ）
// ---------------------------------------------------------------------------

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  if (value === null || value === undefined) return "NULL";
  return String(value);
}

const IP_HASH_DUMMY =
  "0000000000000000000000000000000000000000000000000000000000000000";

const statements = [];

for (const seed of SEEDS) {
  const recipeJson = JSON.stringify(seed.recipe);
  const deletePwHash = hashDeletePassword(SEED_DELETE_PASSWORD);
  const coverKey = seed.hasCover ? `covers/${seed.id}.webp` : null;
  const thumbKey = seed.hasCover ? `thumbs/${seed.id}.webp` : null;

  // 冪等: 同一seed idを先にDELETEしてからINSERT
  statements.push(`DELETE FROM recipes WHERE id = ${sqlString(seed.id)};`);
  statements.push(
    [
      "INSERT INTO recipes",
      "(id, status, handle, title, lang, schema_version, recipe_json, cover_key, thumb_key, delete_pw_hash, report_count, ip_hash, created_at, published_at, deleted_at)",
      "VALUES",
      `(${[
        sqlString(seed.id),
        sqlString(seed.status),
        sqlString(seed.handle),
        sqlString(seed.recipe.title),
        sqlString(seed.lang),
        sqlNumber(seed.recipe.scriptoriumSchemaVersion),
        sqlString(recipeJson),
        sqlString(coverKey),
        sqlString(thumbKey),
        sqlString(deletePwHash),
        sqlNumber(seed.reportCount ?? 0),
        sqlString(IP_HASH_DUMMY),
        sqlString(seed.createdAt),
        sqlString(seed.publishedAt),
        "NULL",
      ].join(", ")});`,
    ].join(" "),
  );
}

const sql = statements.join("\n") + "\n";

// ---------------------------------------------------------------------------
// wrangler d1 executeで投入
// ---------------------------------------------------------------------------

const tmpDir = mkdtempSync(join(tmpdir(), "coat-scriptorium-seed-"));
try {
  const sqlFile = join(tmpDir, "seed.sql");
  writeFileSync(sqlFile, sql, "utf-8");

  console.error(`[seed] d1 execute (${MODE_FLAG}) file=${sqlFile}`);
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", D1_DATABASE, MODE_FLAG, `--file=${sqlFile}`],
    { cwd: SCRIPTORIUM_ROOT, stdio: "inherit" },
  );

  // -------------------------------------------------------------------------
  // R2へcover/thumb投入（wolfのみ。cover/thumb NULLのレシピはR2投入をスキップ）
  // -------------------------------------------------------------------------

  const webpBytes = Buffer.from(MINI_WEBP_BASE64, "base64");
  const webpFile = join(tmpDir, "mini.webp");
  writeFileSync(webpFile, webpBytes);

  for (const seed of SEEDS) {
    if (!seed.hasCover) continue;
    for (const key of [`covers/${seed.id}.webp`, `thumbs/${seed.id}.webp`]) {
      console.error(`[seed] r2 object put (${MODE_FLAG}) ${R2_BUCKET}/${key}`);
      execFileSync(
        "npx",
        [
          "wrangler",
          "r2",
          "object",
          "put",
          `${R2_BUCKET}/${key}`,
          `--file=${webpFile}`,
          MODE_FLAG,
          "--content-type=image/webp",
        ],
        { cwd: SCRIPTORIUM_ROOT, stdio: "inherit" },
      );
    }
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

console.error(
  `[seed] 完了: ${SEEDS.length}件投入 (${REMOTE ? "remote" : "local"})`,
);
