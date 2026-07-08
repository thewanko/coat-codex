// components/common/ImportDeepLinkHost.tsx — `?import=`ディープリンクの結線ホスト
// （技術計画v1.3 §6-2・§7 ST-23）
//
// useImportDeepLink（Wave A）を呼び、ImportFromScriptoriumDialog（確認/選択UI）と
// ImportErrorDialog（失敗詳細。既存D-4流用）をレンダーするだけの薄いホスト。
// AppShell（ToastHost配下）に1回だけマウントされる想定（useToastを内部で使うため）。

import type { ReactElement } from "react";
import ImportFromScriptoriumDialog from "./ImportFromScriptoriumDialog";
import ImportErrorDialog from "./ImportErrorDialog";
import { useImportDeepLink } from "../../lib/useImportDeepLink";

function ImportDeepLinkHost(): ReactElement {
  const { state, confirm, dismiss, importError, dismissImportError } =
    useImportDeepLink();

  return (
    <>
      <ImportFromScriptoriumDialog
        state={state}
        onConfirm={confirm}
        onDismiss={dismiss}
      />
      <ImportErrorDialog
        open={importError !== null}
        message={importError?.message ?? ""}
        issues={importError?.issues ?? []}
        onClose={dismissImportError}
      />
    </>
  );
}

export default ImportDeepLinkHost;
