"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { BrainNode, Graph } from "@/lib/types";
import { Scene } from "@/engine/scene";
import type { Hit } from "@/engine/hittest";
import styles from "./BrainCanvas.module.css";

export interface CanvasApi {
  scene: Scene;
  /** `rightInset`: px covered by the side panel, so the target lands in the visible area. */
  flyToNode(target: string | { x: number; y: number; kind: "main" | "sub" }, rightInset?: number): boolean;
  zoomToFit(rightInset?: number): void;
}

export interface BrainCanvasProps {
  graph: Graph;
  editMode: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  ghost: { wx: number; wy: number; parentId: string | null } | null;
  /** width of the right panel currently covering the canvas (for centering flights) */
  panelWidth: number;
  apiRef: RefObject<CanvasApi | null>;
  onReady?: () => void;
  onSelectNode(id: string | null): void;
  onEdgeClick(id: string, wx: number, wy: number): void;
  onEmptyClick(wx: number, wy: number): void;
  onDropSub(parentId: string, wx: number, wy: number): void;
  onLink(fromId: string, toId: string): void;
  onMoveNode(id: string, x: number, y: number): void;
}

type Gesture =
  | { kind: "pan"; startX: number; startY: number; lastX: number; lastY: number; moved: boolean; hit: Hit; samples: { x: number; y: number; t: number }[] }
  | { kind: "node"; nodeId: string; startX: number; startY: number; dx: number; dy: number; moved: boolean; live: BrainNode | null }
  | { kind: "link"; fromId: string; startX: number; startY: number }
  | { kind: "pinch"; dist: number; midX: number; midY: number };

const CLICK_SLOP = 4;

