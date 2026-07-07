// routes/FeedPage.tsx — 新着一覧（技術計画v1 §5.1）
//
// マウント時にGET /api/recipesを取得しサムネグリッドで表示する。nextCursor非null時のみ
// 「もっと見る」ボタンで続きを継ぎ足す（URL同期・検索・タグはYAGNI §7 ST-15スコープ外）。

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { fetchFeed, type FeedItem } from "../lib/api";
import styles from "./FeedPage.module.css";

type LoadState = "loading" | "ready" | "error";

function FeedPage() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // load-more中のアンマウント後setStateを防ぐ（初期ロードのcancelledガードと同目的）
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoadState("loading");
      const response = await fetchFeed();
      if (cancelled) return;
      if (response === null) {
        setLoadState("error");
        return;
      }
      setItems(response.items);
      setNextCursor(response.nextCursor);
      setLoadState("ready");
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    const response = await fetchFeed(nextCursor);
    if (!mountedRef.current) return;
    setIsLoadingMore(false);
    if (response === null) {
      setLoadState("error");
      return;
    }
    setItems((current) => [...current, ...response.items]);
    setNextCursor(response.nextCursor);
  }, [nextCursor, isLoadingMore]);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{t("feed.heading")}</h1>

      {loadState === "loading" && (
        <p className={styles.status}>{t("feed.loading")}</p>
      )}

      {loadState === "error" && (
        <p className={styles.status} role="alert">
          {t("feed.error")}
        </p>
      )}

      {loadState === "ready" && items.length === 0 && (
        <p className={styles.status}>{t("feed.empty")}</p>
      )}

      {items.length > 0 && (
        <ul className={styles.grid}>
          {items.map((item) => (
            <li key={item.id} className={styles.cardItem}>
              <Link to={`/r/${item.id}`} className={styles.card}>
                <span className={styles.thumbFrame}>
                  {item.thumbUrl ? (
                    <img
                      className={styles.thumbImg}
                      src={item.thumbUrl}
                      alt=""
                    />
                  ) : (
                    <span
                      className={styles.thumbPlaceholder}
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className={styles.cardBody}>
                  <span className={styles.cardTitle}>{item.title}</span>
                  <span className={styles.cardHandle}>@{item.handle}</span>
                  <span className={styles.cardDate}>
                    {new Date(item.publishedAt).toLocaleDateString(
                      i18n.language,
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <button
          type="button"
          className={styles.loadMore}
          onClick={() => void handleLoadMore()}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? t("feed.loadingMore") : t("feed.loadMore")}
        </button>
      )}
    </div>
  );
}

export default FeedPage;
