/** Returns a normalized http(s) URL string, or null if unsafe/invalid. */
export function safeHttpUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Parses a YouTube/Vimeo URL into a privacy-friendly embed URL, or null. */
export function videoEmbedUrl(raw: string): string | null {
  const safe = safeHttpUrl(raw);
  if (!safe) return null;
  const u = new URL(safe);
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const idOk = (s: string | null | undefined) => !!s && /^[A-Za-z0-9_-]{6,20}$/.test(s);

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return idOk(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    let id: string | null = null;
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
    return idOk(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(?:^|\/)(\d{4,12})(?:\/|$)/);
    return m ? `https://player.vimeo.com/video/${m[1]}` : null;
  }
  return null;
}
