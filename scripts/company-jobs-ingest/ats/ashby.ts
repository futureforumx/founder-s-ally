import type { CompanyJobSourceType } from "@prisma/client";
import { fetchText } from "../http.js";
import type { NormalizedJobInput } from "../types.js";

function stripHtmlSnippet(html: string | null | undefined, max = 280): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

interface AshbyJob {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  workplaceType?: string;
  isRemote?: boolean;
  isListed?: boolean;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  compensation?: { summary?: string; min?: number; max?: number; currency?: string };
}

export async function fetchAshbyJobs(boardSlug: string): Promise<NormalizedJobInput[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
    boardSlug,
  )}?includeCompensation=true`;
  const { ok, status, text } = await fetchText(url, 25_000);
  if (!ok) throw new Error(`Ashby board "${boardSlug}" HTTP ${status}`);
  let body: { jobs?: AshbyJob[] };
  try {
    body = JSON.parse(text) as { jobs?: AshbyJob[] };
  } catch {
    throw new Error(`Ashby board "${boardSlug}" returned non-JSON`);
  }
  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  const out: NormalizedJobInput[] = [];
  const sourceType: CompanyJobSourceType = "ASHBY";
  for (const j of jobs) {
    if (!j?.title) continue;
    if (j.isListed === false) continue;
    const applyUrl = (typeof j.applyUrl === "string" && j.applyUrl) || j.jobUrl || url;
    const ext = typeof j.id === "string" ? j.id : null;
    const locationType =
      typeof j.workplaceType === "string"
        ? j.workplaceType
        : j.isRemote
          ? "Remote"
          : null;
    const postedAt = j.publishedAt ? new Date(j.publishedAt) : null;
    const comp = j.compensation;
    out.push({
      sourceType,
      sourceUrl: url,
      externalJobId: ext,
      title: j.title,
      department: j.department ?? null,
      team: j.team ?? null,
      location: j.location ?? null,
      locationType,
      employmentType: j.employmentType ?? null,
      postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
      applyUrl,
      descriptionSnippet: stripHtmlSnippet(j.descriptionHtml),
      descriptionRaw: typeof j.descriptionHtml === "string" ? j.descriptionHtml : null,
      compensationText: comp?.summary ?? null,
      compensationMin: typeof comp?.min === "number" ? comp.min : null,
      compensationMax: typeof comp?.max === "number" ? comp.max : null,
      compensationCurrency: typeof comp?.currency === "string" ? comp.currency : null,
      rawJson: j,
      mergeKey: ext ? `ext:ASHBY:${ext}` : `ttl:ASHBY:${j.title}:${applyUrl}`,
    });
  }
  return out;
}
