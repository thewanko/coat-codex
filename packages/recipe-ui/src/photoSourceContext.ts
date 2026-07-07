// packages/recipe-ui/src/photoSourceContext.ts — PhotoSource の context・型・フックを担う
// （react-refresh/only-export-components対応のためPhotoSource.tsxから分離。
// croppedPhotoStyle.ts の前例に倣う）
//
// recipe-ui の部品（SwatchChip 等）は photoId から表示用URLを直接解決する手段を持たず、
// ホストアプリが注入する resolvePhotoUrl 関数のみに依存する。これにより recipe-ui は
// codex の Dexie（db/photoStore）にも scriptorium の公開データ形式にも依存しない。
//
// - codex: `photoStore.resolvePhotoUrl`（apps/codex/src/db/photoStore.ts）を注入する（結線は ST-10）
// - scriptorium: 公開形式に工程写真・チップ写真が存在しないため `async () => null` を注入し、
//   常にプレースホルダ/hex表示へ縮退させる

import { createContext, useContext, useEffect, useState } from "react";

/**
 * photoId から表示用URL（objectURL 等）を解決する関数のシグネチャ。
 * codex の `db/photoStore.resolvePhotoUrl` と同一シグネチャ。
 * 欠損時は null を返す（呼び出し側はプレースホルダ表示にフォールバックする）。
 */
export type ResolvePhotoUrl = (photoId: string) => Promise<string | null>;

/**
 * 既定値は常に null を返す関数。
 * JSDoc: ホストアプリは PhotoSourceProvider を必ずマウントすること。
 * 未マウントのまま usePhotoUrl を使うと常にプレースホルダ/hex表示へ縮退する
 * （codex の結線は ST-10 で行う）。
 */
const defaultResolvePhotoUrl: ResolvePhotoUrl = async () => null;

export const PhotoSourceContext = createContext<ResolvePhotoUrl>(
  defaultResolvePhotoUrl,
);

/**
 * photoId を表示用URLへ解決するフック。
 * photoId が falsy（null/undefined/空文字）の場合は常に null を返す。
 * 解決は useEffect 内で行い、アンマウント/photoId変更時は cancelled フラグで
 * 古い解決結果によるsetStateを抑止する（SwatchChip.tsx の既存実装パターンを踏襲）。
 */
export function usePhotoUrl(photoId: string | null | undefined): string | null {
  const resolvePhotoUrl = useContext(PhotoSourceContext);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void resolvePhotoUrl(photoId).then((resolved) => {
      if (!cancelled) {
        setUrl(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photoId, resolvePhotoUrl]);

  return url;
}
