/**
 * Canonical public-site domains for well-known VC firms. Used when `firm_records` / MDM disagree
 * or hold a legacy URL (e.g. Kleiner Perkins → always https://kleinerperkins.com).
 */
import { safeTrim } from "@/lib/utils";

/** Lowercase firm name (or alias) → bare hostname, no scheme. */
export const KNOWN_VC_DOMAIN_BY_FIRM_NAME: Record<string, string> = {
  "sequoia capital": "sequoiacap.com",
  "sequoia capital india": "sequoiacap.com",
  "sequoia capital china": "sequoiacap.com",
  "andreessen horowitz": "a16z.com",
  "andreessen horowitz (a16z)": "a16z.com",
  a16z: "a16z.com",
  "benchmark capital": "benchmark.com",
  "benchmark capital partners": "benchmark.com",
  "kleiner perkins": "kleinerperkins.com",
  "kleiner perkins caufield & byers": "kleinerperkins.com",
  accel: "accel.com",
  "accel partners": "accel.com",
  "tiger global": "tigerglobal.com",
  "tiger global management": "tigerglobal.com",
  "lightspeed venture partners": "lsvp.com",
  lightspeed: "lsvp.com",
  "general catalyst": "generalcatalyst.com",
  greylock: "greylock.com",
  "greylock partners": "greylock.com",
  nea: "nea.com",
  "new enterprise associates": "nea.com",
  "bessemer venture partners": "bvp.com",
  bessemer: "bvp.com",
  "index ventures": "indexventures.com",
  gv: "gv.com",
  "google ventures": "gv.com",
  "insight partners": "insightpartners.com",
  "battery ventures": "battery.com",
  "founders fund": "foundersfund.com",
  "first round capital": "firstround.com",
  "first round": "firstround.com",
  "khosla ventures": "khoslaventures.com",
  "spark capital": "sparkcapital.com",
  "union square ventures": "usv.com",
  usv: "usv.com",
  "matrix partners": "matrixpartners.com",
  "redpoint ventures": "redpoint.com",
  redpoint: "redpoint.com",
  "softbank vision fund": "softbankvisionfund.com",
  softbank: "softbank.com",
  "y combinator": "ycombinator.com",
  ycombinator: "ycombinator.com",
  yc: "ycombinator.com",
  coatue: "coatue.com",
  "coatue management": "coatue.com",
  dragoneer: "dragoneer.com",
  "dragoneer investment group": "dragoneer.com",
  "emergence capital": "emcap.com",
  emergence: "emcap.com",
  "felicis ventures": "felicis.com",
  felicis: "felicis.com",
  "initialized capital": "initialized.com",
  initialized: "initialized.com",
  "lowercase capital": "lowercasecapital.com",
  lowercase: "lowercasecapital.com",
  "menlo ventures": "menlovc.com",
  menlo: "menlovc.com",
  "norwest venture partners": "nvp.com",
  norwest: "nvp.com",
  "oak hc/ft": "oakhcft.com",
  "scale venture partners": "scalevp.com",
  "scale vp": "scalevp.com",
  "social capital": "socialcapital.com",
  "true ventures": "trueventures.com",
  true: "trueventures.com",
  "valor equity partners": "valorep.com",
  venrock: "venrock.com",
  "wing venture capital": "wing.vc",
  "wing vc": "wing.vc",
  "12/12 ventures": "1212.vc",
  "12 12 ventures": "1212.vc",
  "collaborative fund": "collaborativefund.com",
  "lux capital": "luxcapital.com",
  lux: "luxcapital.com",
  dcvc: "dcvc.com",
  "data collective": "dcvc.com",
  "founders circle capital": "founderscirclecapital.com",
  "ff venture capital": "ffvc.com",
  "ff vc": "ffvc.com",
  "general atlantic": "generalatlantic.com",
  "hummer winblad": "humwin.com",
  "idc ventures": "idcventures.com",
};

export function lookupKnownVcDomain(firmName: string | null | undefined): string | null {
  if (!firmName) return null;
  const key = firmName.toLowerCase().trim();
  if (KNOWN_VC_DOMAIN_BY_FIRM_NAME[key]) return KNOWN_VC_DOMAIN_BY_FIRM_NAME[key];
  const partial = Object.entries(KNOWN_VC_DOMAIN_BY_FIRM_NAME).find(([k]) => key.startsWith(k) || k.startsWith(key));
  return partial ? partial[1] : null;
}

function hostnameOf(url: string | null | undefined): string | null {
  const t = safeTrim(url);
  if (!t) return null;
  try {
    const href = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
    return new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function ensureHttps(urlOrDomain: string): string {
  const t = urlOrDomain.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

/**
 * Pick the link to show for a firm: prefer `firm_records` when it already matches the curated domain,
 * then MDM / `vc_firms`, then force the curated HTTPS URL when the DB has a stale host.
 */
export function resolveDirectoryFirmWebsiteUrl(args: {
  firmName: string | null | undefined;
  firmRecordsWebsite?: string | null;
  vcDirectoryWebsite?: string | null;
}): string | null {
  const name = safeTrim(args.firmName);
  const curatedHost = lookupKnownVcDomain(name);
  const db = safeTrim(args.firmRecordsWebsite ?? null);
  const vc = safeTrim(args.vcDirectoryWebsite ?? null);

  if (!curatedHost) {
    return db || vc || null;
  }

  const dbHost = hostnameOf(db);
  const vcHost = hostnameOf(vc);

  if (dbHost === curatedHost) return ensureHttps(db);
  if (vcHost === curatedHost) return ensureHttps(vc);

  return `https://${curatedHost}`;
}
