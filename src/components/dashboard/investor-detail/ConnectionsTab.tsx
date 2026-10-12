import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Mail,
  MapPin,
  Linkedin,
  Twitter,
  Facebook,
  Instagram,
  Youtube,
} from "lucide-react";
import { extractXHandle } from "@/lib/extractXHandle";
import { IntroPathfinder } from "./IntroPathfinder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactRevealButton } from "./ContactRevealButton";
import { safeTrim } from "@/lib/utils";

interface WebsiteContactLookup {
  email: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
}

function normalizeExternalHref(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

/** Curated CB org URLs when `firm_records.crunchbase_url` is unset (normalized website host → URL). */
const CRUNCHBASE_URL_BY_WEBSITE_HOST: Record<string, string> = {
  "gradient.com": "https://www.crunchbase.com/organization/gradient-ventures",
  "www.gradient.com": "https://www.crunchbase.com/organization/gradient-ventures",
};

function crunchbaseOrgUrlFromWebsite(websiteUrl: string | null | undefined): string | null {
  const w = safeTrim(websiteUrl);
  if (!w) return null;
  try {
    const host = new URL(normalizeExternalHref(w)).hostname.toLowerCase();
    return CRUNCHBASE_URL_BY_WEBSITE_HOST[host] ?? null;
  } catch {
    return null;
  }
}

/** Crunchbase wordmark icon (Simple Icons path, monochrome). */
function CrunchbaseIcon({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M21.6 0H2.4A2.41 2.41 0 0 0 0 2.4v19.2A2.41 2.41 0 0 0 2.4 24h19.2a2.41 2.41 0 0 0 2.4-2.4V2.4A2.41 2.41 0 0 0 21.6 0zM7.045 14.465A2.11 2.11 0 0 0 9.84 13.42h1.66a3.69 3.69 0 1 1 0-1.75H9.84a2.11 2.11 0 1 0-2.795 2.795zm11.345.845a3.55 3.55 0 0 1-1.06.63 3.68 3.68 0 0 1-3.39-.38v.38h-1.51V5.37h1.5v4.11a3.74 3.74 0 0 1 1.8-.63H16a3.67 3.67 0 0 1 2.39 6.46zm-.223-2.766a2.104 2.104 0 1 1-4.207 0 2.104 2.104 0 0 1 4.207 0z" />
    </svg>
  );
}

function xProfileHref(xUrl: string): string | null {
  const t = xUrl.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      return new URL(t).href;
    } catch {
      return null;
    }
  }
  const h = extractXHandle(t);
  return h ? `https://x.com/${h}` : null;
}

interface ConnectionsTabProps {
  investorName: string;
  investorId?: string | null;
  isAdmin?: boolean;
  location?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  xUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  websiteUrl?: string | null;
  /** Firm Crunchbase organization URL (`firm_records.crunchbase_url`). */
  crunchbaseUrl?: string | null;
}

