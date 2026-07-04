import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SupportedLang } from "../../i18n";
import styles from "./LanguageSwitcher.module.css";

// 自己名称表記は言語切替UIの慣習として翻訳対象外の固定文字列（i18nキー化しない）。
const LANGS: { code: SupportedLang; label: string; nativeName: string }[] = [
  { code: "ja", label: "JA", nativeName: "日本語" },
  { code: "en", label: "EN", nativeName: "English" },
  { code: "fr", label: "FR", nativeName: "Français" },
  { code: "de", label: "DE", nativeName: "Deutsch" },
  { code: "it", label: "IT", nativeName: "Italiano" },
  { code: "es", label: "ES", nativeName: "Español" },
];

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const wasOpenRef = useRef(false);

  const activeIndex = LANGS.findIndex(({ code }) => i18n.language === code);
  const current = LANGS[activeIndex] ?? LANGS[0];

  // 閉状態遷移（確定・Escape・外側クリックいずれも）でトリガーへフォーカス復帰する。
  // アンマウントではなく開閉のstate切替そのもので発火させる（開閉は同一マウント内のため
  // effect cleanup依存にはしない）。activeIndexは毎レンダー導出される値だが、この
  // effectはopenの変化時にのみ意味を持つ操作なのでopenのみを依存にする。
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const target = activeIndexRef.current >= 0 ? activeIndexRef.current : 0;
      optionRefs.current[target]?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        listRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  function selectLang(code: SupportedLang) {
    void i18n.changeLanguage(code);
    setOpen(false);
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const focusedIndex = optionRefs.current.findIndex(
        (el) => el === document.activeElement,
      );
      const baseIndex = focusedIndex >= 0 ? focusedIndex : activeIndex;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (baseIndex + delta + LANGS.length) % LANGS.length;
      optionRefs.current[nextIndex]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const focusedIndex = optionRefs.current.findIndex(
        (el) => el === document.activeElement,
      );
      const target = LANGS[focusedIndex >= 0 ? focusedIndex : activeIndex];
      if (target) {
        selectLang(target.code);
      }
    }
  }

  return (
    <div className={styles.switcher}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
        onClick={() => setOpen((prev) => !prev)}
      >
        {current?.label}
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={listRef}
          className={styles.listbox}
          role="listbox"
          aria-label="Language"
          onKeyDown={handleListKeyDown}
        >
          {LANGS.map(({ code, nativeName }, index) => {
            const selected = i18n.language === code;
            return (
              <button
                key={code}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                className={
                  selected
                    ? `${styles.option} ${styles.optionSelected}`
                    : styles.option
                }
                onClick={() => selectLang(code)}
              >
                {nativeName}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LanguageSwitcher;
