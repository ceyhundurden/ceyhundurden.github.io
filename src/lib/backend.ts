import type { Graph } from "./types";
import { normalizeGraph, serializeGraph } from "./graph-ops";

/** Where the single source of truth lives. */
export const GITHUB = {
  owner: "ceyhundurden",
  repo: "ceyhundurden.github.io",
  branch: "main",
  path: "public/brain.json",
} as const;

const API = "https://api.github.com";
const TOKEN_KEY = "brain.gh-token";

// ---------- token storage (every access guarded: storage may be unavailable) ----------

export function getToken(): string | null {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

// ---------- UTF-8 safe base64 (atob/btoa alone would mangle ğüşıöç) ----------

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

// ---------- visitor ----------

/** Read-only public copy served by GitHub Pages (or `public/` in dev). */
export async function loadPublicGraph(): Promise<Graph> {
  let res: Response;
  try {
    res = await fetch(`/brain.json?t=${Date.now()}`, { cache: "no-store" });
  } catch {
    throw new Error("harita yüklenemedi — bağlantını kontrol et");
  }
  if (res.status === 404) return { nodes: [], edges: [] };
  if (!res.ok) throw new Error(`harita yüklenemedi (HTTP ${res.status})`);
  try {
    return normalizeGraph(await res.json());
  } catch {
    throw new Error("brain.json okunamadı");
  }
}

// ---------- admin ----------

export type GitHubErrorKind = "auth" | "permission" | "rate" | "network" | "conflict" | "not_found" | "other";

export class GitHubError extends Error {
  constructor(public readonly kind: GitHubErrorKind, message: string, public readonly status = 0) {
    super(message);
    this.name = "GitHubError";
  }
  /** The token itself is unusable; it should be discarded. */
  get tokenInvalid() {
    return this.kind === "auth" || this.kind === "permission";
  }
}

function errorFor(res: Response): GitHubError {
  const s = res.status;
  if (s === 401) return new GitHubError("auth", "token geçersiz veya süresi dolmuş", s);
  if (s === 429 || (s === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
    return new GitHubError("rate", "GitHub istek sınırı aşıldı; biraz sonra tekrar dene", s);
  }
  if (s === 403) return new GitHubError("permission", "token bu repoya yazma iznine sahip değil", s);
  if (s === 404) return new GitHubError("not_found", "repo ya da dosya bulunamadı (token bu repoya erişemiyor olabilir)", s);
  if (s === 409 || s === 422) return new GitHubError("conflict", "dosya başka bir yerden değişmiş (sha uyuşmazlığı)", s);
  return new GitHubError("other", `GitHub hatası (HTTP ${s})`, s);
}

interface ContentsFile {
  sha: string;
  content?: string;
  encoding?: string;
  size?: number;
}

export class GitHubBackend {
  constructor(private readonly token: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch {
      throw new GitHubError("network", "GitHub'a ulaşılamadı");
    }
    if (!res.ok) throw errorFor(res);
    try {
      return (await res.json()) as T;
    } catch {
      throw new GitHubError("other", "GitHub yanıtı okunamadı", res.status);
    }
  }

  private get repoPath() {
    return `/repos/${GITHUB.owner}/${GITHUB.repo}`;
  }
  private get contentsPath() {
    return `${this.repoPath}/contents/${GITHUB.path.split("/").map(encodeURIComponent).join("/")}`;
  }

  /** Ensures the token can push to the repo. */
  async verify(): Promise<void> {
    let repo: { permissions?: { push?: boolean } };
    try {
      repo = await this.request("GET", this.repoPath);
    } catch (e) {
      if (e instanceof GitHubError && e.kind === "not_found") {
        throw new GitHubError("permission", "token bu repoya erişemiyor — erişim listesine ceyhundurden.github.io'yu ekle", 404);
      }
      throw e;
    }
    if (repo.permissions?.push !== true) throw new GitHubError("permission", "token bu repoya yazma iznine sahip değil", 200);
  }

  private async getFile(): Promise<ContentsFile> {
    return this.request<ContentsFile>("GET", `${this.contentsPath}?ref=${encodeURIComponent(GITHUB.branch)}`);
  }

  /** Fresh copy straight from the repo (the Pages copy may lag ~1 min). */
  async load(): Promise<{ graph: Graph; sha: string }> {
    const file = await this.getFile();
    let b64 = file.encoding === "base64" ? file.content ?? "" : "";
    // files > 1 MB come back without inline content; fetch the blob instead
    if (!b64 && (file.size ?? 0) > 0) {
      const blob = await this.request<{ content: string }>("GET", `${this.repoPath}/git/blobs/${file.sha}`);
      b64 = blob.content;
    }
    const text = b64 ? base64ToUtf8(b64) : "";
    let raw: unknown = {};
    if (text.trim()) {
      try {
        raw = JSON.parse(text);
      } catch {
        throw new GitHubError("other", "repodaki brain.json geçerli JSON değil");
      }
    }
    return { graph: normalizeGraph(raw), sha: file.sha };
  }

  /**
   * Commits the whole graph. Single writer: on a sha conflict the current sha is re-fetched
   * and the write retried once (last write wins). Returns the new blob sha.
   */
  async save(graph: Graph, sha: string | null, message: string): Promise<string> {
    const content = utf8ToBase64(serializeGraph(graph));
    const put = (s: string | null) =>
      this.request<{ content: { sha: string } }>("PUT", this.contentsPath, {
        message,
        content,
        branch: GITHUB.branch,
        ...(s ? { sha: s } : {}),
      });
    try {
      return (await put(sha)).content.sha;
    } catch (e) {
      if (!(e instanceof GitHubError) || e.kind !== "conflict") throw e;
      let fresh: string | null = null;
      try {
        fresh = (await this.getFile()).sha;
      } catch (e2) {
        if (!(e2 instanceof GitHubError) || e2.kind !== "not_found") throw e2;
      }
      return (await put(fresh)).content.sha;
    }
  }
}
