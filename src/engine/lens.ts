import { approach, clamp } from "./math";

export interface LensPoint {
  x: number;
  y: number;
  /** Size multiplier for things drawn at this point (1 outside the lens). */
  s: number;
}

/**
 * Screen-space Sarkar–Brown fisheye:  g(t) = (d + 1) t / (d t + 1),  t = r / R.
 * Everything inside radius R is pushed outward from the focus; outside is untouched.
 * `strength` fades 0..1 over time so the lens eases in/out.
 */
export class Lens {
  radius = 110;
  distortion = 2;
  fx = -9999;
  fy = -9999;
  strength = 0;
  private target = 0;

  setFocus(x: number, y: number) {
    this.fx = x;
    this.fy = y;
  }

  setEnabled(on: boolean) {
    this.target = on ? 1 : 0;
  }

  get enabled() {
    return this.target > 0;
  }

  /** Effective distortion (eased by strength). */
  get d() {
    const s = this.strength;
    return this.distortion * s * s * (3 - 2 * s);
  }

  get active() {
    return this.strength > 0.002;
  }

  update(dt: number): boolean {
    if (Math.abs(this.target - this.strength) < 0.002) {
      const changed = this.strength !== this.target;
      this.strength = this.target;
      return changed;
    }
    this.strength += (this.target - this.strength) * approach(this.target > this.strength ? 9 : 7, dt);
    return true;
  }

  /** Forward mapping into `out` (avoids allocations in hot loops). */
  apply(sx: number, sy: number, out: LensPoint): LensPoint {
    const d = this.d;
    const dx = sx - this.fx;
    const dy = sy - this.fy;
    const R = this.radius;
    const r2 = dx * dx + dy * dy;
    if (d <= 0.0001 || r2 >= R * R) {
      out.x = sx;
      out.y = sy;
      out.s = 1;
      return out;
    }
    const r = Math.sqrt(r2);
    const t = r / R;
    const k = (d + 1) / (d * t + 1); // g(t)/t
    out.x = this.fx + dx * k;
    out.y = this.fy + dy * k;
    // soften the magnification for sizes so nodes grow but don't balloon
    out.s = Math.pow(k, 0.55);
    return out;
  }

  /** Inverse mapping (analytic):  t = u / (d + 1 - d u). */
  invert(sx: number, sy: number): { x: number; y: number } {
    const d = this.d;
    const dx = sx - this.fx;
    const dy = sy - this.fy;
    const R = this.radius;
    const r2 = dx * dx + dy * dy;
    if (d <= 0.0001 || r2 >= R * R || r2 === 0) return { x: sx, y: sy };
    const u = Math.sqrt(r2) / R;
    const t = clamp(u / (d + 1 - d * u), 0, 1);
    const k = t / u;
    return { x: this.fx + dx * k, y: this.fy + dy * k };
  }

  /** Is (sx, sy) inside the lens (with a margin)? */
  affects(sx: number, sy: number, margin = 0): boolean {
    if (!this.active) return false;
    const R = this.radius + margin;
    const dx = sx - this.fx;
    const dy = sy - this.fy;
    return dx * dx + dy * dy < R * R;
  }
}
