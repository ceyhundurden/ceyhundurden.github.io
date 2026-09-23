"use client";

import { LIMITS, type BlockType, type ContentBlock } from "@/lib/types";
import { newId } from "@/lib/id";
import { safeHttpUrl, videoEmbedUrl } from "@/lib/url";
import styles from "./NodePanel.module.css";

export const BLOCK_LABELS: Record<BlockType, string> = {
  text: "Anekdot",
  quote: "Alıntı",
  link: "Bağlantı",
  image: "Görsel",
  video: "Video",
  code: "Kod",
};

export function newBlock(type: BlockType): ContentBlock {
  const id = newId();
  switch (type) {
    case "text":
      return { id, type, text: "" };
    case "quote":
      return { id, type, text: "" };
    case "link":
      return { id, type, url: "" };
    case "image":
      return { id, type, url: "" };
    case "video":
      return { id, type, url: "" };
    case "code":
      return { id, type, code: "" };
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Read-only rendering of a block. Only http(s) URLs ever reach href/src. */
export function BlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "text":
      return block.text.trim() ? <p className={styles.text}>{block.text}</p> : null;
    case "quote":
      return block.text.trim() ? (
        <blockquote className={styles.quote}>
          <p>{block.text}</p>
          {block.source && <cite>— {block.source}</cite>}
        </blockquote>
      ) : null;
    case "link": {
      const url = safeHttpUrl(block.url);
      if (!url) return null;
      return (
        <a className={styles.link} href={url} target="_blank" rel="noopener noreferrer">
          <span className={styles.linkTitle}>{block.title || hostOf(url)}</span>
          {block.note && <span className={styles.linkNote}>{block.note}</span>}
          <span className={styles.linkHost}>{hostOf(url)} ↗</span>
        </a>
      );
    }
    case "image": {
      const url = safeHttpUrl(block.url);
      if (!url) return null;
      return (
        <figure className={styles.figure}>
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs */}
          <img src={url} alt={block.caption ?? ""} loading="lazy" referrerPolicy="no-referrer" />
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    }
    case "video": {
      const embed = videoEmbedUrl(block.url);
      const url = safeHttpUrl(block.url);
      if (!embed) {
        return url ? (
          <a className={styles.link} href={url} target="_blank" rel="noopener noreferrer">
            <span className={styles.linkTitle}>{block.caption || "Video"}</span>
            <span className={styles.linkHost}>{hostOf(url)} ↗</span>
          </a>
        ) : null;
      }
      return (
        <figure className={styles.figure}>
          <div className={styles.video}>
            <iframe
              src={embed}
              title={block.caption || "Video"}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    }
    case "code":
      return block.code.trim() ? (
        <div className={styles.codeWrap}>
          {block.lang && <span className={styles.codeLang}>{block.lang}</span>}
          <pre className={styles.code}>
            <code>{block.code}</code>
          </pre>
        </div>
      ) : null;
  }
}

interface EditorProps {
  block: ContentBlock;
  index: number;
  count: number;
  onChange(b: ContentBlock): void;
  onMove(dir: -1 | 1): void;
  onRemove(): void;
}

function UrlHint({ url }: { url: string }) {
  if (!url.trim() || safeHttpUrl(url)) return null;
  return <div className={styles.fieldError}>Geçerli bir http(s) adresi gir — kaydedilmeyecek.</div>;
}

/** Editable form for a single block. */
export function BlockEditor({ block, index, count, onChange, onMove, onRemove }: EditorProps) {
  const field = (placeholder: string, value: string | undefined, max: number, set: (v: string) => void, multiline = false, mono = false) =>
    multiline ? (
      <textarea
        className={`${styles.field} ${mono ? styles.mono : ""}`}
        placeholder={placeholder}
        value={value ?? ""}
        maxLength={max}
        rows={mono ? 5 : 3}
        spellCheck={!mono}
        onChange={(e) => set(e.target.value)}
      />
    ) : (
      <input className={styles.field} placeholder={placeholder} value={value ?? ""} maxLength={max} onChange={(e) => set(e.target.value)} />
    );

  let body: React.ReactNode;
  switch (block.type) {
    case "text":
      body = field("Kısa bir anekdot…", block.text, LIMITS.text, (text) => onChange({ ...block, text }), true);
      break;
    case "quote":
      body = (
        <>
          {field("Alıntı metni", block.text, LIMITS.text, (text) => onChange({ ...block, text }), true)}
          {field("Kaynak (isteğe bağlı)", block.source, LIMITS.quoteSource, (source) => onChange({ ...block, source }))}
        </>
      );
      break;
    case "link":
      body = (
        <>
          {field("https://…", block.url, LIMITS.url, (url) => onChange({ ...block, url }))}
          <UrlHint url={block.url} />
          {field("Başlık (isteğe bağlı)", block.title, LIMITS.shortText, (title) => onChange({ ...block, title }))}
          {field("Not (isteğe bağlı)", block.note, LIMITS.shortText, (note) => onChange({ ...block, note }))}
        </>
      );
      break;
    case "image":
      body = (
        <>
          {field("Görsel adresi (https://…)", block.url, LIMITS.url, (url) => onChange({ ...block, url }))}
          <UrlHint url={block.url} />
          {field("Açıklama (isteğe bağlı)", block.caption, LIMITS.shortText, (caption) => onChange({ ...block, caption }))}
        </>
      );
      break;
    case "video":
      body = (
        <>
          {field("YouTube ya da Vimeo adresi", block.url, LIMITS.url, (url) => onChange({ ...block, url }))}
          <UrlHint url={block.url} />
          {block.url.trim() && safeHttpUrl(block.url) && !videoEmbedUrl(block.url) && (
            <div className={styles.fieldError}>Gömülemiyor; bağlantı olarak gösterilecek.</div>
          )}
          {field("Açıklama (isteğe bağlı)", block.caption, LIMITS.shortText, (caption) => onChange({ ...block, caption }))}
        </>
      );
      break;
    case "code":
      body = (
        <>
          {field("Dil (ör. ts, python)", block.lang, LIMITS.lang, (lang) => onChange({ ...block, lang }))}
          {field("Kod", block.code, LIMITS.code, (code) => onChange({ ...block, code }), true, true)}
        </>
      );
      break;
  }

  return (
    <div className={styles.blockEdit}>
      <div className={styles.blockHead}>
        <span className={styles.blockType}>{BLOCK_LABELS[block.type]}</span>
        <div className={styles.blockActions}>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} title="Yukarı taşı" aria-label="Yukarı taşı">
            ↑
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} title="Aşağı taşı" aria-label="Aşağı taşı">
            ↓
          </button>
          <button type="button" onClick={onRemove} title="Bloğu sil" aria-label="Bloğu sil" className={styles.blockRemove}>
            ×
          </button>
        </div>
      </div>
      {body}
    </div>
  );
}
