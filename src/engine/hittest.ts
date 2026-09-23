import type { Camera } from "./camera";
import type { Lens } from "./lens";
import { distToSegmentSq } from "./math";
import type { FrameLayout } from "./renderer";

export type Hit =
  | { type: "handle"; nodeId: string }
  | { type: "node"; nodeId: string }
  | { type: "edge"; edgeId: string }
  | { type: "empty" };

/**
 * Hit-test in screen space against exactly what was drawn last frame (positions and
 * radii already include the lens), so what you see is what you click.
 */
export function hitTest(layout: FrameLayout, sx: number, sy: number, opts: { edges: boolean; handle: boolean }): Hit {
  if (opts.handle && layout.handle) {
    const h = layout.handle;
    const dx = sx - h.x;
    const dy = sy - h.y;
    const hr = Math.max(h.r + 5.5, 12); // keep the small handle easy to grab
    if (dx * dx + dy * dy <= hr * hr) return { type: "handle", nodeId: h.nodeId };
  }
  // topmost first: iterate in reverse draw order, preferring the closest center on overlap
  let best: string | null = null;
  let bestD = Infinity;
  for (let i = layout.nodes.length - 1; i >= 0; i--) {
    const n = layout.nodes[i];
    const dx = sx - n.x;
    const dy = sy - n.y;
    const d2 = dx * dx + dy * dy;
    const rr = Math.max(n.r, 7) + 2;
    if (d2 <= rr * rr && d2 < bestD) {
      best = n.id;
      bestD = d2;
    }
  }
  if (best) return { type: "node", nodeId: best };
  if (opts.edges) {
    const tol2 = 6 * 6;
    let bestEdge: string | null = null;
    let bestE = tol2;
    for (const e of layout.edges) {
      const p = e.pts;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const d2 = distToSegmentSq(sx, sy, p[i], p[i + 1], p[i + 2], p[i + 3]);
        if (d2 < bestE) {
          bestE = d2;
          bestEdge = e.id;
        }
      }
    }
    if (bestEdge) return { type: "edge", edgeId: bestEdge };
  }
  return { type: "empty" };
}

/** Screen → world, undoing the lens first. */
export function screenToWorld(cam: Camera, lens: Lens, sx: number, sy: number) {
  const p = lens.invert(sx, sy);
  return cam.screenToWorld(p.x, p.y);
}
