export const PALETTE = ["#7c9cff", "#b18cff", "#ff8fb1", "#ffb86b", "#6be4c9", "#5ec8ff", "#f5e56b", "#ff7a7a"];

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [124, 156, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

export function hslToHex({ h, s, l }: HSL): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Sub-module color: same hue as the root, lower saturation, a bit lighter; fades further per depth. */
export function subColor(rootHex: string, depth: number): string {
  const [r, g, b] = hexToRgb(rootHex);
  const hsl = rgbToHsl(r, g, b);
  const k = Math.pow(0.8, Math.max(0, depth - 1));
  return hslToHex({ h: hsl.h, s: hsl.s * 0.5 * k, l: Math.min(0.78, hsl.l * 0.9 + 0.12) });
}

export function shade(hex: string, dl: number): string {
  const [r, g, b] = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  return hslToHex({ ...hsl, l: Math.max(0, Math.min(1, hsl.l + dl)) });
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function paletteColor(i: number): string {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
}
