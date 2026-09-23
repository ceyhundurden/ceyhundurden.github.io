import type { BrainEdge, BrainNode } from "@/lib/types";
import { Background } from "./background";
import type { Camera } from "./camera";
import { rgba, shade } from "./color";
import { MIN_SCREEN_RADIUS, NODE_RADIUS, type GraphIndex } from "./graph";
import type { Lens, LensPoint } from "./lens";
import { clamp, smoothstep } from "./math";

export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface EdgeLayout {
  id: string;
  pts: number[]; // x0,y0,x1,y1,…
}

export interface HandleLayout {
  nodeId: string;
  x: number;
  y: number;
  r: number;
}

/** What was drawn last frame, in (distorted) screen space — used for exact hit-testing. */
export interface FrameLayout {
  nodes: NodeLayout[];
  nodeById: Map<string, NodeLayout>;
  edges: EdgeLayout[];
  handle: HandleLayout | null;
}

export interface Focus {
  nodes: Set<string>;
  edges: Set<string>;
}

export interface RenderState {
  index: GraphIndex;
  editMode: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  hoverNodeId: string | null;
  hoverEdgeId: string | null;
  /** neighborhood being highlighted and how strongly the rest is dimmed (0..1) */
  focus: Focus | null;
  dim: number;
  handleNodeId: string | null;
  handleHot: boolean;
  linkDrag: { fromId: string; sx: number; sy: number; targetId: string | null } | null;
  ghost: { wx: number; wy: number; parentId: string | null } | null;
  fontFamily: string;
}

const HANDLE_ANGLE = -Math.PI / 4;

export class Renderer {
  readonly bg = new Background();
  layout: FrameLayout = { nodes: [], nodeById: new Map(), edges: [], handle: null };
  private lp: LensPoint = { x: 0, y: 0, s: 1 };
  private glowCache = new Map<string, HTMLCanvasElement>();

