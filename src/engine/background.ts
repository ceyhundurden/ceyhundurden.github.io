import type { Camera } from "./camera";
import type { Lens, LensPoint } from "./lens";
import { hash3, smoothstep } from "./math";

export const BG_COLOR = "#05060a";

interface StarLayer {
  /** how much the layer follows camera panning (0 = fixed, 1 = world) */
  parallax: number;
  /** exponent applied to zoom (far layers barely react to zoom) */
  zoomExp: number;
  cell: number;
  perCell: number;
  rMin: number;
  rMax: number;
  aMin: number;
  aMax: number;
}

const LAYERS: StarLayer[] = [
  { parallax: 0.06, zoomExp: 0.12, cell: 120, perCell: 3, rMin: 0.35, rMax: 0.8, aMin: 0.18, aMax: 0.5 },
  { parallax: 0.22, zoomExp: 0.32, cell: 200, perCell: 2, rMin: 0.5, rMax: 1.1, aMin: 0.25, aMax: 0.65 },
  { parallax: 0.5, zoomExp: 0.58, cell: 300, perCell: 2, rMin: 0.7, rMax: 1.6, aMin: 0.35, aMax: 0.85 },
];

const TINTS = ["#ffffff", "#cfdcff", "#a9c1ff", "#ffe6c7", "#d9ccff"];

