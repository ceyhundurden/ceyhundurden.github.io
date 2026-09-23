"use client";

import Link from "next/link";
import styles from "./Toolbar.module.css";

interface Props {
  admin: boolean;
  editMode: boolean;
  onToggleEdit(): void;
  onZoomToFit(): void;
  onSearch(): void;
  onLogout(): void;
  /** px occupied on the right by the side panel */
  offsetRight: number;
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Toolbar({ admin, editMode, onToggleEdit, onZoomToFit, onSearch, onLogout, offsetRight }: Props) {
  return (
    <div className={styles.bar} role="toolbar" aria-label="Toolbar" style={offsetRight ? { right: offsetRight + 16 } : undefined}>
      <button type="button" className={styles.btn} onClick={onSearch} title="Search ( / )">
        <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
        <span className={styles.kbd}>/</span>
      </button>
      <button type="button" className={styles.btn} onClick={onZoomToFit} title="Show all">
        <Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </button>
      {admin && (
        <button
          type="button"
          className={`${styles.toggle} ${editMode ? styles.on : ""}`}
          onClick={onToggleEdit}
          aria-pressed={editMode}
          title="Edit mode (E)"
        >
          <span className={styles.switch} aria-hidden>
            <span className={styles.knob} />
          </span>
          Edit
        </button>
      )}
      {admin ? (
        <button type="button" className={styles.btn} onClick={onLogout} title="Sign out">
          Sign out
        </button>
      ) : (
        <Link href="/login" className={styles.btn} title="Admin sign-in">
          Sign in
        </Link>
      )}
    </div>
  );
}
