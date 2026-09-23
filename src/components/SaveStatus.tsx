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
      {state === "dirty" && <span>Kaydedilmemiş değişiklik</span>}
      {state === "saving" && <span>Kaydediliyor…</span>}
      {state === "saved" && <span>Kaydedildi · ~1 dk içinde yayında</span>}
      {state === "error" && (
        <>
          <span className={styles.errorText} title={error ?? undefined}>
            Kaydedilemedi{error ? `: ${error}` : ""}
          </span>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Tekrar dene
          </button>
        </>
      )}
    </div>
  );
}
