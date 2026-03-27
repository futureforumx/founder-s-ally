/**
 * Normalize any input (company name, domain, or full URL) into a clean bare domain.
 * e.g. "Outbuild", "outbuild.com", "https://www.outbuild.com/pricing" → "outbuild.com"
 */
export function normalizeDomain(input: string, knownCompanies: { name: string; domain: string }[] = []): string {
  if (!input) return "";
  const raw = input.trim().toLowerCase().replace(/\s+/g, "");
  // Strip protocol + www. + path/query
  const stripped = raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0];
  
  if (stripped.includes(".")) return stripped;
  
  // No dot → treat as company name — look up known list first
  const known = knownCompanies.find(c => c.name.toLowerCase() === stripped);
  if (known) return known.domain;
  
  return stripped + ".com";
}

/**
 * Get high-quality favicon URL from Google's gstatic service.
 * Standardizes sizes and fallbacks for UI consistency.
 */
export function getFaviconUrl(input: string, size: number = 128): string {
  const domain = normalizeDomain(input);
  if (!domain) return "";
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=${size}`;
}
