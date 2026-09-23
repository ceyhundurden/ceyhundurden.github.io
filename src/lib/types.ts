export type NodeKind = "main" | "sub";

export type ContentBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "quote"; text: string; source?: string }
  | { id: string; type: "link"; url: string; title?: string; note?: string }
  | { id: string; type: "image"; url: string; caption?: string }
  | { id: string; type: "video"; url: string; caption?: string }
  | { id: string; type: "code"; code: string; lang?: string };

export type BlockType = ContentBlock["type"];

export interface BrainNode {
  id: string;
  kind: NodeKind;
  title: string;
  x: number;
  y: number;
  color?: string;
  blocks: ContentBlock[];
  createdAt: string;
  updatedAt: string;
}

export type EdgeKind = "child" | "link";

export interface BrainEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
}

export interface Graph {
  nodes: BrainNode[];
  edges: BrainEdge[];
}

/** Input for creating a node (server assigns id/timestamps). */
export interface NewNodeInput {
  kind: NodeKind;
  title: string;
  x: number;
  y: number;
  color?: string;
  blocks?: ContentBlock[];
  /** When set, a `child` edge from parentId → new node is created atomically. */
  parentId?: string;
}

export type NodePatch = Partial<Pick<BrainNode, "title" | "x" | "y" | "color" | "blocks">>;

export interface NewEdgeInput {
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
}

export type EdgePatch = { label?: string };

export const LIMITS = {
  title: 80,
  text: 2000,
  quoteSource: 200,
  url: 2048,
  shortText: 300,
  code: 8000,
  lang: 32,
  label: 60,
  blocks: 50,
  coord: 1e7,
} as const;

export const BLOCK_TYPES: BlockType[] = ["text", "quote", "link", "image", "video", "code"];
