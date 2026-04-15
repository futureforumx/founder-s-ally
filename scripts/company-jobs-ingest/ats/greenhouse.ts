import type { CompanyJobSourceType } from "@prisma/client";
import { fetchText } from "../http.js";
import type { NormalizedJobInput } from "../types.js";

interface GhJob {
  id?: number;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  metadata?: { name?: string; value?: string | null }[];
}

function deptFromMetadata(meta: GhJob["metadata"]): string | null {
  if (!Array.isArray(meta)) return null;
  for (const m of meta) {
    if (!m?.name || m.value == null) continue;
    const n = m.name.toLowerCase();
    if (n.includes("department") || n === "team") return String(m.value);
  }
  return null;
}

export async function fetchGreenhouseJobs(boardToken: string): Promise<NormalizedJobInput[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`;
  const { ok, status, text } = await fetchText(url, 25_000);
  if (!ok) throw new Error(`Greenhouse board "${boardToken}" HTTP ${status}`);
  let body: { jobs?: GhJob[] };
  try {
    body = JSON.parse(text) as { jobs?: GhJob[] };
  } catch {
    throw new Error(`Greenhouse board "${boardToken}" returned non-JSON`);
  }
  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  const out: NormalizedJobInput[] = [];
  const sourceType: CompanyJobSourceType = "GREENHOUSE";
  for (const j of jobs) {
    if (!j?.title) continue;
    const applyUrl = typeof j.absolute_url === "string" ? j.absolute_url : null;
    if (!applyUrl) continue;
    const ext = typeof j.id === "number" ? String(j.id) : null;
    const ts = j.first_published || j.updated_at;
    const postedAt = ts ? new Date(ts) : null;
    out.push({
      sourceType,
      sourceUrl: url,
      externalJobId: ext,
      title: j.title,
      department: deptFromMetadata(j.metadata),
      team: null,
      location: j.location?.name ?? null,
      locationType: null,
      employmentType: null,
      postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
      applyUrl,
      descriptionSnippet: null,
      descriptionRaw: null,
      compensationText: null,
      compensationMin: null,
      compensationMax: null,
      compensationCurrency: null,
      rawJson: j,
      mergeKey: ext ? `ext:GREENHOUSE:${ext}` : `ttl:GREENHOUSE:${j.title}:${applyUrl}`,
    });
  }
  return out;
}
