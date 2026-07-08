// routes/AdminPage.tsx — /admin 管理UI（技術計画v1 §7 S7/ST-32・§5.2 L273）
//
// Cloudflare Access が edge で認証済みの前提（UI側に認証コードは不要）。
// サーバーAPIは同タスク直前のST-31（server/routes/admin.ts）で実装済み。
// fetchは同一オリジン相対パスで呼ぶ。テスト容易化のためfetchImpl propを注入可能にする
// （既定=グローバルfetch。DeleteRecipeDialogと同じDIイディオム）。

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { publishedRecipeSchema } from "@coat-codex/recipe-core";
import styles from "./AdminPage.module.css";

const STATUS_TABS = ["pending", "flagged", "published", "deleted"] as const;
type AdminStatus = (typeof STATUS_TABS)[number];

interface AdminRecipeListItem {
  id: string;
  status: string;
  handle: string;
  title: string;
  lang: string | null;
  report_count: number;
  created_at: string;
  published_at: string | null;
  deleted_at: string | null;
  cover_key: string | null;
  thumb_key: string | null;
}

interface AdminRecipeDetail {
  id: string;
  status: string;
  handle: string;
  title: string;
  lang: string | null;
  schema_version: number;
  recipe_json: string;
  cover_key: string | null;
  thumb_key: string | null;
  report_count: number;
  created_at: string;
  published_at: string | null;
  deleted_at: string | null;
}

type LoadState = "loading" | "ready" | "error";

const ENUM_SETTINGS: Record<string, readonly string[]> = {
  moderation_mode: ["auto", "approval"],
  circuit_breaker: ["closed", "open"],
  nsfw_screening: ["off", "on"],
};

const NUMERIC_SETTING_KEYS = [
  "report_threshold",
  "daily_post_limit",
  "hourly_global_limit",
] as const;

const SETTING_KEYS = [
  "moderation_mode",
  "circuit_breaker",
  "nsfw_screening",
  ...NUMERIC_SETTING_KEYS,
] as const;

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

interface AdminPageProps {
  /** テスト容易化用のfetch差し替え（既定=グローバルfetch） */
  fetchImpl?: typeof fetch;
}

