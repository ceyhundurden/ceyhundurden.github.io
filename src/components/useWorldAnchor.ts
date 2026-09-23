"use client";

import { useLayoutEffect, type RefObject } from "react";
import type { CanvasApi } from "./BrainCanvas";

/**
 * Keeps a DOM element pinned to a world coordinate while the camera moves,
 * writing `transform` directly (no React re-render per frame).
 */
export function useWorldAnchor(apiRef: RefObject<CanvasApi | null>, elRef: RefObject<HTMLElement | null>, wx: number, wy: number) {
  useLayoutEffect(() => {
    const api = apiRef.current;
    const el = elRef.current;
    if (!api || !el) return;
    const place = () => {
      const p = api.scene.worldToScreen(wx, wy);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // prefer below-right of the point, flip/clamp to stay on screen
      let x = p.x + 10;
      let y = p.y + 10;
      if (x + w > vw - 12) x = p.x - w - 10;
      if (y + h > vh - 12) y = p.y - h - 10;
      x = Math.max(12, Math.min(vw - w - 12, x));
      y = Math.max(12, Math.min(vh - h - 12, y));
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    };
    place();
    return api.scene.onFrame(place);
  }, [apiRef, elRef, wx, wy]);
}
