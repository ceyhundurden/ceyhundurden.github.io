"use client";

import { useRef, useState, type RefObject } from "react";
import { LIMITS, type BrainEdge } from "@/lib/types";
import type { CanvasApi } from "./BrainCanvas";
import { useWorldAnchor } from "./useWorldAnchor";
import styles from "./Popover.module.css";

interface Props {
  apiRef: RefObject<CanvasApi | null>;
  edge: BrainEdge;
  wx: number;
  wy: number;
  onSave(label: string): void;
  onDelete(): void;
  onClose(): void;
}

export default function EdgePopover({ apiRef, edge, wx, wy, onSave, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(edge.label ?? "");
  useWorldAnchor(apiRef, ref, wx, wy);

  const commit = () => {
    if ((edge.label ?? "") !== label.trim()) onSave(label.trim());
    onClose();
  };

  return (
    <div ref={ref} className={styles.popover} role="dialog" aria-label="Bağlantı">
      <label className={styles.label} htmlFor="edge-label">
        {edge.kind === "child" ? "Hiyerarşi bağı" : "Bağıntı"} · etiket
      </label>
      <input
        id="edge-label"
        className={styles.input}
        autoFocus
        autoComplete="off"
        maxLength={LIMITS.label}
        placeholder="ör. ilham verdi"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") onClose();
        }}
      />
      <div className={styles.row}>
        <button type="button" className={styles.button} onClick={commit}>
          Kaydet
        </button>
        <button type="button" className={styles.danger} onClick={onDelete}>
          Bağlantıyı sil
        </button>
      </div>
    </div>
  );
}
