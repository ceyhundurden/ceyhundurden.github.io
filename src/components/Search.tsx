"use client";

import { useMemo, useState } from "react";
import type { BrainNode } from "@/lib/types";
import { fuzzyScore } from "@/lib/fuzzy";
import styles from "./Search.module.css";

interface Props {
  nodes: BrainNode[];
  colors: Map<string, string>;
  onPick(id: string): void;
  onClose(): void;
}

export default function Search({ nodes, colors, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    if (!q.trim()) return nodes.slice(0, 8).map((n) => ({ n, s: 0 }));
    return nodes
      .map((n) => ({ n, s: fuzzyScore(q, n.title) }))
      .filter((r): r is { n: BrainNode; s: number } => r.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
  }, [q, nodes]);

  const pick = (i: number) => {
    const r = results[i];
    if (r) onPick(r.n.id);
  };

  return (
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.box} role="dialog" aria-label="Ara">
        <div className={styles.inputRow}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
          </svg>
          <input
            className={styles.input}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Modül ara…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") onClose();
              else if (e.key === "Enter") pick(active);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
            }}
          />
          <span className={styles.kbd}>Esc</span>
        </div>
        {results.length > 0 ? (
          <ul className={styles.list} role="listbox">
            {results.map((r, i) => (
              <li key={r.n.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`${styles.item} ${i === active ? styles.active : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(i)}
                >
                  <span className={styles.dot} style={{ background: colors.get(r.n.id) ?? "#7c9cff" }} />
                  <span className={styles.title}>{r.n.title}</span>
                  <span className={styles.kind}>{r.n.kind === "main" ? "ana" : "alt"}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>{nodes.length === 0 ? "Henüz hiç modül yok." : "Eşleşen modül yok."}</div>
        )}
      </div>
    </div>
  );
}
