"use client";

import { useRef, useState, type RefObject } from "react";
import { LIMITS } from "@/lib/types";
import type { CanvasApi } from "./BrainCanvas";
import { useWorldAnchor } from "./useWorldAnchor";
import styles from "./Popover.module.css";

interface Props {
  apiRef: RefObject<CanvasApi | null>;
  wx: number;
  wy: number;
  mode: "main" | "sub";
  parentTitle?: string;
  onSubmit(title: string): void;
  onCancel(): void;
}

export default function CreatePopover({ apiRef, wx, wy, mode, parentTitle, onSubmit, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("");
  useWorldAnchor(apiRef, ref, wx, wy);

  return (
    <div ref={ref} className={styles.popover} role="dialog" aria-label={mode === "main" ? "New main module" : "New sub-module"}>
      <label className={styles.label} htmlFor="create-title">
        {mode === "main" ? "New main module" : `Sub-module · ${parentTitle ?? ""}`}
      </label>
      <input
        id="create-title"
        className={styles.input}
        autoFocus
        autoComplete="off"
        maxLength={LIMITS.title}
        placeholder={mode === "main" ? "e.g. Claude Opus 5.5" : "Sub-module name"}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && title.trim()) onSubmit(title.trim());
          else if (e.key === "Escape") onCancel();
        }}
      />
      <div className={styles.hint}>
        <span>
          <span className={styles.kbd}>Enter</span> create
        </span>
        <span>
          <span className={styles.kbd}>Esc</span> cancel
        </span>
      </div>
    </div>
  );
}
