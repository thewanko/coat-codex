// lib/paintPresets.ts — プリセット塗料DBの遅延ロード・検索（技術計画v2.2 §4.2 T17）
//
// public/paints/*.json を遅延fetchし、メモリキャッシュする。プリセットDBは
// 「読めなくても自由入力で使える」設計のため、fetch失敗時は例外を投げず
// console.warnのうえ空配列を返す（呼び出し側のUIをブロックしない）。

/** public/paints/index.json のブランド一覧エントリ */
export interface PaintBrandMeta {
  id: string;
  label: string;
  file: string;
  count: number;
}

/** public/paints/index.json 全体 */
export interface PaintBrandIndex {
  brands: PaintBrandMeta[];
}

/** 各ブランドファイル内のカラーエントリ（§2.1 palette要素と整合するid形式 `<brandId>:<slug>`） */
export interface PaintPresetColor {
  id: string;
  name: string;
  nameJa?: string;
  /** 同名色のレンジ区別用（例: Citadelは"base"等、Vallejoは"Game Color"/"Model Color"、
   *  Coat d'armsは"fantasy"/"military"/"wwii"）。range未対応ブランドは後方互換のため省略可 */
  range?: string;
  hex: string | null;
}

/** 各ブランドファイル全体 */
export interface PaintBrandFile {
  brandId: string;
  label: string;
  colors: PaintPresetColor[];
}

let indexCache: PaintBrandIndex | null = null;
let indexPromise: Promise<PaintBrandIndex> | null = null;
const brandColorsCache = new Map<string, PaintPresetColor[]>();
const brandColorsPromise = new Map<string, Promise<PaintPresetColor[]>>();

/** index.jsonをfetchしブランド一覧を返す（メモリキャッシュ・fetch失敗時は空配列） */
export async function loadBrandIndex(): Promise<PaintBrandMeta[]> {
  if (indexCache) return indexCache.brands;
  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        const res = await fetch("/paints/index.json");
        if (!res.ok) {
          throw new Error(`index.json fetch failed: ${res.status}`);
        }
        const data = (await res.json()) as PaintBrandIndex;
        indexCache = data;
        return data;
      } catch (err) {
        console.warn("paintPresets: failed to load brand index", err);
        indexPromise = null;
        return { brands: [] };
      }
    })();
  }
  const data = await indexPromise;
  return data.brands;
}

/** 指定ブランドのカラー一覧をfetchする（メモリキャッシュ・fetch失敗時は空配列） */
export async function loadBrandColors(
  brandId: string,
): Promise<PaintPresetColor[]> {
  const cached = brandColorsCache.get(brandId);
  if (cached) return cached;

  let pending = brandColorsPromise.get(brandId);
  if (!pending) {
    pending = (async () => {
      try {
        const brands = await loadBrandIndex();
        const meta = brands.find((b) => b.id === brandId);
        if (!meta) {
          throw new Error(`unknown brandId: ${brandId}`);
        }
        const res = await fetch(`/paints/${meta.file}`);
        if (!res.ok) {
          throw new Error(`${meta.file} fetch failed: ${res.status}`);
        }
        const data = (await res.json()) as PaintBrandFile;
        brandColorsCache.set(brandId, data.colors);
        return data.colors;
      } catch (err) {
        console.warn(
          `paintPresets: failed to load brand colors for "${brandId}"`,
          err,
        );
        brandColorsPromise.delete(brandId);
        return [];
      }
    })();
    brandColorsPromise.set(brandId, pending);
  }
  return pending;
}

/** ブランドindex照会結果。fetch成否を呼び出し側が区別できる形で返す
 *  （lib/importRecipe.ts のimport時preset降格判定用。§2.7 d 裁定規則a〜c）。
 *  index.jsonのfetch自体が失敗した場合はok:falseを返す（loadBrandIndexは失敗時
 *  空配列へ丸めるため、その丸め込みを経由せず本関数はfetch層を直接見る）。 */
