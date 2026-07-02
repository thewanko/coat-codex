import styles from "./Skeleton.module.css";

export type SkeletonVariant = "card" | "photo";

interface SkeletonProps {
  variant: SkeletonVariant;
  "aria-label"?: string;
}

function Skeleton({ variant, "aria-label": ariaLabel }: SkeletonProps) {
  const className =
    variant === "card" ? styles.card : `${styles.photo} ${styles.shimmer}`;

  return (
    <div
      className={className}
      data-variant={variant}
      role="status"
      aria-label={ariaLabel ?? "loading"}
    />
  );
}

export default Skeleton;
