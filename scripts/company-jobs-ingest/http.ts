const DEFAULT_UA =
  "Mozilla/5.0 (compatible; VektaCompanyJobsBot/1.0; +https://example.invalid) AppleWebKit/537.36";

export async function fetchText(url: string, ms = 18_000): Promise<{ ok: boolean; status: number; text: string }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent": DEFAULT_UA,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}
