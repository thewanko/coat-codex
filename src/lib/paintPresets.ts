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
  /** 同名色のレンジ区別用（例: Citadelは"base"等、Vallejoは"Game Color"/"Model Color"）。
   *  未指定ブランド（ak/coatdarms）は後方互換のため省略可 */
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

/** name/nameJaの部分一致（大文字小文字無視）で指定ブランドのカラーを絞り込む
 *  内部でloadBrandColors（キャッシュ済みならfetch不要）を呼ぶ */
export async function searchColors(
  brandId: string,
  query: string,
): Promise<PaintPresetColor[]> {
  const colors = await loadBrandColors(brandId);
  const q = query.trim().toLowerCase();
  if (q === "") return colors;
  return colors.filter((c) => {
    const name = c.name.toLowerCase();
    const nameJa = c.nameJa?.toLowerCase() ?? "";
    return name.includes(q) || nameJa.includes(q);
  });
}
