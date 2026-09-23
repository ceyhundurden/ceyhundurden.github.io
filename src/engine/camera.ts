import { approach, clamp, easeInOutCubic, lerp } from "./math";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

interface Flight {
  from: { x: number; y: number; zoom: number };
  to: { x: number; y: number; zoom: number };
  t: number;
  duration: number;
  dip: number;
}

/**
 * World ↔ screen transform. (x, y) is the world point at the viewport center.
 * Supports inertial panning, smooth wheel zoom toward an anchor and eased fly-to.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  width = 1;
  height = 1;

  private vx = 0; // screen px / s
  private vy = 0;
  private flight: Flight | null = null;
  private zoomTarget: number | null = null;
  private zoomAnchor = { x: 0, y: 0 };

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  worldToScreenX(wx: number) {
    return (wx - this.x) * this.zoom + this.width / 2;
  }
  worldToScreenY(wy: number) {
    return (wy - this.y) * this.zoom + this.height / 2;
  }
  screenToWorld(sx: number, sy: number) {
    return { x: (sx - this.width / 2) / this.zoom + this.x, y: (sy - this.height / 2) / this.zoom + this.y };
  }

  get isMoving() {
    return this.flight !== null || this.zoomTarget !== null || Math.abs(this.vx) + Math.abs(this.vy) > 1;
  }

  /** Pan by a screen-space delta (drag). Cancels flights and inertia. */
  panBy(dsx: number, dsy: number) {
    this.flight = null;
    this.x -= dsx / this.zoom;
    this.y -= dsy / this.zoom;
  }

  setVelocity(vx: number, vy: number) {
    const max = 6000;
    this.vx = clamp(vx, -max, max);
    this.vy = clamp(vy, -max, max);
  }

  stop() {
    this.vx = 0;
    this.vy = 0;
    this.flight = null;
    this.zoomTarget = null;
  }

  /** Immediate zoom by factor keeping the screen point (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** Smooth zoom (wheel): accumulates a target and eases toward it around the anchor. */
  smoothZoomAt(sx: number, sy: number, factor: number) {
    this.flight = null;
    const base = this.zoomTarget ?? this.zoom;
    this.zoomTarget = clamp(base * factor, MIN_ZOOM, MAX_ZOOM);
    this.zoomAnchor = { x: sx, y: sy };
  }

  /**
   * Eased flight. `screenOffsetX` shifts where the target lands on screen
   * (e.g. to keep it centered in the area left of a side panel).
   */
  flyTo(x: number, y: number, zoom = this.zoom, opts: { duration?: number; screenOffsetX?: number } = {}) {
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const tx = x + (opts.screenOffsetX ?? 0) / z;
    const dist = Math.hypot(tx - this.x, y - this.y) * Math.min(this.zoom, z);
    const span = Math.max(this.width, this.height);
    const dip = dist > span ? Math.min(0.55, (dist / span - 1) * 0.2 + 0.15) : 0;
    const duration = opts.duration ?? clamp(650 + Math.sqrt(dist) * 8, 650, 1400);
    this.vx = this.vy = 0;
    this.zoomTarget = null;
    this.flight = { from: { x: this.x, y: this.y, zoom: this.zoom }, to: { x: tx, y, zoom: z }, t: 0, duration: duration / 1000, dip };
  }

  /** Advance animations. Returns true if the camera changed. */
  update(dt: number): boolean {
    let changed = false;
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = easeInOutCubic(f.t);
      this.x = lerp(f.from.x, f.to.x, e);
      this.y = lerp(f.from.y, f.to.y, e);
      const lz = lerp(Math.log(f.from.zoom), Math.log(f.to.zoom), e);
      this.zoom = clamp(Math.exp(lz) * (1 - f.dip * Math.sin(Math.PI * e)), MIN_ZOOM, MAX_ZOOM);
      if (f.t >= 1) this.flight = null;
      changed = true;
    }
    if (this.zoomTarget !== null) {
      const cur = Math.log(this.zoom);
      const tgt = Math.log(this.zoomTarget);
      const next = Math.abs(tgt - cur) < 0.0015 ? tgt : lerp(cur, tgt, approach(16, dt));
      this.zoomAt(this.zoomAnchor.x, this.zoomAnchor.y, Math.exp(next - cur));
      if (next === tgt) this.zoomTarget = null;
      changed = true;
    }
    if (Math.abs(this.vx) + Math.abs(this.vy) > 1) {
      this.x -= (this.vx * dt) / this.zoom;
      this.y -= (this.vy * dt) / this.zoom;
      const decay = Math.exp(-4.2 * dt);
      this.vx *= decay;
      this.vy *= decay;
      if (Math.abs(this.vx) + Math.abs(this.vy) <= 1) this.vx = this.vy = 0;
      changed = true;
    }
    return changed;
  }
}
