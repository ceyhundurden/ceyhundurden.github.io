/**
 * Pure, immutable graph operations. Same semantics the old server-side store had;
 * every function returns a new Graph and never mutates its input.
 */
import { newId } from "./id";
import { safeHttpUrl } from "./url";
import type { BrainEdge, BrainNode, ContentBlock, Graph, NodePatch } from "./types";
import { ValidationError, validateEdgePatch, validateId, validateNewEdge, validateNewNode, validateNodePatch } from "./validate";

export { ValidationError };

export class GraphOpError extends Error {
  constructor(public readonly code: "not_found" | "conflict", message: string) {
    super(message);
    this.name = "GraphOpError";
  }
}
export class NotFoundError extends GraphOpError {
  constructor(message: string) {
    super("not_found", message);
    this.name = "NotFoundError";
  }
}
export class ConflictError extends GraphOpError {
  constructor(message: string) {
    super("conflict", message);
    this.name = "ConflictError";
  }
}

export const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };

/** Coerces parsed JSON into a Graph (missing/invalid arrays become empty). */
export function normalizeGraph(raw: unknown): Graph {
  const g = (raw && typeof raw === "object" ? raw : {}) as Partial<Graph>;
  const isObj = (v: unknown) => typeof v === "object" && v !== null;
  return {
    nodes: Array.isArray(g.nodes) ? g.nodes.filter(isObj).map((n) => ({ ...n, blocks: Array.isArray(n.blocks) ? n.blocks : [] })) : [],
    edges: Array.isArray(g.edges) ? g.edges.filter(isObj) : [],
  };
}

export function createNode(g: Graph, input: unknown): { graph: Graph; node: BrainNode; edge?: BrainEdge } {
  const v = validateNewNode(input);
  let parent: BrainNode | undefined;
  if (v.parentId) {
    parent = g.nodes.find((n) => n.id === v.parentId);
    if (!parent) throw new NotFoundError("üst düğüm bulunamadı");
  }
  const now = new Date().toISOString();
  const node: BrainNode = {
    id: newId(),
    kind: v.kind,
    title: v.title,
    x: v.x,
    y: v.y,
    ...(v.kind === "main" && v.color ? { color: v.color } : {}),
    blocks: v.blocks ?? [],
    createdAt: now,
    updatedAt: now,
  };
  const edge: BrainEdge | undefined = parent ? { id: newId(), source: parent.id, target: node.id, kind: "child" } : undefined;
  return { graph: { nodes: [...g.nodes, node], edges: edge ? [...g.edges, edge] : g.edges }, node, edge };
}

function applyPatch(node: BrainNode, patch: NodePatch): BrainNode {
  const next: BrainNode = { ...node };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.x !== undefined) next.x = patch.x;
  if (patch.y !== undefined) next.y = patch.y;
  if ("color" in patch) {
    if (patch.color) next.color = patch.color;
    else delete next.color;
  }
  if (patch.blocks !== undefined) next.blocks = patch.blocks;
  next.updatedAt = new Date().toISOString();
  return next;
}

/** Validated update (title must be non-empty, URLs must be http(s), limits enforced). */
export function updateNode(g: Graph, id: string, patch: unknown): { graph: Graph; node: BrainNode } {
  validateId(id);
  const p = validateNodePatch(patch);
  const cur = g.nodes.find((n) => n.id === id);
  if (!cur) throw new NotFoundError("düğüm bulunamadı");
  const node = applyPatch(cur, p);
  return { graph: { ...g, nodes: g.nodes.map((n) => (n.id === id ? node : n)) }, node };
}

/**
 * In-progress editor state (empty title, half-typed URL…) is kept verbatim in the working
 * copy so controlled inputs behave; `prepareForSave` sanitizes it before anything is committed.
 */
export function applyNodeDraft(g: Graph, id: string, patch: NodePatch): Graph {
  const cur = g.nodes.find((n) => n.id === id);
  if (!cur) throw new NotFoundError("düğüm bulunamadı");
  const node = applyPatch(cur, patch);
  return { ...g, nodes: g.nodes.map((n) => (n.id === id ? node : n)) };
}

/** Deletes the node and every edge touching it. */
export function deleteNode(g: Graph, id: string): { graph: Graph; removedEdgeIds: string[] } {
  if (!g.nodes.some((n) => n.id === id)) throw new NotFoundError("düğüm bulunamadı");
  const removedEdgeIds = g.edges.filter((e) => e.source === id || e.target === id).map((e) => e.id);
  return {
    graph: { nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.source !== id && e.target !== id) },
    removedEdgeIds,
  };
}

export function createEdge(g: Graph, input: unknown): { graph: Graph; edge: BrainEdge } {
  const v = validateNewEdge(input);
  if (!g.nodes.some((n) => n.id === v.source) || !g.nodes.some((n) => n.id === v.target)) {
    throw new NotFoundError("düğüm bulunamadı");
  }
  const dup = g.edges.some((e) => (e.source === v.source && e.target === v.target) || (e.source === v.target && e.target === v.source));
  if (dup) throw new ConflictError("bu iki düğüm zaten bağlı");
  const edge: BrainEdge = { id: newId(), source: v.source, target: v.target, kind: v.kind, ...(v.label ? { label: v.label } : {}) };
  return { graph: { ...g, edges: [...g.edges, edge] }, edge };
}

export function updateEdge(g: Graph, id: string, patch: unknown): { graph: Graph; edge: BrainEdge } {
  const p = validateEdgePatch(patch);
  const cur = g.edges.find((e) => e.id === id);
  if (!cur) throw new NotFoundError("bağlantı bulunamadı");
  const edge: BrainEdge = { ...cur };
  if (p.label) edge.label = p.label;
  else delete edge.label;
  return { graph: { ...g, edges: g.edges.map((e) => (e.id === id ? edge : e)) }, edge };
}

export function deleteEdge(g: Graph, id: string): { graph: Graph } {
  if (!g.edges.some((e) => e.id === id)) throw new NotFoundError("bağlantı bulunamadı");
  return { graph: { ...g, edges: g.edges.filter((e) => e.id !== id) } };
}

/**
 * Produces the graph that actually gets committed: never an empty title (falls back to the
 * last committed one), never a non-http(s) URL, and every node passes `validateNodePatch`.
 */
export function prepareForSave(working: Graph, lastSaved: Graph | null): Graph {
  const prevTitle = new Map((lastSaved?.nodes ?? []).map((n) => [n.id, n.title]));
  const nodes = working.nodes.map((n): BrainNode => {
    const title = n.title.trim() || prevTitle.get(n.id)?.trim() || "Adsız";
    const blocks = n.blocks.map((b): ContentBlock =>
      b.type === "link" || b.type === "image" || b.type === "video" ? { ...b, url: safeHttpUrl(b.url) ?? "" } : b,
    );
    let p: NodePatch;
    try {
      p = validateNodePatch({ title, x: n.x, y: n.y, color: n.color, blocks });
    } catch (e) {
      if (e instanceof ValidationError) throw new ValidationError(`“${title}”: ${e.message}`);
      throw e;
    }
    const out: BrainNode = { ...n, title: p.title!, x: p.x!, y: p.y!, blocks: p.blocks! };
    if (p.color) out.color = p.color;
    else delete out.color;
    return out;
  });
  return { nodes, edges: working.edges.map((e) => ({ ...e })) };
}

export function serializeGraph(g: Graph): string {
  return JSON.stringify(g, null, 2) + "\n";
}
