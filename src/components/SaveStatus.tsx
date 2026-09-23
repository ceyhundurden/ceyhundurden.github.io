"use client";

import styles from "./SaveStatus.module.css";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

interface Props {
  state: SaveState;
  error: string | null;
  onRetry(): void;
  /** px occupied on the right by the side panel */
  offsetRight: number;
}

export default function SaveStatus({ state, error, onRetry, offsetRight }: Props) {
  if (state === "clean") return null;
  const style = offsetRight ? { right: offsetRight + 16 } : undefined;
  return (
    <div className={`${styles.pill} ${styles[state]}`} style={style} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden />
      {state === "dirty" && <span>Unsaved changes</span>}
      {state === "saving" && <span>Saving…</span>}
      {state === "saved" && <span>Saved · live in ~1 min</span>}
      {state === "error" && (
        <>
          <span className={styles.errorText} title={error ?? undefined}>
            Couldn&apos;t save{error ? `: ${error}` : ""}
          </span>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}