  private glowSprite(color: string): HTMLCanvasElement {
    let c = this.glowCache.get(color);
    if (!c) {
      const size = 128;
      c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, rgba(color, 0.55));
      grad.addColorStop(0.3, rgba(color, 0.22));
      grad.addColorStop(0.62, rgba(color, 0.06));
      grad.addColorStop(1, rgba(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      if (this.glowCache.size > 256) this.glowCache.clear();
      this.glowCache.set(color, c);
    }
    return c;
  }

  /** Undistorted screen position of a node, then the lens. */
  private project(n: { x: number; y: number }, cam: Camera, lens: Lens): LensPoint {
    const sx = cam.worldToScreenX(n.x);
    const sy = cam.worldToScreenY(n.y);
    return lens.apply(sx, sy, this.lp);
  }

  static baseRadius(n: BrainNode, zoom: number) {
    return Math.max(NODE_RADIUS[n.kind] * zoom, MIN_SCREEN_RADIUS[n.kind]);
  }

  static handlePosition(l: NodeLayout) {
    const d = l.r + 8;
    return { x: l.x + Math.cos(HANDLE_ANGLE) * d, y: l.y + Math.sin(HANDLE_ANGLE) * d, r: 6.5 };
  }

  render(ctx: CanvasRenderingContext2D, cam: Camera, lens: Lens, st: RenderState) {
    const w = cam.width;
    const h = cam.height;
    this.bg.draw(ctx, cam, lens);

    // ---- layout pass (cull + lens) ----
    const nodes: NodeLayout[] = [];
    const nodeById = new Map<string, NodeLayout>();
    const margin = 80;
    for (const n of st.index.nodes) {
      const sx = cam.worldToScreenX(n.x);
      const sy = cam.worldToScreenY(n.y);
      const br = Renderer.baseRadius(n, cam.zoom);
      if (sx < -margin - br * 3 || sy < -margin - br * 3 || sx > w + margin + br * 3 || sy > h + margin + br * 3) continue;
      const p = lens.apply(sx, sy, this.lp);
      const l = { id: n.id, x: p.x, y: p.y, r: br * p.s };
      nodes.push(l);
      nodeById.set(n.id, l);
    }

    // ---- edges ----
    const edgesOut: EdgeLayout[] = [];
    const lineW = clamp(1.1 * Math.sqrt(cam.zoom), 0.6, 1.8);
    for (const e of st.index.edges) {
      const a = st.index.byId.get(e.source)!;
      const b = st.index.byId.get(e.target)!;
      const pts = this.edgePoints(e, a, b, cam, lens);
      if (!pts) continue;
      edgesOut.push({ id: e.id, pts });
      this.drawEdge(ctx, e, pts, st, lineW, cam.zoom);
    }

    // ---- pending ghost (new sub-module being named) ----
    if (st.ghost) this.drawGhost(ctx, cam, lens, st);

    // ---- link-drag preview ----
    if (st.linkDrag) {
      const from = nodeById.get(st.linkDrag.fromId);
      if (from) {
        const to = st.linkDrag.targetId ? nodeById.get(st.linkDrag.targetId) : null;
        ctx.save();
        ctx.strokeStyle = to ? "rgba(170,200,255,0.9)" : "rgba(170,200,255,0.55)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash(to ? [4, 3.5] : [1.5, 4]);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to ? to.x : st.linkDrag.sx, to ? to.y : st.linkDrag.sy);
        ctx.stroke();
        if (!to) {
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(170,200,255,0.25)";
          ctx.strokeStyle = "rgba(170,200,255,0.8)";
          ctx.beginPath();
          ctx.arc(st.linkDrag.sx, st.linkDrag.sy, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ---- nodes: sub first, then main on top; hovered/selected last ----
    const order = nodes.slice().sort((p, q) => this.z(p.id, st) - this.z(q.id, st));
    for (const l of order) this.drawNodeBody(ctx, st.index.byId.get(l.id)!, l, st);
    for (const l of order) this.drawLabel(ctx, st.index.byId.get(l.id)!, l, st, cam.zoom);

    // ---- + handle ----
    let handle: HandleLayout | null = null;
    if (st.editMode && st.handleNodeId && !st.linkDrag) {
      const l = nodeById.get(st.handleNodeId);
      if (l) {
        const hp = Renderer.handlePosition(l);
        handle = { nodeId: l.id, ...hp };
        this.drawHandle(ctx, hp.x, hp.y, hp.r, st.index.color.get(l.id) ?? "#7c9cff", st.handleHot);
      }
    }

    this.bg.drawVignette(ctx, w, h);
    if (lens.active) this.drawLensRing(ctx, lens);

    this.layout = { nodes, nodeById, edges: edgesOut, handle };
  }

  private z(id: string, st: RenderState) {
    if (id === st.selectedNodeId) return 4;
    if (id === st.hoverNodeId) return 3;
    return st.index.byId.get(id)!.kind === "main" ? 1 : 0;
  }

  private alphaFor(nodeId: string | null, edgeId: string | null, st: RenderState) {
    if (!st.focus || st.dim <= 0) return 1;
    const inFocus = nodeId ? st.focus.nodes.has(nodeId) : edgeId ? st.focus.edges.has(edgeId) : false;
    return inFocus ? 1 : 1 - 0.82 * st.dim;
  }

  private edgePoints(e: BrainEdge, a: BrainNode, b: BrainNode, cam: Camera, lens: Lens): number[] | null {
    const ax = cam.worldToScreenX(a.x);
    const ay = cam.worldToScreenY(a.y);
    const bx = cam.worldToScreenX(b.x);
    const by = cam.worldToScreenY(b.y);
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return null;
    const bend = (e.kind === "child" ? 0.12 : -0.18) * len;
    const mx = (ax + bx) / 2 + (-dy / len) * bend;
    const my = (ay + by) / 2 + (dx / len) * bend;
    // cull by control-polygon bounding box
    const minX = Math.min(ax, bx, mx);
    const maxX = Math.max(ax, bx, mx);
    const minY = Math.min(ay, by, my);
    const maxY = Math.max(ay, by, my);
    if (maxX < -20 || maxY < -20 || minX > cam.width + 20 || minY > cam.height + 20) return null;

    const lensHit =
      lens.active &&
      !(maxX < lens.fx - lens.radius || minX > lens.fx + lens.radius || maxY < lens.fy - lens.radius || minY > lens.fy + lens.radius);
    const segs = lensHit ? clamp(Math.round(len / 6), 16, 96) : clamp(Math.round(len / 18), 8, 40);
    const pts: number[] = new Array((segs + 1) * 2);
    const lp = this.lp;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const it = 1 - t;
      let x = it * it * ax + 2 * it * t * mx + t * t * bx;
      let y = it * it * ay + 2 * it * t * my + t * t * by;
      if (lensHit) {
        lens.apply(x, y, lp);
        x = lp.x;
        y = lp.y;
      }
      pts[i * 2] = x;
      pts[i * 2 + 1] = y;
    }
    return pts;
  }

  private drawEdge(ctx: CanvasRenderingContext2D, e: BrainEdge, pts: number[], st: RenderState, lineW: number, zoom: number) {
    const selected = e.id === st.selectedEdgeId;
    const hot = e.id === st.hoverEdgeId && st.editMode;
    let alpha = this.alphaFor(null, e.id, st);
    const inFocus = st.focus?.edges.has(e.id) && st.dim > 0;
    const srcColor = st.index.color.get(e.source) ?? "#8899cc";
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (e.kind === "child") {
      alpha *= selected || hot ? 0.95 : inFocus ? 0.85 : 0.45;
      ctx.strokeStyle = rgba(shade(srcColor, 0.08), alpha);
      ctx.lineWidth = lineW * (selected || hot ? 1.8 : inFocus ? 1.3 : 1);
    } else {
      alpha *= selected || hot ? 0.95 : inFocus ? 0.8 : 0.4;
      ctx.strokeStyle = `rgba(190,205,240,${alpha})`;
      ctx.lineWidth = lineW * (selected || hot ? 1.6 : 1);
      const dash = clamp(4.5 * Math.sqrt(zoom), 2, 6.5);
      ctx.setLineDash([dash, dash * 0.9]);
    }
    if (selected) {
      ctx.shadowColor = "rgba(160,190,255,0.8)";
      ctx.shadowBlur = 6;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
    ctx.restore();

    if (e.label) {
      const la = smoothstep(0.3, 0.55, zoom) * this.alphaFor(null, e.id, st);
      if (la > 0.02 || selected) {
        const mid = Math.floor(pts.length / 4) * 2;
        const x = pts[mid];
        const y = pts[mid + 1];
        ctx.save();
        ctx.globalAlpha = selected ? 1 : la;
        ctx.font = `500 10px ${st.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const text = truncate(e.label, 40);
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = "rgba(8,10,18,0.85)";
        roundRect(ctx, x - tw / 2 - 6, y - 8, tw + 12, 16, 8);
        ctx.fill();
        ctx.strokeStyle = "rgba(160,180,230,0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#c9d3ee";
        ctx.fillText(text, x, y + 0.5);
        ctx.restore();
      }
    }
  }

  private drawNodeBody(ctx: CanvasRenderingContext2D, n: BrainNode, l: NodeLayout, st: RenderState) {
    const color = st.index.color.get(n.id) ?? "#7c9cff";
    const a = this.alphaFor(n.id, null, st);
    const hovered = n.id === st.hoverNodeId;
    const selected = n.id === st.selectedNodeId;
    const isMain = n.kind === "main";
    const r = l.r;

    // glow
    const glowSize = r * (isMain ? 5.2 : 3.6) * (hovered || selected ? 1.15 : 1);
    ctx.globalAlpha = a * (isMain ? 1 : 0.6) * (hovered || selected ? 1 : 0.85);
    ctx.drawImage(this.glowSprite(color), l.x - glowSize / 2, l.y - glowSize / 2, glowSize, glowSize);

    // body
    ctx.globalAlpha = a;
    const grad = ctx.createRadialGradient(l.x - r * 0.35, l.y - r * 0.4, r * 0.05, l.x, l.y, r);
    grad.addColorStop(0, shade(color, isMain ? 0.22 : 0.16));
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, shade(color, isMain ? -0.22 : -0.16));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(l.x, l.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = isMain ? 1.1 : 0.8;
    ctx.strokeStyle = `rgba(255,255,255,${isMain ? 0.35 : 0.22})`;
    ctx.stroke();

    if (selected || hovered) {
      ctx.beginPath();
      ctx.arc(l.x, l.y, r + (selected ? 3.5 : 2.5), 0, Math.PI * 2);
      ctx.lineWidth = selected ? 1.4 : 1;
      ctx.strokeStyle = selected ? "rgba(235,242,255,0.9)" : rgba(shade(color, 0.25), 0.7);
      ctx.stroke();
    }
    if (st.linkDrag && st.linkDrag.targetId === n.id) {
      ctx.beginPath();
      ctx.arc(l.x, l.y, r + 4.5, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(170,200,255,0.95)";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  private drawLabel(ctx: CanvasRenderingContext2D, n: BrainNode, l: NodeLayout, st: RenderState, zoom: number) {
    const isMain = n.kind === "main";
    const important = n.id === st.hoverNodeId || n.id === st.selectedNodeId || (st.focus?.nodes.has(n.id) && st.dim > 0.5);
    const lensBoost = clamp((l.r / Renderer.baseRadius(n, zoom) - 1) * 1.6, 0, 1); // lens reveals labels
    let vis = isMain ? 1 : Math.max(smoothstep(0.3, 0.5, zoom), lensBoost);
    if (important) vis = 1;
    const a = vis * this.alphaFor(n.id, null, st);
    if (a < 0.02) return;
    const scale = l.r / Renderer.baseRadius(n, zoom);
    const size = isMain ? clamp(11 * Math.sqrt(zoom) * scale, 10, 20) : clamp(9.5 * Math.sqrt(zoom) * scale, 8.5, 15);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `${isMain ? 600 : 500} ${size.toFixed(1)}px ${st.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const text = truncate(n.title, isMain ? 32 : 28);
    const y = l.y + l.r + (isMain ? 5 : 3);
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(5,6,10,0.85)";
    ctx.strokeText(text, l.x, y);
    ctx.fillStyle = isMain ? "#eef2fb" : "#bcc5da";
    ctx.fillText(text, l.x, y);
    ctx.restore();
  }

  private drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, hot: boolean) {
    ctx.save();
    if (hot) {
      ctx.shadowColor = rgba(color, 0.9);
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(x, y, r * (hot ? 1.15 : 1), 0, Math.PI * 2);
    ctx.fillStyle = hot ? rgba(shade(color, -0.25), 0.95) : "rgba(12,14,24,0.92)";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = rgba(shade(color, 0.2), 0.95);
    ctx.stroke();
    ctx.strokeStyle = "#eef2fb";
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    const k = r * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - k, y);
    ctx.lineTo(x + k, y);
    ctx.moveTo(x, y - k);
    ctx.lineTo(x, y + k);
    ctx.stroke();
    ctx.restore();
  }

  private drawGhost(ctx: CanvasRenderingContext2D, cam: Camera, lens: Lens, st: RenderState) {
    const g = st.ghost!;
    const p = this.project({ x: g.wx, y: g.wy }, cam, lens);
    const gx = p.x;
    const gy = p.y;
    const kind = g.parentId ? "sub" : "main";
    const r = Math.max(NODE_RADIUS[kind] * cam.zoom, MIN_SCREEN_RADIUS[kind]) * p.s;
    const color = g.parentId ? st.index.color.get(g.parentId) ?? "#7c9cff" : "#7c9cff";
    ctx.save();
    if (g.parentId) {
      const parent = st.index.byId.get(g.parentId);
      if (parent) {
        const pp = this.project(parent, cam, lens);
        ctx.strokeStyle = rgba(color, 0.55);
        ctx.lineWidth = 1.1;
        ctx.setLineDash([2, 3.5]);
        ctx.beginPath();
        ctx.moveTo(pp.x, pp.y);
        ctx.lineTo(gx, gy);
        ctx.stroke();
      }
    }
    ctx.setLineDash([3, 3]);
    ctx.fillStyle = rgba(color, 0.18);
    ctx.strokeStyle = rgba(color, 0.9);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawLensRing(ctx: CanvasRenderingContext2D, lens: Lens) {
    const a = lens.strength;
    ctx.save();
    const R = lens.radius;
    // faint inner sheen
    const g = ctx.createRadialGradient(lens.fx, lens.fy, R * 0.6, lens.fx, lens.fy, R);
    g.addColorStop(0, "rgba(120,150,255,0)");
    g.addColorStop(1, `rgba(120,150,255,${0.05 * a})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lens.fx, lens.fy, R, 0, Math.PI * 2);
    ctx.fill();
    // outer glow + crisp ring
    ctx.strokeStyle = `rgba(140,170,255,${0.1 * a})`;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = `rgba(185,205,255,${0.36 * a})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