export function ConnectionsTab({
  investorName,
  investorId,
  isAdmin,
  location,
  email,
  linkedinUrl,
  xUrl,
  facebookUrl,
  instagramUrl,
  youtubeUrl,
  websiteUrl,
  crunchbaseUrl,
}: ConnectionsTabProps) {
  const [websiteContact, setWebsiteContact] = useState<WebsiteContactLookup | null>(null);

  useEffect(() => {
    const missingContactFields =
      !safeTrim(email) ||
      !safeTrim(linkedinUrl) ||
      !safeTrim(xUrl) ||
      !safeTrim(facebookUrl) ||
      !safeTrim(instagramUrl) ||
      !safeTrim(youtubeUrl);
    if (!safeTrim(websiteUrl) || !missingContactFields) {
      setWebsiteContact(null);
      return;
    }

    let cancelled = false;
    async function fetchWebsiteContact() {
      try {
        const res = await fetch("/api/firm-website-contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl }),
        });
        if (!res.ok) throw new Error(`Contact lookup failed (${res.status})`);
        const data = (await res.json()) as WebsiteContactLookup;
        if (!cancelled) {
          setWebsiteContact({
            email: data.email ?? null,
            linkedinUrl: data.linkedinUrl ?? null,
            xUrl: data.xUrl ?? null,
            facebookUrl: data.facebookUrl ?? null,
            instagramUrl: data.instagramUrl ?? null,
            youtubeUrl: data.youtubeUrl ?? null,
          });
        }
      } catch {
        if (!cancelled) setWebsiteContact(null);
      }
    }

    fetchWebsiteContact();
    return () => {
      cancelled = true;
    };
  }, [email, linkedinUrl, websiteUrl, xUrl, facebookUrl, instagramUrl, youtubeUrl]);

  const resolvedEmail = safeTrim(email) || websiteContact?.email || null;
  const resolvedLinkedinUrl = safeTrim(linkedinUrl) || websiteContact?.linkedinUrl || null;
  const resolvedXUrl = safeTrim(xUrl) || websiteContact?.xUrl || null;
  const resolvedFacebookUrl = safeTrim(facebookUrl) || websiteContact?.facebookUrl || null;
  const resolvedInstagramUrl = safeTrim(instagramUrl) || websiteContact?.instagramUrl || null;
  const resolvedYoutubeUrl = safeTrim(youtubeUrl) || websiteContact?.youtubeUrl || null;
  const linkedinHref = resolvedLinkedinUrl ? normalizeExternalHref(resolvedLinkedinUrl) : null;
  const xHref = resolvedXUrl ? xProfileHref(resolvedXUrl) : null;
  const facebookHref = resolvedFacebookUrl ? normalizeExternalHref(resolvedFacebookUrl) : null;
  const instagramHref = resolvedInstagramUrl ? normalizeExternalHref(resolvedInstagramUrl) : null;
  const youtubeHref = resolvedYoutubeUrl ? normalizeExternalHref(resolvedYoutubeUrl) : null;
  const wTrim = safeTrim(websiteUrl);
  const websiteHref = wTrim ? normalizeExternalHref(wTrim) : null;
  const crunchbaseTrim = safeTrim(crunchbaseUrl);
  const crunchbaseHref =
    (crunchbaseTrim ? normalizeExternalHref(crunchbaseTrim) : null) ||
    crunchbaseOrgUrlFromWebsite(websiteUrl);
  const hasSocialLinks = !!(
    linkedinHref ||
    xHref ||
    facebookHref ||
    instagramHref ||
    youtubeHref ||
    websiteHref ||
    crunchbaseHref
  );
  const hasContactCard =
    !!(investorId || resolvedEmail || safeTrim(location) || hasSocialLinks);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Scanning network…</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="space-y-5"
    >
      {/* Contact Details */}
      {hasContactCard ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
          {resolvedEmail ? (
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 shrink-0">
                <Mail className="w-3.5 h-3.5 text-accent" />
              </div>
              <a
                href={`mailto:${resolvedEmail}`}
                className="text-sm font-medium text-foreground hover:text-accent transition-colors"
              >
                {resolvedEmail}
              </a>
            </div>
          ) : investorId ? (
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 shrink-0">
                <Mail className="w-3.5 h-3.5 text-accent" />
              </div>
              <ContactRevealButton
                investorId={investorId}
                firmName={investorName}
                isAdmin={isAdmin}
                autoReveal
              />
            </div>
          ) : null}
          {safeTrim(location) && (
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 shrink-0">
                <MapPin className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-sm font-medium text-foreground">{safeTrim(location)}</p>
            </div>
          )}
          {hasSocialLinks && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/70">
              {crunchbaseHref ? (
                <a
                  href={crunchbaseHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-[#0288d1] hover:border-[#0288d1]/30 transition-colors"
                  title="Crunchbase"
                  aria-label={`${investorName} on Crunchbase`}
                >
                  <CrunchbaseIcon className="h-4 w-4" />
                </a>
              ) : null}
              {linkedinHref ? (
                <a
                  href={linkedinHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-[#0A66C2] hover:border-[#0A66C2]/30 transition-colors"
                  title="LinkedIn"
                  aria-label={`${investorName} on LinkedIn`}
                >
                  <Linkedin className="w-4 h-4" />
                </a>
              ) : null}
              {xHref ? (
                <a
                  href={xHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                  title="X (Twitter)"
                  aria-label={`${investorName} on X`}
                >
                  <Twitter className="w-4 h-4" />
                </a>
              ) : null}
              {facebookHref ? (
                <a
                  href={facebookHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-[#1877F2] hover:border-[#1877F2]/30 transition-colors"
                  title="Facebook"
                  aria-label={`${investorName} on Facebook`}
                >
                  <Facebook className="w-4 h-4" />
                </a>
              ) : null}
              {instagramHref ? (
                <a
                  href={instagramHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-pink-500 hover:border-pink-500/30 transition-colors"
                  title="Instagram"
                  aria-label={`${investorName} on Instagram`}
                >
                  <Instagram className="w-4 h-4" />
                </a>
              ) : null}
              {youtubeHref ? (
                <a
                  href={youtubeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-red-500 hover:border-red-500/30 transition-colors"
                  title="YouTube"
                  aria-label={`${investorName} on YouTube`}
                >
                  <Youtube className="w-4 h-4" />
                </a>
              ) : null}
              {websiteHref ? (
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-muted-foreground hover:text-accent transition-colors"
                  aria-label={`${investorName} website`}
                >
                  {websiteHref.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <button className="w-full rounded-2xl border border-dashed border-border bg-card px-5 py-4 flex items-center gap-3 text-left hover:border-accent/40 hover:bg-accent/5 transition-colors group">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary group-hover:bg-accent/10 transition-colors shrink-0">
            <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">Add contact details</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">Email, phone, or address</p>
          </div>
        </button>
      )}

      <IntroPathfinder investorName={investorName} />
    </motion.div>
  );
}
