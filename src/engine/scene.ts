import type { Graph } from "@/lib/types";
import { Camera, MAX_ZOOM, MIN_ZOOM } from "./camera";
import { buildIndex, NODE_RADIUS, type GraphIndex } from "./graph";
import { hitTest, screenToWorld, type Hit } from "./hittest";
import { Lens } from "./lens";
import { approach, clamp } from "./math";
import { Renderer, type Focus, type RenderState } from "./renderer";

type FrameListener = () => void;

/**
 * Owns the canvas, camera, lens and render loop. Framework-agnostic: the React layer
 * translates DOM events into calls on this object.
 */
export class Scene {
  readonly camera = new Camera();
  readonly lens = new Lens();
  readonly renderer = new Renderer();
  state: RenderState;

  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private dimTarget = 0;
  private listeners = new Set<FrameListener>();
  private destroyed = false;

  constructor(private canvas: HTMLCanvasElement, fontFamily: string) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D desteklenmiyor");
    this.ctx = ctx;
    this.state = {
      index: buildIndex({ nodes: [], edges: [] }),
      editMode: false,
      selectedNodeId: null,
      selectedEdgeId: null,
      hoverNodeId: null,
      hoverEdgeId: null,
      focus: null,
      dim: 0,
      handleNodeId: null,
      handleHot: false,
      linkDrag: null,
      ghost: null,
      fontFamily,
    };
    this.resize();
  }

  get index(): GraphIndex {
    return this.state.index;
  }

  setGraph(graph: Graph) {
    this.state.index = buildIndex(graph);
    // drop references to things that no longer exist
    const s = this.state;
    if (s.hoverNodeId && !s.index.byId.has(s.hoverNodeId)) this.setHover(null);
    if (s.handleNodeId && !s.index.byId.has(s.handleNodeId)) s.handleNodeId = null;
    if (s.focus && s.hoverNodeId) this.setHover(s.hoverNodeId, true);
    this.invalidate();
  }

  set<K extends keyof RenderState>(key: K, value: RenderState[K]) {
    if (this.state[key] !== value) {
      this.state[key] = value;
      this.invalidate();
    }
  }

  /** Hover a node: highlight its neighborhood and dim the rest. */
  setHover(nodeId: string | null, force = false) {
    const s = this.state;
    if (!force && s.hoverNodeId === nodeId) return;
    s.hoverNodeId = nodeId;
    if (nodeId) {
      const nodes = new Set<string>([nodeId]);
      const edges = new Set<string>();
      for (const e of s.index.edges) {
        if (e.source === nodeId || e.target === nodeId) {
          edges.add(e.id);
          nodes.add(e.source);
          nodes.add(e.target);
        }
      }
      s.focus = { nodes, edges } satisfies Focus;
      this.dimTarget = 1;
    } else {
      this.dimTarget = 0;
    }
    this.invalidate();
  }

  invalidate() {
    this.dirty = true;
  }

  onFrame(fn: FrameListener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.camera.resize(w, h);
    this.invalidate();
    if (this.sized) {
      const queue = this.sizeWaiters;
      this.sizeWaiters = [];
      for (const fn of queue) fn();
    }
  }

  private sizeWaiters: (() => void)[] = [];

  /** The canvas has a real layout size (it can be 0×0 while hidden at mount). */
  get sized() {
    return this.camera.width > 40 && this.camera.height > 40;
  }

  /** Run `fn` now if the canvas is laid out, otherwise on the first real resize. */
  whenSized(fn: () => void) {
    if (this.sized) fn();
    else this.sizeWaiters.push(fn);
  }

  start() {
    const loop = (t: number) => {
      if (this.destroyed) return;
      const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 1 / 60;
      this.last = t;
      let changed = this.camera.update(dt);
      if (this.lens.update(dt)) changed = true;
      const s = this.state;
      if (Math.abs(s.dim - this.dimTarget) > 0.001) {
        s.dim += (this.dimTarget - s.dim) * approach(10, dt);
        changed = true;
      } else if (s.dim !== this.dimTarget) {
        s.dim = this.dimTarget;
        if (s.dim === 0) s.focus = null;
        changed = true;
      }
      if (changed || this.dirty) {
        this.dirty = false;
        this.draw();
        for (const fn of this.listeners) fn();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.listeners.clear();
  }

  private draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.renderer.render(ctx, this.camera, this.lens, this.state);
  }

  // ---- queries ----

  hit(sx: number, sy: number): Hit {
    return hitTest(this.renderer.layout, sx, sy, { edges: this.state.editMode, handle: this.state.editMode });
  }

  screenToWorld(sx: number, sy: number) {
    return screenToWorld(this.camera, this.lens, sx, sy);
  }

  /** World → screen (undistorted: popovers shouldn't wobble with the lens). */
  worldToScreen(wx: number, wy: number) {
    return { x: this.camera.worldToScreenX(wx), y: this.camera.worldToScreenY(wy) };
  }

  // ---- camera helpers ----

  /** Accepts an id, or a node object when the scene may not have received it yet. */
  flyToNode(target: string | { x: number; y: number; kind: "main" | "sub" }, screenOffsetX = 0) {
    const n = typeof target === "string" ? this.index.byId.get(target) : target;
    if (!n) return false;
    const zoom = clamp(Math.max(this.camera.zoom, n.kind === "main" ? 0.85 : 1.0), MIN_ZOOM, 1.1);
    this.camera.flyTo(n.x, n.y, zoom, { screenOffsetX });
    this.invalidate();
    return true;
  }

  zoomToFit(screenOffsetX = 0, rightInset = 0) {
    const nodes = this.index.nodes;
    if (nodes.length === 0) {
      this.camera.flyTo(0, 0, 1);
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      const r = NODE_RADIUS[n.kind] * 2;
      minX = Math.min(minX, n.x - r);
      minY = Math.min(minY, n.y - r);
      maxX = Math.max(maxX, n.x + r);
      maxY = Math.max(maxY, n.y + r);
    }
    const pad = 90;
    const w = Math.max(200, this.camera.width - rightInset - pad * 2);
    const h = Math.max(200, this.camera.height - pad * 2);
    const zoom = clamp(Math.min(w / (maxX - minX), h / (maxY - minY)), MIN_ZOOM, Math.min(MAX_ZOOM, 1.0));
    this.camera.flyTo((minX + maxX) / 2, (minY + maxY) / 2, zoom, { screenOffsetX });
    this.invalidate();
  }
}
