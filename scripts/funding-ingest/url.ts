export function canonicalizeArticleUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    u.searchParams.delete("utm_term");
    u.searchParams.delete("utm_content");
    u.searchParams.delete("mc_cid");
    u.searchParams.delete("mc_eid");
    u.searchParams.sort();
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path;
    return u.toString();
  } catch {
    return raw.trim();
  }
}
