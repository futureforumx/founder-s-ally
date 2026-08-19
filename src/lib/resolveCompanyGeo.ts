import { GEO_OPTIONS } from "@/constants/taxonomy";

/** Map HQ city/country text to a canonical geo region label. */
export function resolveCompanyGeo(hqLocation?: string | null): string {
  const loc = (hqLocation ?? "").trim().toLowerCase();
  if (!loc) return "Global";

  for (const opt of GEO_OPTIONS) {
    if (opt.label.toLowerCase() === loc) return opt.label;
    if (opt.search_tags.some((tag) => loc.includes(tag))) return opt.label;
  }

  if (
    /\b(united states|u\.s\.|usa)\b/.test(loc) ||
    /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/.test(
      loc,
    ) ||
    /\b(san francisco|new york|austin|boston|seattle|los angeles|chicago|miami|denver|atlanta|toronto|vancouver|montreal|mexico city)\b/.test(
      loc,
    )
  ) {
    return "North America";
  }

  return "Global";
}
