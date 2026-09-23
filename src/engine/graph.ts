import type { BrainEdge, BrainNode, Graph } from "@/lib/types";
import { paletteColor, subColor } from "./color";
import { hash3 } from "./math";

/** Precomputed lookups the renderer and hit-tester need every frame. */
export interface GraphIndex {
  nodes: BrainNode[];
  edges: BrainEdge[];
  byId: Map<string, BrainNode>;
  neighbors: Map<string, Set<string>>;
  /** parent via `child` edge (target → source) */
  parentOf: Map<string, string>;
  color: Map<string, string>;
  depth: Map<string, number>;
}

export function defaultColorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return paletteColor(Math.floor(hash3(h, 7, 3) * 1000));
}

export function buildIndex(graph: Graph): GraphIndex {
  const byId = new Map<string, BrainNode>();
  for (const n of graph.nodes) byId.set(n.id, n);
  const neighbors = new Map<string, Set<string>>();
  const parentOf = new Map<string, string>();
  const edges: BrainEdge[] = [];
  for (const e of graph.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    edges.push(e);
    if (!neighbors.has(e.source)) neighbors.set(e.source, new Set());
    if (!neighbors.has(e.target)) neighbors.set(e.target, new Set());
    neighbors.get(e.source)!.add(e.target);
    neighbors.get(e.target)!.add(e.source);
    if (e.kind === "child" && !parentOf.has(e.target)) parentOf.set(e.target, e.source);
  }

  const color = new Map<string, string>();
  const depth = new Map<string, number>();
  const rootOf = (id: string): { root: BrainNode; depth: number } => {
    let cur = byId.get(id)!;
    let d = 0;
    const seen = new Set<string>();
    while (cur.kind === "sub" && parentOf.has(cur.id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(parentOf.get(cur.id)!)!;
      d++;
    }
    return { root: cur, depth: d };
  };
  for (const n of graph.nodes) {
    if (n.kind === "main") {
      color.set(n.id, n.color ?? defaultColorFor(n.id));
      depth.set(n.id, 0);
    } else {
      const { root, depth: d } = rootOf(n.id);
      const base = root.color ?? defaultColorFor(root.id);
      color.set(n.id, root.kind === "main" ? subColor(base, Math.max(1, d)) : subColor(base, 1));
      depth.set(n.id, Math.max(1, d));
    }
  }
  return { nodes: graph.nodes, edges, byId, neighbors, parentOf, color, depth };
}

export const NODE_RADIUS = { main: 16, sub: 8 } as const;
export const MIN_SCREEN_RADIUS = { main: 3, sub: 1.5 } as const;
