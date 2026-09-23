import { LIMITS, type ContentBlock, type EdgePatch, type NewEdgeInput, type NewNodeInput, type NodePatch } from "./types";
import { safeHttpUrl } from "./url";
import { newId } from "./id";

export class ValidationError extends Error {}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, field: string, max: number, opts: { required?: boolean; allowEmpty?: boolean } = {}): string | undefined {
  if (v === undefined || v === null) {
    if (opts.required) throw new ValidationError(`${field} gerekli`);
    return undefined;
  }
  if (typeof v !== "string") throw new ValidationError(`${field} metin olmalı`);
  const s = v.replace(/\r\n/g, "\n");
  if (s.length > max) throw new ValidationError(`${field} en fazla ${max} karakter olabilir`);
  if (opts.required && !opts.allowEmpty && s.trim() === "") throw new ValidationError(`${field} boş olamaz`);
  return s;
}

function optStr(v: unknown, field: string, max: number): string | undefined {
  const s = str(v, field, max);
  return s && s.trim() !== "" ? s : undefined;
}

function num(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError(`${field} sayı olmalı`);
  if (Math.abs(v) > LIMITS.coord) throw new ValidationError(`${field} aralık dışında`);
  return v;
}

function url(v: unknown, field: string, required: boolean): string | undefined {
  const s = str(v, field, LIMITS.url, { required, allowEmpty: true });
  if (!s || s.trim() === "") {
    if (required) return "";
    return undefined;
  }
  const safe = safeHttpUrl(s);
  if (!safe) throw new ValidationError(`${field} geçerli bir http(s) adresi olmalı`);
  return safe;
}

function color(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new ValidationError("renk #rrggbb biçiminde olmalı");
  return v.toLowerCase();
}

function id(v: unknown, field: string): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) throw new ValidationError(`${field} geçersiz`);
  return v;
}

export function validateId(v: unknown): string {
  return id(v, "id");
}

/** Blocks are allowed to be in-progress (empty text/url) since the editor autosaves. */
function block(v: unknown): ContentBlock {
  if (!isObj(v)) throw new ValidationError("blok geçersiz");
  const bid = typeof v.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v.id) ? v.id : newId();
  switch (v.type) {
    case "text":
      return { id: bid, type: "text", text: str(v.text, "metin", LIMITS.text) ?? "" };
    case "quote":
      return { id: bid, type: "quote", text: str(v.text, "alıntı", LIMITS.text) ?? "", source: optStr(v.source, "kaynak", LIMITS.quoteSource) };
    case "link":
      return {
        id: bid,
        type: "link",
        url: url(v.url, "bağlantı", true) ?? "",
        title: optStr(v.title, "bağlantı başlığı", LIMITS.shortText),
        note: optStr(v.note, "not", LIMITS.shortText),
      };
    case "image":
      return { id: bid, type: "image", url: url(v.url, "görsel adresi", true) ?? "", caption: optStr(v.caption, "açıklama", LIMITS.shortText) };
    case "video":
      return { id: bid, type: "video", url: url(v.url, "video adresi", true) ?? "", caption: optStr(v.caption, "açıklama", LIMITS.shortText) };
    case "code":
      return { id: bid, type: "code", code: str(v.code, "kod", LIMITS.code) ?? "", lang: optStr(v.lang, "dil", LIMITS.lang) };
    default:
      throw new ValidationError("bilinmeyen blok türü");
  }
}

function blocks(v: unknown): ContentBlock[] {
  if (!Array.isArray(v)) throw new ValidationError("bloklar dizi olmalı");
  if (v.length > LIMITS.blocks) throw new ValidationError(`en fazla ${LIMITS.blocks} blok olabilir`);
  const out = v.map(block);
  const seen = new Set<string>();
  for (const b of out) {
    if (seen.has(b.id)) b.id = newId();
    seen.add(b.id);
  }
  return out;
}

export function validateNewNode(body: unknown): NewNodeInput {
  if (!isObj(body)) throw new ValidationError("geçersiz gövde");
  if (body.kind !== "main" && body.kind !== "sub") throw new ValidationError("kind 'main' ya da 'sub' olmalı");
  const title = str(body.title, "başlık", LIMITS.title, { required: true })!.trim();
  const out: NewNodeInput = {
    kind: body.kind,
    title,
    x: num(body.x, "x"),
    y: num(body.y, "y"),
    color: color(body.color),
    blocks: body.blocks === undefined ? [] : blocks(body.blocks),
  };
  if (body.parentId !== undefined) out.parentId = id(body.parentId, "parentId");
  if (out.kind === "sub" && !out.parentId) throw new ValidationError("alt modül için parentId gerekli");
  return out;
}

export function validateNodePatch(body: unknown): NodePatch {
  if (!isObj(body)) throw new ValidationError("geçersiz gövde");
  const p: NodePatch = {};
  if ("title" in body) p.title = str(body.title, "başlık", LIMITS.title, { required: true })!.trim();
  if ("x" in body) p.x = num(body.x, "x");
  if ("y" in body) p.y = num(body.y, "y");
  if ("color" in body) p.color = color(body.color);
  if ("blocks" in body) p.blocks = blocks(body.blocks);
  if (Object.keys(p).length === 0 && !("color" in body)) throw new ValidationError("değişiklik yok");
  return p;
}

export function validateNewEdge(body: unknown): NewEdgeInput {
  if (!isObj(body)) throw new ValidationError("geçersiz gövde");
  if (body.kind !== "child" && body.kind !== "link") throw new ValidationError("kind 'child' ya da 'link' olmalı");
  const source = id(body.source, "source");
  const target = id(body.target, "target");
  if (source === target) throw new ValidationError("bir düğüm kendine bağlanamaz");
  return { source, target, kind: body.kind, label: optStr(body.label, "etiket", LIMITS.label)?.trim() };
}

export function validateEdgePatch(body: unknown): EdgePatch {
  if (!isObj(body)) throw new ValidationError("geçersiz gövde");
  return { label: optStr(body.label, "etiket", LIMITS.label)?.trim() || undefined };
}
