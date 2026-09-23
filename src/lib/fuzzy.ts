/** Lowercase (Turkish-aware) and strip diacritics so "şeker" matches "seker", "İz" matches "iz". */
export function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Fuzzy score of `query` against `text` (higher is better, null = no match).
 * Exact/prefix/word-start/substring matches rank above scattered subsequences.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = normalize(query.trim());
  const t = normalize(text);
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - t.length;
  const wordStart = t.search(new RegExp(`(^|[\\s\\-_./])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  if (wordStart >= 0) return 600 - wordStart - t.length * 0.1;
  const idx = t.indexOf(q);
  if (idx >= 0) return 400 - idx - t.length * 0.1;
  // subsequence with gap penalty
  let score = 200;
  let ti = 0;
  let prev = -1;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    if (prev >= 0) score -= Math.min(20, found - prev - 1) * 2;
    if (found === 0 || /[\s\-_./]/.test(t[found - 1])) score += 6;
    prev = found;
    ti = found + 1;
  }
  return score > 0 ? score - t.length * 0.1 : null;
}
