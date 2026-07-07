// components/part-editor/PartEditorHeader.tsx — PartEditorPageヘッダー（技術計画v2.2 §4.2 T27）
//
// 通常モード: パーツ名の編集入力のみ（パーツ写真ギャラリーはv2.2で廃止 — 工程写真は
// StepCard内のStepPhotoTileへ。デザイン決定稿§8-A）。
// baseモード: 固定見出し「ベース工程（全体）」＋代表写真（overviewPhotoIds[0]）の
// 読み取り専用52pxサムネ＋「全体写真の編集はSetupで ›」（/recipe/:id/setupへのリンク。
// デザイン仕様書§113-116 readonly-thumb）。写真読込中はSkeleton(photo)（D-5）。
//
// パーツ名入力はTitleInput（setup.titleLabel固定）を流用せず、editor名前空間の
// 専用ラベルで薄いuncontrolled風の入力にする（blur確定。TitleInputのD-8既定名補完は
// パーツ名には不要 — partSchemaのname min(1)は空文字を許容しないため、空blur時は
// 直前の値へ戻すのみで足りる）。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { resolvePhotoUrl } from "../../db/photoStore";
import CroppedPhoto from "../common/CroppedPhoto";
import Skeleton from "../common/Skeleton";
import type { CropRect } from "@coat-codex/recipe-core";
import styles from "./PartEditorHeader.module.css";

interface PartEditorHeaderProps {
  isBaseMode: boolean;
  recipeId: string;
  /** 通常モードのみ使用: 編集対象パーツの名前 */
  partName?: string;
  /** 通常モードのみ使用: パーツ名確定時のコールバック */
  onPartNameCommit?: (name: string) => void;
  /** baseモードのみ使用: 代表写真ID（overviewPhotoIds[0]。未設定ならnull） */
  representativePhotoId?: string | null;
  /** baseモードのみ使用: 代表写真のクロップ矩形（未設定はnull） */
  representativePhotoCrop?: CropRect | null;
}

function PartEditorHeader({
  isBaseMode,
  recipeId,
  partName,
  onPartNameCommit,
  representativePhotoId,
  representativePhotoCrop = null,
}: PartEditorHeaderProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(partName ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  useEffect(() => {
    setDraft(partName ?? "");
  }, [partName]);

  useEffect(() => {
    if (!isBaseMode || !representativePhotoId) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    setPhotoLoading(true);
    void resolvePhotoUrl(representativePhotoId)
      .then((resolved) => {
        if (!cancelled) {
          setPhotoUrl(resolved);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPhotoLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isBaseMode, representativePhotoId]);

  function handleBlur() {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === partName) {
      setDraft(partName ?? "");
      return;
    }
    onPartNameCommit?.(trimmed);
  }

  if (isBaseMode) {
    return (
      <div className={styles.root}>
        <h1 className={styles.baseHeading}>{t("editor.baseModeTitle")}</h1>
        <div className={styles.readonlyThumbRow}>
          {photoLoading ? (
            <Skeleton variant="photo" aria-label={t("photo.uploading")} />
          ) : (
            <div className={styles.readonlyThumb}>
              {photoUrl ? (
                <CroppedPhoto
                  className={styles.readonlyThumbImg}
                  src={photoUrl}
                  crop={representativePhotoCrop}
                  alt=""
                />
              ) : (
                <span
                  className={styles.readonlyThumbPlaceholder}
                  aria-hidden="true"
                />
              )}
            </div>
          )}
          <Link to={`/recipe/${recipeId}/setup`} className={styles.setupLink}>
            {t("editor.editOverviewPhotosLink")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <label className={styles.field}>
        <span className={styles.label}>{t("editor.partNameLabel")}</span>
        <input
          type="text"
          className={styles.input}
          value={draft}
          placeholder={t("editor.partNamePlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={handleBlur}
        />
      </label>
    </div>
  );
}

export default PartEditorHeader;
