import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  MessageSquare,
  Building2,
  Loader2,
  Users,
  Mail,
  MapPin,
  Clock,
  ArrowRight,
  ThumbsUp,
  Plus,
  Linkedin,
  Twitter,
  Globe,
} from "lucide-react";
import { extractXHandle } from "@/lib/extractXHandle";
import { IntroPathfinder } from "./IntroPathfinder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectionsGate } from "./ConnectionsGate";
import { ContactRevealButton } from "./ContactRevealButton";
import { supabase } from "@/integrations/supabase/client";

interface Connection {
  user_id: string;
  company_name: string;
  sector: string | null;
  stage: string | null;
  investor_amount: number;
  instrument: string;
}

interface WebsiteContactLookup {
  email: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
}

function normalizeExternalHref(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
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
  currentUserId?: string;
  investorId?: string | null;
  isAdmin?: boolean;
  location?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  xUrl?: string | null;
  websiteUrl?: string | null;
}

const WARM_PATHS = [
  { name: "Alex Rivera", company: "FlowMetrics", badge: "1st Degree", context: "Raised Series A from this firm in Oct 2023.", avatar: "AR" },
  { name: "Priya Sharma", company: "DataLens AI", badge: "2nd Degree", context: "Participated in their Seed round, Jun 2024.", avatar: "PS" },
  { name: "Marcus Chen", company: "BuildStack", badge: "1st Degree", context: "Co-led their Pre-Seed in Mar 2024.", avatar: "MC" },
];

export function ConnectionsTab({
  investorName,
  currentUserId,
  investorId,
  isAdmin,
  location,
  email,
  linkedinUrl,
  xUrl,
  websiteUrl,
}: ConnectionsTabProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [websiteContact, setWebsiteContact] = useState<WebsiteContactLookup | null>(null);

  useEffect(() => {
    if (!investorName) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function fetch() {
      setLoading(true);
      const { data, error } = await supabase.rpc("find_connections_by_investor", {
        _investor_name: investorName,
      });

      if (!cancelled) {
        if (!error && data) {
          setConnections(
            (data as Connection[]).filter((c) => c.user_id !== currentUserId)
          );
        }
        setLoading(false);
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [investorName, currentUserId]);

  useEffect(() => {
    const missingContactFields = !email?.trim() || !linkedinUrl?.trim() || !xUrl?.trim();
    if (!websiteUrl?.trim() || !missingContactFields) {
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
  }, [email, linkedinUrl, websiteUrl, xUrl]);

  const resolvedEmail = email?.trim() || websiteContact?.email || null;
  const resolvedLinkedinUrl = linkedinUrl?.trim() || websiteContact?.linkedinUrl || null;
  const resolvedXUrl = xUrl?.trim() || websiteContact?.xUrl || null;
  const linkedinHref = resolvedLinkedinUrl ? normalizeExternalHref(resolvedLinkedinUrl) : null;
  const xHref = resolvedXUrl ? xProfileHref(resolvedXUrl) : null;
  const websiteHref = websiteUrl?.trim() ? normalizeExternalHref(websiteUrl.trim()) : null;
  const hasSocialLinks = !!(linkedinHref || xHref || websiteHref);
  const hasContactCard =
    !!(investorId || resolvedEmail || location?.trim() || hasSocialLinks);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Scanning network…</span>
      </div>
    );
  }

  return (
    <ConnectionsGate>
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
          {location?.trim() && (
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 shrink-0">
                <MapPin className="w-3.5 h-3.5 text-accent" />
              </div>
              <p className="text-sm font-medium text-foreground">{location.trim()}</p>
            </div>
          )}
          {hasSocialLinks && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/70">
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

      {/* Intro Pathfinder */}
      <IntroPathfinder investorName={investorName} />

      {/* Network Reach */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-primary/70 font-semibold">Network Reach</p>
        </div>
        <span className="text-5xl font-black text-foreground leading-none">14</span>
        <p className="text-[10px] text-muted-foreground mt-1 mb-3">Connected founders in the community</p>
        <div className="space-y-1.5 border-t border-primary/10 pt-3">
          <div className="flex items-center gap-2">
            <ThumbsUp className="w-3 h-3 text-success" />
            <span className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">8</span> raised from this investor</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-3 h-3 text-accent" />
            <span className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">4</span> emailed / engaged</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-warning" />
            <span className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">2</span> pending intro opportunities</span>
          </div>
        </div>
        <div className="mt-auto pt-3">
          <button className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
            Explore founder connections <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Warm Connections */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Your Warm Paths</p>
        <div className="space-y-2">
          {WARM_PATHS.map((path) => (
            <div key={path.name} className="flex items-center justify-between p-3.5 bg-card border border-border rounded-xl hover:border-accent/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary border border-border text-xs font-bold text-muted-foreground shrink-0">
                  {path.avatar}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{path.name}</span>
                    <span className="text-[10px] text-muted-foreground">{path.company}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      path.badge === "1st Degree" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                    }`}>
                      {path.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{path.context}</p>
                </div>
              </div>
              <button className="shrink-0 ml-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border hover:bg-secondary px-3.5 py-1.5 rounded-lg transition-colors">
                <MessageSquare className="h-3 w-3" />
                Ask for Intro
              </button>
            </div>
          ))}

          {/* Live DB connections */}
          {connections.map((conn) => (
            <div
              key={conn.user_id}
              className="flex items-center justify-between p-3.5 bg-card border border-border rounded-xl hover:border-accent/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary border border-border shrink-0">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{conn.company_name || "Unnamed Startup"}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-primary/10 text-primary">Cap Table</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {conn.sector && <span className="text-[10px] text-muted-foreground">{conn.sector}</span>}
                    {conn.stage && <><span className="text-muted-foreground/40">·</span><span className="text-[10px] text-muted-foreground">{conn.stage}</span></>}
                  </div>
                </div>
              </div>
              <button className="shrink-0 ml-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border hover:bg-secondary px-3.5 py-1.5 rounded-lg transition-colors">
                <MessageSquare className="h-3 w-3" />
                Ask for Intro
              </button>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
    </ConnectionsGate>
  );
}
