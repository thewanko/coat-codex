// PhotoSource.tsx — recipe-ui の写真解決注入機構（coat-scriptorium 技術計画v1 §5.2）
//
// PhotoSourceProvider コンポーネント本体のみを担う。context・型・usePhotoUrl フックは
// react-refresh/only-export-components 対応のため photoSourceContext.ts に分離している
// （croppedPhotoStyle.ts の前例に倣う）。

import type { ReactNode } from "react";
import { PhotoSourceContext, type ResolvePhotoUrl } from "./photoSourceContext";

interface PhotoSourceProviderProps {
  resolvePhotoUrl: ResolvePhotoUrl;
  children: ReactNode;
}

/**
 * ホストアプリ（codex/scriptorium）が resolvePhotoUrl を注入するためのProvider。
 * 未マウント時は既定値（常に null を返す関数）が使われ、写真表示部品は
 * プレースホルダ/hex表示へ縮退する。
 */
export function PhotoSourceProvider({
  resolvePhotoUrl,
  children,
}: PhotoSourceProviderProps) {
  return (
    <PhotoSourceContext.Provider value={resolvePhotoUrl}>
      {children}
    </PhotoSourceContext.Provider>
  );
}