/** Soft glowing dot sprites, one per tint (drawn with drawImage — much faster than arcs). */
function makeSprite(color: string): HTMLCanvasElement {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.18, color);
  grad.addColorStop(0.35, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export class Background {
  private sprites: HTMLCanvasElement[] | null = null;
  private vignette: { w: number; h: number; grad: CanvasGradient } | null = null;
  private haze: { w: number; h: number; grad: CanvasGradient } | null = null;
  private lp: LensPoint = { x: 0, y: 0, s: 1 };
  private offsets = LAYERS.map(() => ({ x: 0, y: 0 }));
  private prevCam: { x: number; y: number } | null = null;

  private ensureSprites() {
    if (!this.sprites) this.sprites = TINTS.map(makeSprite);
    return this.sprites;
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, lens: Lens) {
    const w = cam.width;
    const h = cam.height;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // distant haze: a very faint nebula glow that thickens as you zoom out ("fog in the distance")
    if (!this.haze || this.haze.w !== w || this.haze.h !== h) {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(40,52,96,0.22)");
      g.addColorStop(0.5, "rgba(22,28,58,0.12)");
      g.addColorStop(1, "rgba(5,6,10,0)");
      this.haze = { w, h, grad: g };
    }
    ctx.globalAlpha = 0.55 + 0.45 * (1 - smoothstep(0.1, 1.2, cam.zoom));
    ctx.fillStyle = this.haze.grad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    this.drawStars(ctx, cam, lens);
    this.drawGrid(ctx, cam, lens);
  }

  private drawStars(ctx: CanvasRenderingContext2D, cam: Camera, lens: Lens) {
    const sprites = this.ensureSprites();
    const w = cam.width;
    const h = cam.height;
    const lp = this.lp;
    const lensOn = lens.active;
    // Layer offsets are integrated from camera motion, so each layer scrolls at a fixed fraction
    // of the foreground's *screen* speed at any zoom, and zooming never makes far layers jump.
    const prev = this.prevCam;
    const dX = prev ? cam.x - prev.x : 0;
    const dY = prev ? cam.y - prev.y : 0;
    this.prevCam = { x: cam.x, y: cam.y };
    for (let li = 0; li < LAYERS.length; li++) {
      const L = LAYERS[li];
      const lz = Math.pow(cam.zoom, L.zoomExp);
      const off = this.offsets[li];
      if (Math.abs(dX) + Math.abs(dY) < 1e9) {
        off.x += (dX * cam.zoom * L.parallax) / lz;
        off.y += (dY * cam.zoom * L.parallax) / lz;
      }
      // keep offsets bounded (the pattern is infinite anyway) to preserve float precision
      if (Math.abs(off.x) > 1e7) off.x = off.x % (L.cell * 1000);
      if (Math.abs(off.y) > 1e7) off.y = off.y % (L.cell * 1000);
      const cx = off.x;
      const cy = off.y;
      const x0 = cx - w / 2 / lz;
      const y0 = cy - h / 2 / lz;
      const x1 = cx + w / 2 / lz;
      const y1 = cy + h / 2 / lz;
      const c0 = Math.floor(x0 / L.cell) - 1;
      const c1 = Math.floor(x1 / L.cell) + 1;
      const r0 = Math.floor(y0 / L.cell) - 1;
      const r1 = Math.floor(y1 / L.cell) + 1;
      const sizeZ = Math.pow(lz, 0.35);
      for (let gx = c0; gx <= c1; gx++) {
        for (let gy = r0; gy <= r1; gy++) {
          for (let i = 0; i < L.perCell; i++) {
            const seed = li * 7919 + i * 104729;
            const p = hash3(gx, gy, seed);
            if (p < 0.12) continue; // some empty slots for irregularity
            const wx = (gx + hash3(gx, gy, seed + 1)) * L.cell;
            const wy = (gy + hash3(gx, gy, seed + 2)) * L.cell;
            let sx = (wx - cx) * lz + w / 2;
            let sy = (wy - cy) * lz + h / 2;
            if (sx < -8 || sy < -8 || sx > w + 8 || sy > h + 8) continue;
            const rr = hash3(gx, gy, seed + 3);
            let r = (L.rMin + (L.rMax - L.rMin) * rr * rr) * sizeZ;
            if (lensOn) {
              lens.apply(sx, sy, lp);
              sx = lp.x;
              sy = lp.y;
              r *= lp.s;
            }
            const a = L.aMin + (L.aMax - L.aMin) * hash3(gx, gy, seed + 4);
            const tint = sprites[Math.floor(hash3(gx, gy, seed + 5) * sprites.length)];
            const size = r * 6;
            ctx.globalAlpha = a;
            ctx.drawImage(tint, sx - size / 2, sy - size / 2, size, size);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Faint world-space dot grid with level-of-detail crossfade so density stays constant at any zoom. */
  private drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, lens: Lens) {
    const base = 80;
    const k = Math.floor(Math.log2(48 / (base * cam.zoom)));
    const spacing = base * Math.pow(2, k + 1); // coarse level, screen spacing in [48, 96)
    const fine = spacing / 2;
    const screenFine = fine * cam.zoom;
    const fineAlpha = smoothstep(24, 44, screenFine);
    this.gridLevel(ctx, cam, lens, spacing, 0.075, null);
    if (fineAlpha > 0.01) this.gridLevel(ctx, cam, lens, fine, 0.075 * fineAlpha, spacing);
  }

  private gridLevel(ctx: CanvasRenderingContext2D, cam: Camera, lens: Lens, spacing: number, alpha: number, skipMultipleOf: number | null) {
    const w = cam.width;
    const h = cam.height;
    const tl = cam.screenToWorld(0, 0);
    const br = cam.screenToWorld(w, h);
    const i0 = Math.floor(tl.x / spacing);
    const i1 = Math.ceil(br.x / spacing);
    const j0 = Math.floor(tl.y / spacing);
    const j1 = Math.ceil(br.y / spacing);
    const lp = this.lp;
    const lensOn = lens.active;
    const ratio = skipMultipleOf ? Math.round(skipMultipleOf / spacing) : 0;
    ctx.fillStyle = `rgba(150,170,220,${alpha})`;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        if (ratio && i % ratio === 0 && j % ratio === 0) continue;
        let sx = (i * spacing - cam.x) * cam.zoom + w / 2;
        let sy = (j * spacing - cam.y) * cam.zoom + h / 2;
        let s = 1.2;
        if (lensOn && lens.affects(sx, sy)) {
          lens.apply(sx, sy, lp);
          sx = lp.x;
          sy = lp.y;
          s *= lp.s;
        }
        ctx.rect(sx - s / 2, sy - s / 2, s, s);
      }
    }
    ctx.fill();
  }

  drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.vignette || this.vignette.w !== w || this.vignette.h !== h) {
      const r = Math.hypot(w, h) / 2;
      const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.62)");
      this.vignette = { w, h, grad: g };
    }
    ctx.fillStyle = this.vignette.grad;
    ctx.fillRect(0, 0, w, h);
  }
}
