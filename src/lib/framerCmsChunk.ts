/**
 * Framer published CMS collections (`.framercms` chunks).
 * Records are length-prefixed key/value pairs. Unknown tags are skipped until
 * the next known field name so we can join Funding Tracker rows without a
 * full QueryEngine implementation.
 */

export type FramerCmsValue = string | number | string[] | null;
export type FramerCmsRecord = Record<string, FramerCmsValue>;

const MAX_KEY_LEN = 48;

class Cursor {
  constructor(
    readonly buf: Uint8Array,
    public offset = 0,
  ) {}

  get remaining(): number {
    return this.buf.length - this.offset;
  }

  u8(): number {
    if (this.remaining < 1) throw new Error("truncated u8");
    return this.buf[this.offset++];
  }

  u16(): number {
    if (this.remaining < 2) throw new Error("truncated u16");
    const v = (this.buf[this.offset] << 8) | this.buf[this.offset + 1];
    this.offset += 2;
    return v;
  }

  u32(): number {
    if (this.remaining < 4) throw new Error("truncated u32");
    const v =
      ((this.buf[this.offset] * 0x1000000) +
        (this.buf[this.offset + 1] << 16) +
        (this.buf[this.offset + 2] << 8) +
        this.buf[this.offset + 3]) >>>
      0;
    this.offset += 4;
    return v;
  }

  u64(): number {
    if (this.remaining < 8) throw new Error("truncated u64");
    const hi = this.u32();
    const lo = this.u32();
    return hi * 0x1_0000_0000 + lo;
  }

  take(n: number): Uint8Array {
    if (n < 0 || this.remaining < n) throw new Error("truncated bytes");
    const slice = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return slice;
  }

  utf8(n: number): string {
    return new TextDecoder("utf-8", { fatal: false }).decode(this.take(n));
  }

  peekU32(): number | null {
    if (this.remaining < 4) return null;
    return (
      ((this.buf[this.offset] * 0x1000000) +
        (this.buf[this.offset + 1] << 16) +
        (this.buf[this.offset + 2] << 8) +
        this.buf[this.offset + 3]) >>>
      0
    );
  }
}

function parseValue(cur: Cursor): FramerCmsValue {
  const tag = cur.u8();
  if (tag === 0x0c) {
    const n = cur.u32();
    if (n > 1_000_000) throw new Error(`string too long (${n})`);
    return cur.utf8(n);
  }
  if (tag === 0x04) {
    const ms = cur.u64();
    return new Date(ms).toISOString();
  }
  if (tag === 0x07) {
    const n = cur.u32();
    if (n > 1_000_000) throw new Error(`link too long (${n})`);
    const raw = cur.utf8(n);
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
    if (raw.startsWith('S"') && raw.endsWith('"')) return raw.slice(2, -1);
    return raw.replace(/^S?"/, "").replace(/"$/, "");
  }
  if (tag === 0x01) {
    const n = cur.u16();
    if (n > 64) throw new Error(`list too long (${n})`);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const item = parseValue(cur);
      if (typeof item === "string") out.push(item);
      else if (Array.isArray(item)) out.push(...item);
    }
    return out;
  }
  throw new Error(`unsupported tag 0x${tag.toString(16)}`);
}

/** Decode a Framer `.framercms` collection chunk into keyed records. */
export function parseFramerCmsChunk(data: Uint8Array, knownKeys: Iterable<string> = []): FramerCmsRecord[] {
  const known = new Set(["id", "createdAt", "updatedAt", "nextItemId", "previousItemId", ...knownKeys]);
  const cur = new Cursor(data);
  if (cur.remaining < 6) return [];
  cur.u32();
  cur.u16();

  const records: FramerCmsRecord[] = [];
  let current: FramerCmsRecord = {};

  while (cur.remaining >= 5) {
    const n = cur.peekU32();
    let key: string | null = null;
    if (n != null && n >= 1 && n <= MAX_KEY_LEN && cur.remaining >= 4 + n) {
      const candidate = new TextDecoder("utf-8", { fatal: false }).decode(
        data.subarray(cur.offset + 4, cur.offset + 4 + n),
      );
      if (known.has(candidate)) {
        cur.u32();
        key = cur.utf8(n);
      }
    }
    if (!key) {
      cur.offset += 1;
      continue;
    }
    const save = cur.offset;
    try {
      const value = parseValue(cur);
      if (key === "id" && Object.keys(current).length > 0) {
        records.push(current);
        current = {};
      }
      current[key] = value;
    } catch {
      cur.offset = save + 1;
    }
  }
  if (Object.keys(current).length > 0) records.push(current);
  return records;
}

export function listFramerSiteModuleUrls(html: string): string[] {
  const found = html.match(/https:\/\/framerusercontent\.com\/sites\/[^"'>\s]+\.mjs/g) ?? [];
  return [...new Set(found)];
}

export function discoverFramerCmsChunkUrl(moduleJs: string): string | null {
  const m = moduleJs.match(
    /new URL\(`\.\/([^`]+\-chunk-default-0\.framercms)`,`(https:\/\/framerusercontent\.com\/modules\/[^`]+)`\)/,
  );
  if (!m) return null;
  const file = m[1];
  const moduleUrl = m[2];
  try {
    return new URL(`./${file}`, moduleUrl).href.replace("/modules/", "/cms/");
  } catch {
    return null;
  }
}

export function collectionFieldIdsByTitle(moduleJs: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z0-9_]{4,16}):\{[^}]{0,240}title:`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(moduleJs))) {
    out[m[2]] = m[1];
  }
  return out;
}

export function relatedCollectionModuleIds(moduleJs: string): string[] {
  const ids = moduleJs.match(/local-module:collection\/([A-Za-z0-9_]+):/g) ?? [];
  return [...new Set(ids.map((s) => s.replace(/^local-module:collection\//, "").replace(/:$/, "")))];
}

export function moduleUrlForCollectionId(moduleUrls: string[], collectionId: string): string | null {
  const match = moduleUrls.find((u) => {
    const file = u.split("/").pop() ?? "";
    return file.startsWith(`${collectionId}.`) || file.startsWith(collectionId);
  });
  return match ?? null;
}

export function stringField(record: FramerCmsRecord, key: string | undefined): string | null {
  if (!key) return null;
  const v = record[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export function stringListField(record: FramerCmsRecord, key: string | undefined): string[] {
  if (!key) return [];
  const v = record[key];
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.trim());
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
