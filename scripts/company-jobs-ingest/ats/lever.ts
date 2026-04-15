import type { CompanyJobSourceType } from "@prisma/client";
import { fetchText } from "../http.js";
import type { NormalizedJobInput } from "../types.js";

interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { commitment?: string; location?: string; team?: string; department?: string };
}

export async function fetchLeverJobs(site: string): Promise<NormalizedJobInput[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`;
  const { ok, status, text } = await fetchText(url, 25_000);
  if (!ok) throw new Error(`Lever site "${site}" HTTP ${status}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Lever site "${site}" returned non-JSON`);
  }
  if (!Array.isArray(parsed)) {
    const err = parsed as { ok?: boolean; error?: string };
    if (err && err.ok === false) throw new Error(`Lever site "${site}": ${err.error ?? "error"}`);
    return [];
  }
  const postings = parsed as LeverPosting[];
  const out: NormalizedJobInput[] = [];
  const sourceType: CompanyJobSourceType = "LEVER";
  for (const p of postings) {
    if (!p?.text) continue;
    const applyUrl =
      (typeof p.applyUrl === "string" && p.applyUrl) ||
      (typeof p.hostedUrl === "string" && p.hostedUrl) ||
      null;
    if (!applyUrl) continue;
    const ext = typeof p.id === "string" ? p.id : null;
    const postedAt =
      typeof p.createdAt === "number" ? new Date(p.createdAt) : null;
    const cats = p.categories;
    out.push({
      sourceType,
      sourceUrl: url,
      externalJobId: ext,
      title: p.text,
      department: cats?.department ?? null,
      team: cats?.team ?? null,
      location: cats?.location ?? null,
      locationType: typeof p.workplaceType === "string" ? p.workplaceType : null,
      employmentType: cats?.commitment ?? null,
      postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
      applyUrl,
      descriptionSnippet: null,
      descriptionRaw: null,
      compensationText: null,
      compensationMin: null,
      compensationMax: null,
      compensationCurrency: null,
      rawJson: p,
      mergeKey: ext ? `ext:LEVER:${ext}` : `ttl:LEVER:${p.text}:${applyUrl}`,
    });
  }
  return out;
}