export default function BrainCanvas(props: BrainCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  // Latest props for use inside long-lived native listeners.
  const p = useRef(props);
  useEffect(() => {
    p.current = props;
  });

  // ---- mount: scene + listeners ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const cssFont = getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim();
    const scene = new Scene(canvas, `${cssFont ? cssFont + ", " : ""}system-ui, sans-serif`);
    sceneRef.current = scene;
    scene.setGraph(p.current.graph);
    scene.start();
    if (process.env.NODE_ENV !== "production") (window as unknown as { __brainScene?: Scene }).__brainScene = scene;
    props.apiRef.current = {
      scene,
      flyToNode: (target, inset = p.current.panelWidth) => scene.flyToNode(target, inset / 2),
      zoomToFit: (inset = p.current.panelWidth) => scene.zoomToFit(inset / 2, inset),
    };
    document.fonts?.ready.then(() => scene.invalidate());

    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(canvas);
    const onDpr = () => scene.resize();
    window.addEventListener("resize", onDpr);

    const pointers = new Map<number, { x: number; y: number; type: string }>();
    let gesture: Gesture | null = null;
    let mouseInside = false;
    let lastMouse = { x: 0, y: 0 };

    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const setCursor = (c: string) => {
      if (canvas.style.cursor !== c) canvas.style.cursor = c;
    };

    const updateHover = (x: number, y: number) => {
      const st = scene.state;
      const hit = scene.hit(x, y);
      const edit = p.current.editMode;
      if (hit.type === "handle") {
        scene.set("handleHot", true);
        scene.setHover(hit.nodeId);
        scene.set("hoverEdgeId", null);
        setCursor("crosshair");
        return;
      }
      scene.set("handleHot", false);
      if (hit.type === "node") {
        scene.setHover(hit.nodeId);
        scene.set("hoverEdgeId", null);
        if (edit) scene.set("handleNodeId", hit.nodeId);
        setCursor(edit ? "grab" : "pointer");
      } else {
        scene.setHover(null);
        scene.set("hoverEdgeId", hit.type === "edge" ? hit.edgeId : null);
        if (edit) scene.set("handleNodeId", st.selectedNodeId);
        setCursor(hit.type === "edge" ? "pointer" : edit ? "cell" : "grab");
      }
    };

    const lensAllowed = () => mouseInside && !gesture;

    // Re-evaluate hover as things move under a still cursor (inertia, flights).
    const offFrame = scene.onFrame(() => {
      if (mouseInside && !gesture && scene.camera.isMoving) updateHover(lastMouse.x, lastMouse.y);
    });

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const { x, y } = local(e);
      pointers.set(e.pointerId, { x, y, type: e.pointerType });
      canvas.setPointerCapture(e.pointerId);
      scene.camera.stop();

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (gesture?.kind === "node" && gesture.live) commitNodeMove(gesture, false);
        scene.set("linkDrag", null);
        gesture = { kind: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
        scene.lens.setEnabled(false);
        return;
      }
      if (pointers.size > 2) return;

      // touch has no hover: compute handle target from the touched node / selection
      if (e.pointerType !== "mouse") updateHover(x, y);
      const hit = scene.hit(x, y);
      const edit = p.current.editMode;
      if (edit && hit.type === "handle") {
        gesture = { kind: "link", fromId: hit.nodeId, startX: x, startY: y };
        scene.set("linkDrag", { fromId: hit.nodeId, sx: x, sy: y, targetId: null });
        scene.lens.setEnabled(false);
        setCursor("crosshair");
        return;
      }
      if (edit && hit.type === "node") {
        const n = scene.index.byId.get(hit.nodeId)!;
        const w = scene.screenToWorld(x, y);
        gesture = { kind: "node", nodeId: n.id, startX: x, startY: y, dx: n.x - w.x, dy: n.y - w.y, moved: false, live: null };
        return;
      }
      gesture = { kind: "pan", startX: x, startY: y, lastX: x, lastY: y, moved: false, hit, samples: [{ x, y, t: performance.now() }] };
    };

    const commitNodeMove = (g: Extract<Gesture, { kind: "node" }>, emit = true) => {
      if (g.live && emit) p.current.onMoveNode(g.nodeId, Math.round(g.live.x), Math.round(g.live.y));
    };

    const onPointerMove = (e: PointerEvent) => {
      const { x, y } = local(e);
      if (e.pointerType === "mouse") {
        lastMouse = { x, y };
        mouseInside = true;
      }
      const ptr = pointers.get(e.pointerId);
      if (ptr) {
        ptr.x = x;
        ptr.y = y;
      }

      if (!gesture) {
        if (e.pointerType === "mouse" || e.pointerType === "pen") {
          scene.lens.setFocus(x, y);
          scene.lens.setEnabled(lensAllowed());
          scene.invalidate();
          updateHover(x, y);
        }
        return;
      }

      switch (gesture.kind) {
        case "pinch": {
          if (pointers.size < 2) return;
          const [a, b] = [...pointers.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          if (gesture.dist > 0) scene.camera.zoomAt(midX, midY, dist / gesture.dist);
          scene.camera.panBy(midX - gesture.midX, midY - gesture.midY);
          gesture.dist = dist;
          gesture.midX = midX;
          gesture.midY = midY;
          scene.invalidate();
          return;
        }
        case "pan": {
          if (!gesture.moved && Math.hypot(x - gesture.startX, y - gesture.startY) > CLICK_SLOP) {
            gesture.moved = true;
            scene.lens.setEnabled(false);
            scene.setHover(null);
            setCursor("grabbing");
          }
          if (gesture.moved) {
            scene.camera.panBy(x - gesture.lastX, y - gesture.lastY);
            scene.invalidate();
          }
          gesture.lastX = x;
          gesture.lastY = y;
          const now = performance.now();
          gesture.samples.push({ x, y, t: now });
          while (gesture.samples.length > 2 && now - gesture.samples[0].t > 100) gesture.samples.shift();
          return;
        }
        case "node": {
          if (!gesture.moved && Math.hypot(x - gesture.startX, y - gesture.startY) > CLICK_SLOP) {
            gesture.moved = true;
            scene.lens.setEnabled(false);
            setCursor("grabbing");
            // swap in a private copy so we never mutate React state
            const idx = scene.index;
            const orig = idx.byId.get(gesture.nodeId);
            if (orig) {
              const copy = { ...orig };
              idx.byId.set(copy.id, copy);
              const i = idx.nodes.indexOf(orig);
              if (i >= 0) {
                idx.nodes = idx.nodes.slice();
                idx.nodes[i] = copy;
              }
              gesture.live = copy;
            }
          }
          if (gesture.moved && gesture.live) {
            // lens is fading out; use the plain camera transform so the node tracks the cursor exactly
            const w = scene.camera.screenToWorld(x, y);
            gesture.live.x = w.x + gesture.dx;
            gesture.live.y = w.y + gesture.dy;
            scene.invalidate();
          }
          return;
        }
        case "link": {
          const hit = scene.hit(x, y);
          const targetId = hit.type === "node" && hit.nodeId !== gesture.fromId ? hit.nodeId : null;
          scene.set("linkDrag", { fromId: gesture.fromId, sx: x, sy: y, targetId });
          return;
        }
      }
    };

    const endGesture = (e: PointerEvent, cancelled: boolean) => {
      const { x, y } = local(e);
      pointers.delete(e.pointerId);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      const g = gesture;
      if (!g) return;
      if (g.kind === "pinch") {
        if (pointers.size < 2) gesture = null;
        return;
      }
      gesture = null;
      const props = p.current;

      if (g.kind === "pan") {
        setCursor(props.editMode ? "cell" : "grab");
        if (cancelled) return;
        if (!g.moved) {
          const hit = g.hit;
          if (hit.type === "node") props.onSelectNode(hit.nodeId);
          else if (hit.type === "edge") {
            const w = scene.screenToWorld(x, y);
            props.onEdgeClick(hit.edgeId, w.x, w.y);
          } else {
            const w = scene.screenToWorld(x, y);
            props.onEmptyClick(w.x, w.y);
          }
        } else {
          const s = g.samples;
          const first = s[0];
          const last = s[s.length - 1];
          const dt = (last.t - first.t) / 1000;
          if (dt > 0.008 && performance.now() - last.t < 60) {
            scene.camera.setVelocity((last.x - first.x) / dt, (last.y - first.y) / dt);
          }
        }
      } else if (g.kind === "node") {
        if (!cancelled) {
          if (!g.moved) props.onSelectNode(g.nodeId);
          else commitNodeMove(g);
        }
        if (cancelled) scene.setGraph(props.graph);
      } else if (g.kind === "link") {
        const ld = scene.state.linkDrag;
        scene.set("linkDrag", null);
        if (!cancelled && ld) {
          if (ld.targetId) props.onLink(g.fromId, ld.targetId);
          else {
            const from = scene.renderer.layout.nodeById.get(g.fromId);
            const far = from ? Math.hypot(x - from.x, y - from.y) > from.r + 18 : true;
            if (far) {
              const w = scene.camera.screenToWorld(x, y);
              props.onDropSub(g.fromId, w.x, w.y);
            }
          }
        }
      }
      if (e.pointerType === "mouse" && mouseInside) {
        scene.lens.setFocus(x, y);
        scene.lens.setEnabled(true);
        updateHover(x, y);
      }
    };

    const onPointerUp = (e: PointerEvent) => endGesture(e, false);
    const onPointerCancel = (e: PointerEvent) => endGesture(e, true);

    const onPointerLeave = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mouseInside = false;
      if (!gesture) {
        scene.lens.setEnabled(false);
        scene.setHover(null);
        scene.set("hoverEdgeId", null);
        scene.set("handleHot", false);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = local(e);
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= 400;
      const k = e.ctrlKey ? 0.012 : 0.0018; // ctrlKey ⇒ trackpad pinch
      const factor = Math.exp(-Math.max(-120, Math.min(120, dy)) * k);
      scene.camera.smoothZoomAt(x, y, factor);
      scene.invalidate();
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      offFrame();
      ro.disconnect();
      window.removeEventListener("resize", onDpr);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      scene.destroy();
      sceneRef.current = null;
      props.apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- sync props → scene ----
  useEffect(() => {
    sceneRef.current?.setGraph(props.graph);
  }, [props.graph]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.set("editMode", props.editMode);
    s.set("handleNodeId", props.editMode ? props.selectedNodeId : null);
    if (canvasRef.current) canvasRef.current.style.cursor = props.editMode ? "cell" : "grab";
  }, [props.editMode, props.selectedNodeId]);

  useEffect(() => {
    sceneRef.current?.set("selectedNodeId", props.selectedNodeId);
  }, [props.selectedNodeId]);

  useEffect(() => {
    sceneRef.current?.set("selectedEdgeId", props.selectedEdgeId);
  }, [props.selectedEdgeId]);

  useEffect(() => {
    sceneRef.current?.set("ghost", props.ghost);
  }, [props.ghost]);

  const { onReady } = props;
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-label="Mind map canvas" />;
}
