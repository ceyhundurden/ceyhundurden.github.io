"use client";

import { useMemo } from "react";
import { BLOCK_TYPES, LIMITS, type BrainNode, type ContentBlock, type NodePatch } from "@/lib/types";
import type { GraphIndex } from "@/engine/graph";
import { PALETTE } from "@/engine/color";
import { BLOCK_LABELS, BlockEditor, BlockView, newBlock } from "./BlockEditor";
import styles from "./NodePanel.module.css";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface Props {
  node: BrainNode;
  index: GraphIndex;
  editing: boolean;
  saveStatus: SaveStatus;
  width: number;
  onClose(): void;
  onChange(patch: NodePatch): void;
  onDelete(): void;
  onFlyTo(id: string): void;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save",
};

export default function NodePanel({ node, index, editing, saveStatus, width, onClose, onChange, onDelete, onFlyTo }: Props) {
  const color = index.color.get(node.id) ?? "#7c9cff";

  const connections = useMemo(() => {
    const out: { id: string; title: string; relation: string; label?: string; color: string }[] = [];
    for (const e of index.edges) {
      if (e.source !== node.id && e.target !== node.id) continue;
      const otherId = e.source === node.id ? e.target : e.source;
      const other = index.byId.get(otherId);
      if (!other) continue;
      const relation = e.kind === "child" ? (e.source === node.id ? "sub-module" : "parent module") : "link";
      out.push({ id: otherId, title: other.title, relation, label: e.label, color: index.color.get(otherId) ?? "#7c9cff" });
    }
    const rank = (r: string) => (r === "parent module" ? 0 : r === "sub-module" ? 1 : 2);
    return out.sort((a, b) => rank(a.relation) - rank(b.relation) || a.title.localeCompare(b.title, "tr"));
  }, [index, node.id]);

  const setBlocks = (blocks: ContentBlock[]) => onChange({ blocks });
  const updateBlock = (i: number, b: ContentBlock) => setBlocks(node.blocks.map((x, j) => (j === i ? b : x)));
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= node.blocks.length) return;
    const next = node.blocks.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };
  const removeBlock = (i: number) => setBlocks(node.blocks.filter((_, j) => j !== i));

  const hasContent = node.blocks.some((b) =>
    b.type === "text" || b.type === "quote" ? b.text.trim() : b.type === "code" ? b.code.trim() : b.url.trim(),
  );

  return (
    <aside className={styles.panel} style={{ width }} aria-label="Module panel">
      <div className={styles.accent} style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <header className={styles.header}>
        <div className={styles.meta}>
          <span className={styles.dot} style={{ background: color, color }} />
          <span>{node.kind === "main" ? "Main module" : "Sub-module"}</span>
          {editing && saveStatus !== "idle" && (
            <span className={`${styles.status} ${saveStatus === "error" ? styles.statusError : ""}`}>{STATUS_TEXT[saveStatus]}</span>
          )}
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close panel" title="Close (Esc)">
          ×
        </button>
      </header>

      <div className={styles.scroll}>
        {editing ? (
          <input
            className={styles.titleInput}
            value={node.title}
            maxLength={LIMITS.title}
            placeholder="Title"
            onChange={(e) => onChange({ title: e.target.value })}
            aria-label="Title"
          />
        ) : (
          <h1 className={styles.title}>{node.title}</h1>
        )}

        {editing && node.kind === "main" && (
          <div className={styles.colors} role="radiogroup" aria-label="Color">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                className={`${styles.swatch} ${color === c ? styles.swatchOn : ""}`}
                style={{ background: c }}
                onClick={() => onChange({ color: c })}
                title={c}
              />
            ))}
            <label className={styles.customColor} title="Custom color">
              <input type="color" value={color} onChange={(e) => onChange({ color: e.target.value })} />
              <span>custom</span>
            </label>
          </div>
        )}

        <section className={styles.blocks}>
          {editing ? (
            <>
              {node.blocks.map((b, i) => (
                <BlockEditor
                  key={b.id}
                  block={b}
                  index={i}
                  count={node.blocks.length}
                  onChange={(nb) => updateBlock(i, nb)}
                  onMove={(d) => moveBlock(i, d)}
                  onRemove={() => removeBlock(i)}
                />
              ))}
              {node.blocks.length < LIMITS.blocks && (
                <div className={styles.addRow}>
                  <span className={styles.addLabel}>Add block</span>
                  <div className={styles.addButtons}>
                    {BLOCK_TYPES.map((t) => (
                      <button key={t} type="button" className={styles.addBtn} onClick={() => setBlocks([...node.blocks, newBlock(t)])}>
                        + {BLOCK_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : hasContent ? (
            node.blocks.map((b) => <BlockView key={b.id} block={b} />)
          ) : (
            <p className={styles.emptyNote}>This module has no notes yet.</p>
          )}
        </section>

        {connections.length > 0 && (
          <section className={styles.connections}>
            <h2 className={styles.sectionTitle}>Connected modules</h2>
            <ul>
              {connections.map((c) => (
                <li key={c.id + c.relation}>
                  <button type="button" className={styles.conn} onClick={() => onFlyTo(c.id)}>
                    <span className={styles.connDot} style={{ background: c.color }} />
                    <span className={styles.connTitle}>{c.title}</span>
                    <span className={styles.connRel}>{c.label ? `${c.relation} · ${c.label}` : c.relation}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {editing && (
          <section className={styles.dangerZone}>
            <button type="button" className={styles.deleteBtn} onClick={onDelete}>
              Delete module
            </button>
            <p className={styles.help}>
              Tip: drag the <b>+</b> handle on a node&apos;s edge onto empty space to create a sub-module, or onto another node to create a
              link.
            </p>
          </section>
        )}
      </div>
    </aside>
  );
}
