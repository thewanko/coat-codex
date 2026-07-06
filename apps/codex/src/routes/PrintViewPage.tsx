// routes/PrintViewPage.tsx — 印刷プレビュー画面（技術計画v2.2 §3.3・§4.2 T36）
//
// レシピ読み込みは RecipeOverviewPage/PartEditorPage と同じ流儀（useRecipeStore.load(:id)を
// URLパラメータで呼ぶ）に倣うが、本画面は読み取り専用のため updateRecipe 等の書き込み系は
// 使用しない。不正ルート（不存在レシピ）はRecipeOverviewPageの既存慣行と同じく
// setup.loadError / setup.notFound のインラインメッセージ表示に倣う。
//
// モバイル自動スケール（実機フィードバック対応）: 紙面(.sheet)は794px固定幅のため、
// ビューポート幅がそれ未満の画面表示時のみ transform: scale で縮小表示する。
// 実印刷（@media print）には一切影響させない — transformはCSSカスタムプロパティ
// 経由で適用し、@media print側でtransform:noneに戻すことで上書きする（transform自体は
// !important不要）。ただしラッパーの高さはJSがinline styleで直接指定するため、
// @media printでの無効化にはinline styleより優先度を上げる必要があり、
// この1点のみ height:auto !important を用いる（wrapperStyleのheightがinline styleと
// して直接付与されるため — 下記return文参照）。
// 倍率算出の純関数とフック本体は ./printScale に分離する
// （react-refresh/only-export-components対策 — コンポーネントファイルは
// コンポーネントのみをexportする）。境界値（794以上=1・375・0/負値ガード）は
// printScale.test.tsで単体テストする。

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useRecipeStore } from "../stores/useRecipeStore";
import Skeleton from "../components/common/Skeleton";
import PrintToolbar from "../components/print/PrintToolbar";
import PrintRecipeSheet from "../components/print/PrintRecipeSheet";
import { usePrintScale } from "./printScale";
import styles from "./PrintViewPage.module.css";

function PrintViewPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);

  const doc = useRecipeStore((state) => state.doc);
  const scale = usePrintScale(wrapperRef, doc !== null);
  const isLoading = useRecipeStore((state) => state.isLoading);
  const loadError = useRecipeStore((state) => state.loadError);
  const load = useRecipeStore((state) => state.load);

  useEffect(() => {
    if (id) {
      void load(id);
    }
  }, [id, load]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) {
      return;
    }

    function recomputeHeight() {
      if (sheet) {
        setSheetHeight(sheet.scrollHeight);
      }
    }

    recomputeHeight();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(recomputeHeight);
      observer.observe(sheet);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", recomputeHeight);
    return () => window.removeEventListener("resize", recomputeHeight);
  }, [doc]);

  if (isLoading) {
    return (
      <div className={styles.root}>
        <Skeleton variant="card" />
      </div>
    );
  }

  if (loadError !== null) {
    return (
      <div className={styles.root}>
        <p className={styles.error}>{t("print.loadError")}</p>
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className={styles.root}>
        <p className={styles.error}>{t("print.notFound")}</p>
      </div>
    );
  }

  const wrapperStyle = {
    "--print-scale": scale,
    height: sheetHeight !== null ? `${sheetHeight * scale}px` : undefined,
  } as CSSProperties;

  return (
    <div className={styles.root}>
      <PrintToolbar backTo={`/recipe/${id}`} />
      <div
        className={styles.scaleWrapper}
        ref={wrapperRef}
        style={wrapperStyle}
      >
        <div className={styles.scaleInner} ref={sheetRef}>
          <PrintRecipeSheet recipe={doc} />
        </div>
      </div>
    </div>
  );
}

export default PrintViewPage;
