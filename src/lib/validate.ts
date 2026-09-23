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
    if (opts.required) throw new ValidationError(`${field} is required`);
    return undefined;
  }
  if (typeof v !== "string") throw new ValidationError(`${field} must be text`);
  const s = v.replace(/\r\n/g, "\n");
  if (s.length > max) throw new ValidationError(`${field} can be at most ${max} characters`);
  if (opts.required && !opts.allowEmpty && s.trim() === "") throw new ValidationError(`${field} cannot be empty`);
  return s;
}

function optStr(v: unknown, field: string, max: number): string | undefined {
  const s = str(v, field, max);
  return s && s.trim() !== "" ? s : undefined;
}

function num(v: unknown, field: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ValidationError(`${field} must be a number`);
  if (Math.abs(v) > LIMITS.coord) throw new ValidationError(`${field} is out of range`);
  return v;
}

function url(v: unknown, field: string, required: boolean): string | undefined {
  const s = str(v, field, LIMITS.url, { required, allowEmpty: true });
  if (!s || s.trim() === "") {
    if (required) return "";
    return undefined;
  }
  const safe = safeHttpUrl(s);
  if (!safe) throw new ValidationError(`${field} must be a valid http(s) URL`);
  return safe;
}

function color(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new ValidationError("color must be in #rrggbb format");
  return v.toLowerCase();
}

function id(v: unknown, field: string): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) throw new ValidationError(`${field} is invalid`);
  return v;
}

export function validateId(v: unknown): string {
  return id(v, "id");
}

/** Blocks are allowed to be in-progress (empty text/url) since the editor autosaves. */
function block(v: unknown): ContentBlock {
  if (!isObj(v)) throw new ValidationError("invalid block");
  const bid = typeof v.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v.id) ? v.id : newId();
  switch (v.type) {
    case "text":
      return { id: bid, type: "text", text: str(v.text, "text", LIMITS.text) ?? "" };
    case "quote":
      return { id: bid, type: "quote", text: str(v.text, "quote", LIMITS.text) ?? "", source: optStr(v.source, "source", LIMITS.quoteSource) };
    case "link":
      return {
        id: bid,
        type: "link",
        url: url(v.url, "link", true) ?? "",
        title: optStr(v.title, "link title", LIMITS.shortText),
        note: optStr(v.note, "note", LIMITS.shortText),
      };
    case "image":
      return { id: bid, type: "image", url: url(v.url, "image URL", true) ?? "", caption: optStr(v.caption, "caption", LIMITS.shortText) };
    case "video":
      return { id: bid, type: "video", url: url(v.url, "video URL", true) ?? "", caption: optStr(v.caption, "caption", LIMITS.shortText) };
    case "code":
      return { id: bid, type: "code", code: str(v.code, "code", LIMITS.code) ?? "", lang: optStr(v.lang, "language", LIMITS.lang) };
    default:
      throw new ValidationError("unknown block type");
  }
}

function blocks(v: unknown): ContentBlock[] {
  if (!Array.isArray(v)) throw new ValidationError("blocks must be an array");
  if (v.length > LIMITS.blocks) throw new ValidationError(`at most ${LIMITS.blocks} blocks are allowed`);
  const out = v.map(block);
  const seen = new Set<string>();
  for (const b of out) {
    if (seen.has(b.id)) b.id = newId();
    seen.add(b.id);
  }
  return out;
}

export function validateNewNode(body: unknown): NewNodeInput {
  if (!isObj(body)) throw new ValidationError("invalid body");
  if (body.kind !== "main" && body.kind !== "sub") throw new ValidationError("kind must be 'main' or 'sub'");
  const title = str(body.title, "title", LIMITS.title, { required: true })!.trim();
  const out: NewNodeInput = {
    kind: body.kind,
    title,
    x: num(body.x, "x"),
    y: num(body.y, "y"),
    color: color(body.color),
    blocks: body.blocks === undefined ? [] : blocks(body.blocks),
  };
  if (body.parentId !== undefined) out.parentId = id(body.parentId, "parentId");
  if (out.kind === "sub" && !out.parentId) throw new ValidationError("a sub-module requires a parentId");
  return out;
}

export function validateNodePatch(body: unknown): NodePatch {
  if (!isObj(body)) throw new ValidationError("invalid body");
  const p: NodePatch = {};
  if ("title" in body) p.title = str(body.title, "title", LIMITS.title, { required: true })!.trim();
  if ("x" in body) p.x = num(body.x, "x");
  if ("y" in body) p.y = num(body.y, "y");
  if ("color" in body) p.color = color(body.color);
  if ("blocks" in body) p.blocks = blocks(body.blocks);
  if (Object.keys(p).length === 0 && !("color" in body)) throw new ValidationError("no changes");
  return p;
}

export function validateNewEdge(body: unknown): NewEdgeInput {
  if (!isObj(body)) throw new ValidationError("invalid body");
  if (body.kind !== "child" && body.kind !== "link") throw new ValidationError("kind must be 'child' or 'link'");
  const source = id(body.source, "source");
  const target = id(body.target, "target");
  if (source === target) throw new ValidationError("a node cannot link to itself");
  return { source, target, kind: body.kind, label: optStr(body.label, "label", LIMITS.label)?.trim() };
}

export function validateEdgePatch(body: unknown): EdgePatch {
  if (!isObj(body)) throw new ValidationError("invalid body");
  return { label: optStr(body.label, "label", LIMITS.label)?.trim() || undefined };
}