function AdminPage({ fetchImpl }: AdminPageProps) {
  const { t, i18n } = useTranslation();
  const doFetch = fetchImpl ?? fetch;

  const [tab, setTab] = useState<AdminStatus>("pending");
  const [listState, setListState] = useState<LoadState>("loading");
  const [items, setItems] = useState<AdminRecipeListItem[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<LoadState | "idle">("idle");
  const [detail, setDetail] = useState<AdminRecipeDetail | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const [settingsState, setSettingsState] = useState<LoadState>("loading");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [numericDrafts, setNumericDrafts] = useState<Record<string, string>>(
    {},
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [actionInFlight, setActionInFlight] = useState(false);

  // M1: 一覧fetchの世代ガード。タブ高速切替や操作後refreshで先行fetchの
  // 応答が後着しても、最新のリクエストの結果だけをstateへ反映する。
  const listRequestIdRef = useRef(0);

  const loadList = useCallback(
    async (status: AdminStatus) => {
      const requestId = ++listRequestIdRef.current;
      setListState("loading");
      try {
        const response = await doFetch(`/api/admin/recipes?status=${status}`);
        if (requestId !== listRequestIdRef.current) return;
        if (!response.ok) {
          setListState("error");
          return;
        }
        const body = (await response.json()) as {
          recipes: AdminRecipeListItem[];
        };
        if (requestId !== listRequestIdRef.current) return;
        setItems(body.recipes);
        setListState("ready");
      } catch {
        if (requestId !== listRequestIdRef.current) return;
        setListState("error");
      }
    },
    [doFetch],
  );

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailState("idle");
    void loadList(tab);
  }, [tab, loadList]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let cancelled = false;

    async function loadDetail() {
      setDetailState("loading");
      try {
        const response = await doFetch(`/api/admin/recipes/${selectedId}`);
        if (cancelled) return;
        if (!response.ok) {
          setDetailState("error");
          return;
        }
        const body = (await response.json()) as AdminRecipeDetail;
        setDetail(body);
        setDetailState("ready");
      } catch {
        if (!cancelled) {
          setDetailState("error");
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId, doFetch]);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setSettingsState("loading");
      try {
        const response = await doFetch("/api/admin/settings");
        if (cancelled) return;
        if (!response.ok) {
          setSettingsState("error");
          return;
        }
        const body = (await response.json()) as {
          settings: Record<string, string>;
        };
        setSettings(body.settings);
        const drafts: Record<string, string> = {};
        for (const key of NUMERIC_SETTING_KEYS) {
          if (body.settings[key] !== undefined) {
            drafts[key] = body.settings[key];
          }
        }
        setNumericDrafts(drafts);
        setSettingsState("ready");
      } catch {
        if (!cancelled) {
          setSettingsState("error");
        }
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [doFetch]);

  function selectRow(id: string) {
    setSelectedId((current) => (current === id ? null : id));
    setActionError(null);
  }

  async function runAction(
    id: string,
    action: "approve" | "restore" | "delete",
  ) {
    if (actionInFlight) return;
    setActionInFlight(true);
    setActionError(null);
    try {
      const response = await doFetch(`/api/admin/recipes/${id}/${action}`, {
        method: "POST",
      });
      if (!response.ok) {
        const serverError = await readErrorMessage(response);
        setActionError(
          serverError
            ? `${t("admin.actions.error")}: ${serverError}`
            : t("admin.actions.error"),
        );
        return;
      }
      // L3: 選択中プレビューが削除対象と一致する場合のみクリアする
      // （無関係な行の操作でプレビューが閉じないように）
      if (selectedId === id) {
        setDetail(null);
        setDetailState("idle");
      }
      setSelectedId((current) => (current === id ? null : current));
      await loadList(tab);
    } catch {
      setActionError(t("admin.actions.error"));
    } finally {
      setActionInFlight(false);
    }
  }

  function handleDelete(id: string) {
    if (!window.confirm(t("admin.actions.confirmDelete"))) {
      return;
    }
    void runAction(id, "delete");
  }

  async function commitSetting(key: string, value: string) {
    if (actionInFlight) return;
    setActionInFlight(true);
    setSettingsError(null);
    try {
      const response = await doFetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!response.ok) {
        const serverError = await readErrorMessage(response);
        setSettingsError(
          serverError
            ? `${t("admin.settings.error")}: ${serverError}`
            : t("admin.settings.error"),
        );
        return;
      }
      const body = (await response.json()) as { key: string; value: string };
      setSettings((current) => ({ ...current, [body.key]: body.value }));
      if ((NUMERIC_SETTING_KEYS as readonly string[]).includes(body.key)) {
        setNumericDrafts((current) => ({
          ...current,
          [body.key]: body.value,
        }));
      }
    } catch {
      setSettingsError(t("admin.settings.error"));
    } finally {
      setActionInFlight(false);
    }
  }

  function handleEnumChange(key: string, value: string) {
    void commitSetting(key, value);
  }

  function commitNumericDraft(key: string) {
    const draft = numericDrafts[key];
    if (draft === undefined || draft === settings[key]) {
      return;
    }
    // L2: 空欄または数字以外はPUTせず現在値へ復帰させる（サーバー400回避）
    if (draft === "" || !/^\d+$/.test(draft)) {
      setNumericDrafts((current) => ({
        ...current,
        [key]: settings[key] ?? "",
      }));
      return;
    }
    void commitSetting(key, draft);
  }

  function renderThumb(item: AdminRecipeListItem) {
    return item.thumb_key ? (
      <img className={styles.thumbImg} src={`/img/${item.thumb_key}`} alt="" />
    ) : (
      <span className={styles.thumbPlaceholder} aria-hidden="true" />
    );
  }

  function renderActions(item: AdminRecipeListItem) {
    switch (item.status) {
      case "pending":
        return (
          <>
            <button
              type="button"
              className={styles.actionButton}
              disabled={actionInFlight}
              onClick={() => void runAction(item.id, "approve")}
            >
              {t("admin.actions.approve")}
            </button>
            <button
              type="button"
              className={styles.actionButtonDanger}
              disabled={actionInFlight}
              onClick={() => handleDelete(item.id)}
            >
              {t("admin.actions.delete")}
            </button>
          </>
        );
      case "flagged":
        return (
          <>
            <button
              type="button"
              className={styles.actionButton}
              disabled={actionInFlight}
              onClick={() => void runAction(item.id, "restore")}
            >
              {t("admin.actions.restore")}
            </button>
            <button
              type="button"
              className={styles.actionButtonDanger}
              disabled={actionInFlight}
              onClick={() => handleDelete(item.id)}
            >
              {t("admin.actions.delete")}
            </button>
          </>
        );
      case "published":
        return (
          <button
            type="button"
            className={styles.actionButtonDanger}
            disabled={actionInFlight}
            onClick={() => handleDelete(item.id)}
          >
            {t("admin.actions.delete")}
          </button>
        );
      default:
        return null;
    }
  }

  function renderPreview() {
    if (!selectedId) {
      return null;
    }
    return (
      <div className={styles.preview}>
        {detailState === "loading" && (
          <p className={styles.status}>{t("admin.preview.loading")}</p>
        )}
        {detailState === "error" && (
          <p className={styles.status} role="alert">
            {t("admin.preview.error")}
          </p>
        )}
        {detailState === "ready" && detail && (
          <>
            {detail.cover_key && (
              <img
                className={styles.previewCover}
                src={`/img/${detail.cover_key}`}
                alt=""
              />
            )}
            <h2 className={styles.previewTitle}>{detail.title}</h2>
            <p className={styles.previewMeta}>
              @{detail.handle} · {detail.lang ?? "?"} · {detail.status}
            </p>
            <p className={styles.previewMeta}>
              {t("admin.preview.created")}: {detail.created_at}
              {detail.published_at
                ? ` · ${t("admin.preview.published")}: ${detail.published_at}`
                : ""}
            </p>

            {detail.status === "published" && (
              <Link
                className={styles.previewLink}
                to={`/r/${detail.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("admin.preview.viewPublic")}
              </Link>
            )}

            {detail.status === "flagged" && (
              <p className={styles.previewNote}>
                {t("admin.actions.restoreNote")}
              </p>
            )}

            {(() => {
              let parsed: unknown;
              try {
                parsed = JSON.parse(detail.recipe_json);
              } catch {
                return (
                  <p className={styles.status} role="alert">
                    {t("admin.preview.parseError")}
                  </p>
                );
              }
              const result = publishedRecipeSchema.safeParse(parsed);
              if (!result.success) {
                return (
                  <p className={styles.status} role="alert">
                    {t("admin.preview.parseError")}
                  </p>
                );
              }
              const doc = result.data;
              const stepsTotal =
                doc.baseSteps.length +
                doc.parts.reduce((sum, part) => sum + part.steps.length, 0);
              return (
                <>
                  <p className={styles.previewMeta}>
                    {t("admin.preview.paletteCount", {
                      count: doc.palette.length,
                    })}
                    {" · "}
                    {t("admin.preview.stepsCount", { count: stepsTotal })}
                  </p>
                  <details className={styles.rawJsonDetails}>
                    <summary>{t("admin.preview.rawJson")}</summary>
                    <pre className={styles.rawJsonPre}>
                      {JSON.stringify(doc, null, 2)}
                    </pre>
                  </details>
                </>
              );
            })()}

            <div className={styles.actionRow}>
              {renderActions({
                id: detail.id,
                status: detail.status,
                handle: detail.handle,
                title: detail.title,
                lang: detail.lang,
                report_count: detail.report_count,
                created_at: detail.created_at,
                published_at: detail.published_at,
                deleted_at: detail.deleted_at,
                cover_key: detail.cover_key,
                thumb_key: detail.thumb_key,
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{t("admin.heading")}</h1>

      <div className={styles.tabs} role="tablist">
        {STATUS_TABS.map((statusTab) => (
          <button
            key={statusTab}
            type="button"
            role="tab"
            id={`admin-tab-${statusTab}`}
            aria-controls="admin-tabpanel"
            aria-selected={tab === statusTab}
            className={tab === statusTab ? styles.tabActive : styles.tab}
            onClick={() => setTab(statusTab)}
          >
            {t(`admin.tabs.${statusTab}`)}
          </button>
        ))}
      </div>

      {actionError && (
        <p className={styles.errorNotice} role="alert">
          {actionError}
        </p>
      )}

      <div
        role="tabpanel"
        id="admin-tabpanel"
        aria-labelledby={`admin-tab-${tab}`}
        tabIndex={0}
      >
        {listState === "loading" && (
          <p className={styles.status}>{t("admin.list.loading")}</p>
        )}
        {listState === "error" && (
          <p className={styles.status} role="alert">
            {t("admin.list.error")}
          </p>
        )}
        {listState === "ready" && items.length === 0 && (
          <p className={styles.status}>{t("admin.list.empty")}</p>
        )}

        {listState === "ready" && items.length > 0 && (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id} className={styles.listItem}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => selectRow(item.id)}
                >
                  <span className={styles.thumbFrame}>{renderThumb(item)}</span>
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle}>{item.title}</span>
                    <span className={styles.rowHandle}>@{item.handle}</span>
                    <span className={styles.rowMeta}>
                      {new Date(item.created_at).toLocaleString(i18n.language)}
                      {tab === "flagged" &&
                        ` · ${t("admin.list.reportCount", { count: item.report_count })}`}
                    </span>
                  </span>
                </button>
                <div className={styles.actionRow}>{renderActions(item)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {renderPreview()}

      <section className={styles.settings}>
        <h2 className={styles.settingsHeading}>
          {t("admin.settings.heading")}
        </h2>

        {settingsState === "loading" && (
          <p className={styles.status}>{t("admin.settings.loading")}</p>
        )}
        {settingsState === "error" && (
          <p className={styles.status} role="alert">
            {t("admin.settings.loadError")}
          </p>
        )}

        {settingsError && (
          <p className={styles.errorNotice} role="alert">
            {settingsError}
          </p>
        )}

        {settingsState === "ready" && (
          <div className={styles.settingsGrid}>
            {SETTING_KEYS.map((key) => {
              const enumValues = ENUM_SETTINGS[key];
              if (enumValues) {
                return (
                  <div key={key} className={styles.settingRow}>
                    <label
                      className={styles.settingLabel}
                      htmlFor={`admin-setting-${key}`}
                    >
                      {t(`admin.settings.${key}`)}
                    </label>
                    <select
                      id={`admin-setting-${key}`}
                      className={styles.settingSelect}
                      value={settings[key] ?? enumValues[0]}
                      disabled={actionInFlight}
                      onChange={(event) =>
                        handleEnumChange(key, event.target.value)
                      }
                    >
                      {enumValues.map((value) => (
                        <option key={value} value={value}>
                          {t(`admin.settings.values.${key}.${value}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              return (
                <div key={key} className={styles.settingRow}>
                  <label
                    className={styles.settingLabel}
                    htmlFor={`admin-setting-${key}`}
                  >
                    {t(`admin.settings.${key}`)}
                  </label>
                  <input
                    id={`admin-setting-${key}`}
                    type="number"
                    min={1}
                    max={10000}
                    className={styles.settingInput}
                    value={numericDrafts[key] ?? ""}
                    onChange={(event) =>
                      setNumericDrafts((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    onBlur={() => commitNumericDraft(key)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminPage;
