import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ToastContext, type ToastApi, type ToastKind } from "./toastContext";
import styles from "./ToastHost.module.css";

interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: string;
}

const AUTO_DISMISS_MS = 3000;

const DOT_CLASS: Record<ToastKind, string> = {
  success: styles.dotSuccess,
  error: styles.dotError,
  info: styles.dotInfo,
};

function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      if (kind !== "error") {
        window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message: string) => push("success", message),
      error: (message: string) => push("error", message),
      info: (message: string) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.viewport} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast}>
            <span
              className={`${styles.dot} ${DOT_CLASS[toast.kind]}`}
              aria-hidden="true"
            />
            <span className={styles.message}>{toast.message}</span>
            {toast.kind === "error" && (
              <button
                type="button"
                className={styles.close}
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastHost;