export type LoadBrandIndexResult =
  { ok: true; brands: PaintBrandMeta[] } | { ok: false };

/** index.jsonをfetchし、fetch成否を区別した形でブランド一覧を返す（メモリキャッシュはloadBrandIndexと共有）。
 *  既存のloadBrandIndex（常に空配列へフォールバックする挙動）は変更しない追加API。 */
export async function loadBrandIndexResult(): Promise<LoadBrandIndexResult> {
  if (indexCache) return { ok: true, brands: indexCache.brands };
  try {
    const brands = await loadBrandIndex();
    // loadBrandIndex成功時は必ずindexCacheが埋まる。失敗時のみindexCacheはnullのまま
    // （loadBrandIndex内でindexPromiseをnullへ戻すため、ここでの再判定にindexCacheを使う）。
    if (indexCache) return { ok: true, brands };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/** 指定ブランドのカラー一覧照会結果。fetch成否・「ブランドがindexに存在しない」を
 *  呼び出し側が区別できる形で返す（lib/importRecipe.ts のimport時preset降格判定用。
 *  §2.7 d 裁定規則a〜c）。既存のloadBrandColors（常に空配列へフォールバックする挙動）は
 *  変更しない追加API。メモリキャッシュはloadBrandColorsと共有する。 */
export type LoadBrandColorsResult =
  | { ok: true; colors: PaintPresetColor[] }
  | {
      ok: false;
      reason: "unknown-brand" | "fetch-failed" | "index-unavailable";
    };

export async function loadBrandColorsResult(
  brandId: string,
): Promise<LoadBrandColorsResult> {
  const cached = brandColorsCache.get(brandId);
  if (cached) return { ok: true, colors: cached };

  const indexResult = await loadBrandIndexResult();
  if (!indexResult.ok) {
    return { ok: false, reason: "index-unavailable" };
  }
  const meta = indexResult.brands.find((b) => b.id === brandId);
  if (!meta) {
    return { ok: false, reason: "unknown-brand" };
  }

  const colors = await loadBrandColors(brandId);
  const cachedAfter = brandColorsCache.get(brandId);
  if (cachedAfter) {
    return { ok: true, colors: cachedAfter };
  }
  // loadBrandColorsはbrandIdがindexに実在してもfetch失敗時は空配列へ丸め込む。
  // ここではbrandがindexに実在すると確認済みのため、キャッシュ未充填=fetch失敗と判定できる。
  void colors;
  return { ok: false, reason: "fetch-failed" };
}

/** name/nameJaの部分一致（大文字小文字無視）で指定ブランドのカラーを絞り込む。
 *  rangeを指定すると、その値に完全一致するカラーのみへさらに絞り込む
 *  （undefined/省略時は絞り込みなし＝全range対象）。
 *  内部でloadBrandColors（キャッシュ済みならfetch不要）を呼ぶ */
export async function searchColors(
  brandId: string,
  query: string,
  range?: string,
): Promise<PaintPresetColor[]> {
  const colors = await loadBrandColors(brandId);
  const q = query.trim().toLowerCase();
  const byQuery =
    q === ""
      ? colors
      : colors.filter((c) => {
          const name = c.name.toLowerCase();
          const nameJa = c.nameJa?.toLowerCase() ?? "";
          return name.includes(q) || nameJa.includes(q);
        });
  if (!range) return byQuery;
  return byQuery.filter((c) => c.range === range);
}

/** カラー一覧からrange一覧を導出する（データ順を保持した重複排除）。
 *  rangeを持たないカラーが1件でもあれば絞り込みUIを出す意味がないため空配列を返す。 */
export function getAvailableRanges(colors: PaintPresetColor[]): string[] {
  if (colors.length === 0) return [];
  if (colors.some((c) => !c.range)) return [];
  const seen = new Set<string>();
  const ranges: string[] = [];
  for (const c of colors) {
    const r = c.range;
    if (r && !seen.has(r)) {
      seen.add(r);
      ranges.push(r);
    }
  }
  return ranges;
}
