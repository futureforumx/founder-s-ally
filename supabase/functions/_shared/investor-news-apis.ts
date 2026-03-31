/**
 * Aggregates public news mentions for a VC firm name via optional third-party APIs.
 * Set one or more secrets on the edge function: NEWS_API_KEY, MEDIASTACK_ACCESS_KEY, GNEWS_API_KEY, THE_NEWS_API_TOKEN.
 */

/** Normalized article shape for investor-updates (DB signals + news APIs). */
export type NewsRawArticle = {
  title: string;
  url: string;
  source_name: string;
  published_at: string;
  content_snippet: string;
  tags: string[];
  og_image_url: string | null;
};

export type FirmNewsContext = {
  firmName: string;
  websiteDomain?: string | null;
};

function normUrl(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    let p = u.pathname.replace(/\/+$/, "");
    if (!p) p = "/";
    u.pathname = p;
    return u.href.toLowerCase();
  } catch {
    return href.trim().toLowerCase();
  }
}

function extractDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    let u = input.trim();
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function tokenizeFirmName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s&.-]/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
}

function isRelevantToFirm(article: NewsRawArticle, ctx: FirmNewsContext): boolean {
  const name = (ctx.firmName || "").trim().toLowerCase();
  if (!name) return true;
  const tokens = tokenizeFirmName(name);
  const domain = extractDomain(ctx.websiteDomain ?? null);
  const articleDomain = extractDomain(article.url);
  const haystack = `${article.title} ${article.content_snippet} ${article.source_name}`.toLowerCase();

  if (haystack.includes(name)) return true;
  if (domain && (articleDomain === domain || articleDomain?.endsWith(`.${domain}`))) return true;

  let hits = 0;
  for (const t of tokens) {
    if (haystack.includes(t)) hits++;
  }
  return hits >= Math.min(2, tokens.length);
}

export function dedupeNewsArticles(articles: NewsRawArticle[]): NewsRawArticle[] {
  const seen = new Set<string>();
  const out: NewsRawArticle[] = [];
  for (const a of articles) {
    const u = (a.url || "").trim();
    if (!u || !/^https?:\/\//i.test(u)) continue;
    const k = normUrl(u);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

async function fetchNewsApi(firmName: string): Promise<NewsRawArticle[]> {
  const key = Deno.env.get("NEWS_API_KEY");
  if (!key) return [];
  const safe = firmName.replace(/"/g, "").trim();
  const q = encodeURIComponent(`"${safe}"`);
  const url = `https://newsapi.org/v2/everything?q=${q}&sortBy=publishedAt&pageSize=12&language=en&apiKey=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("NewsAPI error:", res.status, await res.text().then((t) => t.slice(0, 200)));
      return [];
    }
    const j = await res.json();
    const arr = j?.articles;
    if (!Array.isArray(arr)) return [];
    return arr.map((a: Record<string, unknown>) => ({
      title: String(a.title ?? "").trim() || "Untitled",
      url: String(a.url ?? "").trim(),
      source_name: String((a.source as { name?: string } | undefined)?.name ?? "NewsAPI"),
      published_at: a.publishedAt ? String(a.publishedAt) : new Date().toISOString(),
      content_snippet: String(a.description ?? "").trim(),
      tags: ["Press"],
      og_image_url: typeof a.urlToImage === "string" && a.urlToImage.startsWith("http") ? a.urlToImage : null,
    }));
  } catch (e) {
    console.warn("NewsAPI fetch failed:", e);
    return [];
  }
}

async function fetchMediastack(firmName: string): Promise<NewsRawArticle[]> {
  const key = Deno.env.get("MEDIASTACK_ACCESS_KEY");
  if (!key) return [];
  const keywords = encodeURIComponent(firmName);
  const url = `https://api.mediastack.com/v1/news?access_key=${encodeURIComponent(key)}&keywords=${keywords}&languages=en&sort=published_desc&limit=12`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Mediastack error:", res.status);
      return [];
    }
    const j = await res.json();
    const arr = j?.data;
    if (!Array.isArray(arr)) return [];
    return arr.map((a: Record<string, unknown>) => ({
      title: String(a.title ?? "").trim() || "Untitled",
      url: String(a.url ?? "").trim(),
      source_name: String(a.source ?? "Mediastack"),
      published_at: a.published_at ? String(a.published_at) : new Date().toISOString(),
      content_snippet: String(a.description ?? "").trim(),
      tags: ["Press"],
      og_image_url: typeof a.image === "string" && a.image.startsWith("http") ? a.image : null,
    }));
  } catch (e) {
    console.warn("Mediastack fetch failed:", e);
    return [];
  }
}

async function fetchGNews(firmName: string): Promise<NewsRawArticle[]> {
  const key = Deno.env.get("GNEWS_API_KEY");
  if (!key) return [];
  const q = encodeURIComponent(firmName);
  const url = `https://gnews.io/api/v4/search?q=${q}&lang=en&max=12&token=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("GNews error:", res.status);
      return [];
    }
    const j = await res.json();
    const arr = j?.articles;
    if (!Array.isArray(arr)) return [];
    return arr.map((a: Record<string, unknown>) => ({
      title: String(a.title ?? "").trim() || "Untitled",
      url: String(a.url ?? "").trim(),
      source_name: String((a.source as { name?: string } | undefined)?.name ?? "GNews"),
      published_at: a.publishedAt ? String(a.publishedAt) : new Date().toISOString(),
      content_snippet: String(a.description ?? "").trim(),
      tags: ["Press"],
      og_image_url: typeof a.image === "string" && a.image.startsWith("http") ? a.image : null,
    }));
  } catch (e) {
    console.warn("GNews fetch failed:", e);
    return [];
  }
}

async function fetchTheNewsApi(firmName: string): Promise<NewsRawArticle[]> {
  const key = Deno.env.get("THE_NEWS_API_TOKEN");
  if (!key) return [];
  const search = encodeURIComponent(firmName);
  const url = `https://api.thenewsapi.com/v1/news/all?api_token=${encodeURIComponent(key)}&search=${search}&language=en&limit=12`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("TheNewsAPI error:", res.status);
      return [];
    }
    const j = await res.json();
    const arr = j?.data;
    if (!Array.isArray(arr)) return [];
    return arr.map((a: Record<string, unknown>) => ({
      title: String(a.title ?? "").trim() || "Untitled",
      url: String(a.url ?? "").trim(),
      source_name: String(a.source ?? "The News API"),
      published_at: a.published_at ? String(a.published_at) : new Date().toISOString(),
      content_snippet: String(a.description ?? a.snippet ?? "").trim(),
      tags: ["Press"],
      og_image_url: typeof a.image_url === "string" && a.image_url.startsWith("http") ? a.image_url : null,
    }));
  } catch (e) {
    console.warn("TheNewsAPI fetch failed:", e);
    return [];
  }
}

/** Fetch from every configured provider in parallel, merge, dedupe by URL. */
export async function fetchExternalNewsForFirm(ctx: FirmNewsContext): Promise<NewsRawArticle[]> {
  const name = ctx.firmName?.trim();
  if (!name) return [];

  const [a, b, c, d] = await Promise.all([
    fetchNewsApi(name),
    fetchMediastack(name),
    fetchGNews(name),
    fetchTheNewsApi(name),
  ]);

  const merged = [...a, ...b, ...c, ...d];
  const deduped = dedupeNewsArticles(merged).filter((a) => isRelevantToFirm(a, ctx));
  deduped.sort(
    (x, y) => new Date(y.published_at).getTime() - new Date(x.published_at).getTime(),
  );
  return deduped.slice(0, 20);
}
