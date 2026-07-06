// components/common/BackLink.tsx — 画面間の「戻る」導線（スマホ実機フィードバック対応）
//
// PartEditorPage（通常/baseモード）・RecipeOverviewPage・RecipeSetupPageの各ページ先頭に
// 配置するghost調テキストリンク（デザイン仕様書§4 Button/ghost準拠: 透明背景・
// --color-linkテキスト・下線dotted、hoverで実線）。react-routerのLinkのみを使い、
// ブラウザ履歴は汚さない通常遷移（replace不要 — 技術計画上「戻る」は明示ナビゲーションで
// 十分なため）。タッチ目標44pxはCSS側（min-height）で確保する。

import { Link } from "react-router";
import styles from "./BackLink.module.css";

interface BackLinkProps {
  to: string;
  label: string;
}

function BackLink({ to, label }: BackLinkProps) {
  return (
    <Link to={to} className={styles.root}>
      <span aria-hidden="true" className={styles.chevron}>
        ←
      </span>
      {label}
    </Link>
  );
}

export default BackLink;
