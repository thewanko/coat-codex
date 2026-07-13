import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export type EmptyStateVariant = "home" | "parts" | "steps" | "tools";

interface EmptyStateProps {
  variant: EmptyStateVariant;
  heading: string;
  description: string;
  children?: ReactNode;
}

function EmptyState({
  variant,
  heading,
  description,
  children,
}: EmptyStateProps) {
  const iconClass =
    variant === "home"
      ? `${styles.icon} ${styles.iconHome}`
      : `${styles.icon} ${styles.iconPlain}`;

  return (
    <div className={styles.root} data-variant={variant}>
      <span className={iconClass} aria-hidden="true">
        +
      </span>
      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.description}>{description}</p>
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  );
}

export default EmptyState;
