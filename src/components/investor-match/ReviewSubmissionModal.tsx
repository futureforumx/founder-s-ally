import { useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { isSupabaseConfigured, supabase, supabaseVcDirectory } from "@/integrations/supabase/client";
import { submitVcRatingViaEdge } from "@/lib/submitVcRatingEdge";
import { useAuth } from "@/hooks/useAuth";
import { useVCDirectory } from "@/hooks/useVCDirectory";
import { FirmLogo } from "@/components/ui/firm-logo";
import {
  buildReviewFormConfig,
  deriveNonInvestorScores,
  deriveInvestorScores,
} from "@/lib/buildReviewFormConfig";
import {
  canAdvanceWizardStep,
  formatLinkedEvaluationSummary,
  formatNoteSummary,
  formatTagsSummary,
  formatUnlinkedContextSummary,
  formatUnlinkedEvaluationSummary,
  type ReviewWizardStep,
} from "@/lib/reviewModalWizard";
import { nonInvestorTagsForOverallScore } from "@/lib/reviewFormContent";
import { isContextStepValidUnlinked, isEvaluationStepValidUnlinked } from "@/lib/reviewWizard";
import { cn } from "@/lib/utils";
import {
  ReviewWizardBody,
  ReviewWizardFooter,
  ReviewWizardProgressBar,
  ReviewWizardSummaryPanel,
} from "./review-modal/ReviewWizardSections";
import {
  type RememberWhoChipOption,
  ReviewWizardLinkedStep1,
  ReviewWizardLinkedStep2,
  ReviewWizardNoteStep,
  ReviewWizardUnlinkedStep1,
  ReviewWizardUnlinkedStep3,
  ReviewWizardUnlinkedStep4,
} from "./review-modal/ReviewWizardStepPanels";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewSubmissionModalProps {
  open: boolean;
  onClose: () => void;
  firmName: string;
  /** Firm mark for the header; if omitted and `vcFirmId` is set, logo is loaded from the directory. */
  firmLogoUrl?: string | null;
  /** Helps resolve brand logo when `firmLogoUrl` is missing (Clearbit / known domains). */
  firmWebsiteUrl?: string | null;
  /** `vc_firms.id` from the VC directory — used as FK in vc_ratings */
  vcFirmId?: string | null;
  /** Partner id (`vc_people.id`) — omit for firm-level rating */
  personId?: string;
  personName?: string;
  /**
   * Whether this firm is already mapped to the founder's company profile
   * (i.e., appears in their cap_table).
   *   true  → show investor relationship review
   *   false → show non-investor interaction review
   */
  investorIsMappedToProfile: boolean;
  /** cap_table.id of the matching row — null when not mapped */
  mappingRecordId: string | null;
  /** Founder's company id — stored in star_ratings JSONB for traceability */
  companyId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatVcPersonChipName(row: {
  preferred_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string | null {
  const pref = row.preferred_name?.trim();
  if (pref) return pref;
  const a = row.first_name?.trim() ?? "";
  const b = row.last_name?.trim() ?? "";
  const full = `${a} ${b}`.trim();
  return full.length > 0 ? full : null;
}

/** Hostname from a URL or bare domain (for matching `vc_firms.website_url`). */
function parseWebsiteHost(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    const u = t.includes("://") ? new URL(t) : new URL(`https://${t}`);
    let h = u.hostname.toLowerCase();
    if (h.startsWith("www.")) h = h.slice(4);
    return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(h) ? h : null;
  } catch {
    return null;
  }
}

/** Collapse whitespace and strip a leading “.” (MDM JSON uses names like “.406 Ventures”). */
function normalizeFirmLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/^\.+\s*/, "");
}

/** Escape `%` / `_` for use inside PostgREST `ilike` patterns we build with wildcards. */
function escapeIlikeWildcards(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

type MdmFirmLite = { id: string; name: string; website_url?: string | null };

/**
 * Returns a `vc_firms.id` suitable for `vc_ratings.vc_firm_id` FK.
 * `hint` may be `vc_firms.id`, `investor_database.id`, an MDM JSON id (often a domain e.g. `406ventures.com`),
 * or a `vc_firms.slug` — all are normalized here.
 */
async function resolveVcFirmId(
  firmName: string,
  hint: string | null | undefined,
  ctx?: { websiteUrl?: string | null; mdmFirms?: readonly MdmFirmLite[] },
): Promise<string | null> {
  const name = firmName.trim();
  const dir = supabaseVcDirectory as unknown as { from: (t: string) => any };
  const mdmFirms = ctx?.mdmFirms ?? [];

  const resolveByWebsiteHost = async (host: string): Promise<string | null> => {
    const h = host.trim().toLowerCase();
    if (!h) return null;
    const safe = escapeIlikeWildcards(h);
    const { data } = await dir
      .from("vc_firms")
      .select("id")
      .ilike("website_url", `%${safe}%`)
      .is("deleted_at", null)
      .limit(1);
    return (data?.[0]?.id as string) ?? null;
  };

  const resolveOneNameString = async (raw: string): Promise<string | null> => {
    const n = raw.trim();
    if (!n) return null;

    const { data: exact, error: exactErr } = await dir
      .from("vc_firms")
      .select("id")
      .ilike("firm_name", n)
      .is("deleted_at", null)
      .limit(1);
    if (!exactErr && exact?.[0]?.id) return exact[0].id as string;

    const { data: legalExact } = await dir
      .from("vc_firms")
      .select("id")
      .ilike("legal_name", n)
      .is("deleted_at", null)
      .limit(1);
    if (legalExact?.[0]?.id) return legalExact[0].id as string;

    const safe = escapeIlikeWildcards(n);
    const { data: looseName } = await dir
      .from("vc_firms")
      .select("id")
      .ilike("firm_name", `%${safe}%`)
      .is("deleted_at", null)
      .limit(1);
    if (looseName?.[0]?.id) return looseName[0].id as string;

    const { data: looseLegal } = await dir
      .from("vc_firms")
      .select("id")
      .ilike("legal_name", `%${safe}%`)
      .is("deleted_at", null)
      .limit(1);
    return (looseLegal?.[0]?.id as string) ?? null;
  };

  const resolveByName = async (raw: string): Promise<string | null> => {
    const alnum = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const variants = [
      ...new Set([raw.trim(), normalizeFirmLabel(raw), alnum].filter(Boolean)),
    ];
    for (const v of variants) {
      const id = await resolveOneNameString(v);
      if (id) return id;
    }
    return null;
  };

  const verifyVcFirmId = async (candidate: string): Promise<string | null> => {
    const { data, error } = await dir
      .from("vc_firms")
      .select("id")
      .eq("id", candidate)
      .is("deleted_at", null)
      .maybeSingle();
    if (!error && data?.id) return data.id as string;
    return null;
  };

  const trimmed = hint?.trim();
  if (trimmed) {
    const byPk = await verifyVcFirmId(trimmed);
    if (byPk) return byPk;

    const { data: bySlug } = await dir
      .from("vc_firms")
      .select("id")
      .eq("slug", trimmed)
      .is("deleted_at", null)
      .maybeSingle();
    if (bySlug?.id) return bySlug.id as string;

    if (trimmed.includes(".")) {
      const slugHyphen = trimmed.replace(/\./g, "-");
      if (slugHyphen !== trimmed) {
        const { data: bySlugHy } = await dir
          .from("vc_firms")
          .select("id")
          .eq("slug", slugHyphen)
          .is("deleted_at", null)
          .maybeSingle();
        if (bySlugHy?.id) return bySlugHy.id as string;
      }
    }

    const { data: aliasRows, error: aliasErr } = await dir
      .from("vc_firm_aliases")
      .select("firm_id")
      .ilike("alias_value", trimmed)
      .limit(1);
    if (!aliasErr && aliasRows?.[0]?.firm_id) {
      const viaAlias = await verifyVcFirmId(aliasRows[0].firm_id as string);
      if (viaAlias) return viaAlias;
    }

    if (trimmed.includes(".")) {
      const safeHost = escapeIlikeWildcards(trimmed);
      const { data: byUrl } = await dir
        .from("vc_firms")
        .select("id")
        .ilike("website_url", `%${safeHost}%`)
        .is("deleted_at", null)
        .limit(1);
      if (byUrl?.[0]?.id) return byUrl[0].id as string;
    }

    const { data: invRow, error: invErr } = await supabase
      .from("investor_database")
      .select("firm_name, legal_name, prisma_firm_id, website_url")
      .eq("id", trimmed)
      .maybeSingle();

    if (!invErr && invRow) {
      const prismaId =
        invRow && typeof invRow === "object" && typeof (invRow as { prisma_firm_id?: string }).prisma_firm_id === "string"
          ? (invRow as { prisma_firm_id: string }).prisma_firm_id.trim()
          : "";
      if (prismaId) {
        const linked = await verifyVcFirmId(prismaId);
        if (linked) return linked;
      }

      const invWeb =
        typeof (invRow as { website_url?: string }).website_url === "string"
          ? (invRow as { website_url: string }).website_url.trim()
          : "";
      const invHost = parseWebsiteHost(invWeb);
      if (invHost) {
        const byInvUrl = await resolveByWebsiteHost(invHost);
        if (byInvUrl) return byInvUrl;
      }

      const fn = typeof (invRow as { firm_name?: string }).firm_name === "string" ? (invRow as { firm_name: string }).firm_name.trim() : "";
      const ln = typeof (invRow as { legal_name?: string }).legal_name === "string" ? (invRow as { legal_name: string }).legal_name.trim() : "";

      for (const label of [fn, ln].filter(Boolean)) {
        const mapped = await resolveByName(label);
        if (mapped) return mapped;
      }
    }
  }

  const urlHost = parseWebsiteHost(ctx?.websiteUrl);
  if (urlHost) {
    const w = await resolveByWebsiteHost(urlHost);
    if (w) return w;
  }

  if (mdmFirms.length > 0) {
    const trimmedHint = hint?.trim();
    if (trimmedHint) {
      const mdm = mdmFirms.find((f) => f.id === trimmedHint);
      if (mdm) {
        const byN = await resolveByName(mdm.name);
        if (byN) return byN;
        const mh = parseWebsiteHost(mdm.website_url) || parseWebsiteHost(`https://${mdm.id}`);
        if (mh) {
          const byW = await resolveByWebsiteHost(mh);
          if (byW) return byW;
        }
      }
    }
    const nn = normalizeFirmLabel(name).toLowerCase();
    if (nn) {
      const mdmN = mdmFirms.find((f) => normalizeFirmLabel(f.name).toLowerCase() === nn);
      if (mdmN && (!trimmedHint || mdmN.id !== trimmedHint)) {
        const byN = await resolveByName(mdmN.name);
        if (byN) return byN;
        const mh = parseWebsiteHost(mdmN.website_url) || parseWebsiteHost(`https://${mdmN.id}`);
        if (mh) {
          const byW = await resolveByWebsiteHost(mh);
          if (byW) return byW;
        }
      }
    }
  }

  return resolveByName(name);
}

/** Keys that must form a complete v2 “Characterize interaction” step for unlinked reviews. */
const UNLINKED_CONTEXT_ANSWER_KEYS = [
  "interaction_intro",
  "interaction_intro_other",
  "interaction_warm_intro_who",
  "interaction_cold_inbound_discovery",
  "interaction_cold_inbound_social_platform",
  "interaction_cold_inbound_social_other",
  "interaction_event_type",
  "interaction_event_type_other",
  "interaction_event_followup",
  "interaction_event_followup_first",
  "interaction_how",
  "interaction_meeting_depth",
] as const;

function sanitizeHydratedUnlinkedAnswers(
  loaded: Record<string, string | string[]>,
): Record<string, string | string[]> {
  let next = { ...loaded };
  if (!isContextStepValidUnlinked(next)) {
    for (const k of UNLINKED_CONTEXT_ANSWER_KEYS) {
      delete next[k];
    }
  }
  if (!isEvaluationStepValidUnlinked(next)) {
    const { overall_interaction: _o, would_engage_again: _w, ...rest } = next;
    next = rest;
  }
  return next;
}

function formatReviewSubmitError(err: unknown): string {
  const rlsHint =
    "Saving needs a valid Supabase session: enable Clerk’s Supabase third-party integration (or a JWT template named “supabase”) so your user id matches the review author, then sign out and back in.";

  const fromParts = (message: string, code?: string, details?: string, hint?: string) => {
    const bits = [message];
    if (details?.trim()) bits.push(details.trim());
    if (hint?.trim()) bits.push(hint.trim());
    if (code?.trim()) bits.push(`[${code.trim()}]`);
    const text = [...new Set(bits.filter(Boolean))].join(" — ");
    if (/row-level security|rls|42501|permission denied for table|violates row-level security/i.test(text)) {
      return `${text} ${rlsHint}`;
    }
    return text;
  };

  if (err instanceof Error) {
    const ex = err as Error & { details?: string; code?: string; hint?: string };
    return fromParts(ex.message, ex.code, ex.details, ex.hint);
  }

  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const message =
      (typeof o.message === "string" && o.message) ||
      (typeof o.error_description === "string" && o.error_description) ||
      (typeof o.msg === "string" && o.msg) ||
      "";
    const code = typeof o.code === "string" ? o.code : "";
    const details = typeof o.details === "string" ? o.details : "";
    const hint = typeof o.hint === "string" ? o.hint : "";
    if (message) return fromParts(message, code, details, hint);
  }

  return "Failed to submit rating";
}

function isVcPersonFkViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { code?: string; message?: string; details?: string };
  const blob = `${o.code ?? ""} ${o.message ?? ""} ${o.details ?? ""}`.toLowerCase();
  return (
    o.code === "23503" ||
    (blob.includes("vc_person") && (blob.includes("foreign key") || blob.includes("violates")))
  );
}

type VcRatingInsertPayload = Record<string, unknown>;

async function upsertVcRatingRow(opts: {
  supabaseClient: typeof supabase;
  reviewRecordId: string | null;
  userId: string;
  payload: VcRatingInsertPayload;
}): Promise<{ savedAsRevision: boolean }> {
  const { supabaseClient, reviewRecordId, userId, payload } = opts;

  const insertWithPersonFallback = async (p: VcRatingInsertPayload) => {
    const { error } = await supabaseClient.from("vc_ratings").insert(p);
    if (!error) return null;
    if (isVcPersonFkViolation(error) && p.vc_person_id) {
      const { error: e2 } = await supabaseClient
        .from("vc_ratings")
        .insert({ ...p, vc_person_id: null });
      return e2;
    }
    return error;
  };

  const throwIfSupabaseError = (error: unknown, fallback: string) => {
    if (!error) return;
    if (error instanceof Error) throw error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const o = error as { message?: string; details?: string; hint?: string; code?: string };
      const e = new Error(typeof o.message === "string" && o.message ? o.message : fallback);
      (e as Error & { details?: string; code?: string; hint?: string }).details = o.details;
      (e as Error & { details?: string; code?: string; hint?: string }).hint = o.hint;
      (e as Error & { details?: string; code?: string; hint?: string }).code = o.code;
      throw e;
    }
    throw new Error(fallback);
  };

  if (reviewRecordId) {
    const { error: updateError } = await supabaseClient
      .from("vc_ratings")
      .update(payload)
      .eq("id", reviewRecordId)
      .eq("author_user_id", userId);
    if (!updateError) return { savedAsRevision: false };

    const insertErr = await insertWithPersonFallback(payload);
    if (!insertErr) return { savedAsRevision: true };
    throwIfSupabaseError(insertErr, "Could not save your review after update failed.");
  }

  const insertErr = await insertWithPersonFallback(payload);
  if (!insertErr) return { savedAsRevision: false };
  throwIfSupabaseError(insertErr, "Could not save your review.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ReviewSubmissionModal({
  open,
  onClose,
  firmName,
  firmLogoUrl: firmLogoUrlProp,
  firmWebsiteUrl,
  vcFirmId,
  personId = "",
  personName,
  investorIsMappedToProfile,
  mappingRecordId,
  companyId = "",
}: ReviewSubmissionModalProps) {
  const { user } = useAuth();
  const { firms, firmMap, getPartnersForFirm } = useVCDirectory();
  const mdmFirmsForResolve = useMemo(() => [...firmMap.values()] as MdmFirmLite[], [firmMap]);

  // Build form config from the mapping decision
  const formConfig = useMemo(
    () =>
      buildReviewFormConfig({
        firm_id: vcFirmId ?? "",
        company_id: companyId || user?.id || "",
        mapping_record_id: mappingRecordId,
        investor_is_mapped_to_profile: investorIsMappedToProfile,
        firm_name: firmName,
      }),
    [vcFirmId, companyId, mappingRecordId, investorIsMappedToProfile, firmName, user?.id],
  );

  // ── Answer state ──────────────────────────────────────────────────────────
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [rememberWho, setRememberWho] = useState("");
  const [firmPartnerChips, setFirmPartnerChips] = useState<{ id: string; name: string }[]>([]);
  const [rememberWhoPersonIds, setRememberWhoPersonIds] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(true);
  const [reviewRecordId, setReviewRecordId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<ReviewWizardStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fetchedHeaderFirm, setFetchedHeaderFirm] = useState<{
    logo: string | null;
    website: string | null;
    name: string | null;
  } | null>(null);

  const logoUrlFromProp = useMemo(() => {
    if (firmLogoUrlProp == null) return null;
    const t = String(firmLogoUrlProp).trim();
    return t.length > 0 ? t : null;
  }, [firmLogoUrlProp]);

  /** Same firm id as `vc_mdm_output.json` when `vcFirmId` is set; else match directory firm by name. */
  const directoryFirmId = useMemo(() => {
    const hint = vcFirmId?.trim();
    if (hint) return hint;
    const n = firmName.trim().toLowerCase();
    if (!n) return "";
    const exact = firms.find((f) => (f.name || "").trim().toLowerCase() === n);
    if (exact?.id) return exact.id;
    if (n.length < 4) return "";
    const loose = firms.find((f) => {
      const fn = (f.name || "").trim().toLowerCase();
      if (fn.length < 4) return false;
      return fn.startsWith(n) || n.startsWith(fn) || fn.includes(n) || n.includes(fn);
    });
    return loose?.id ?? "";
  }, [vcFirmId, firmName, firms]);

  const headerLogoUrlResolved = logoUrlFromProp ?? fetchedHeaderFirm?.logo ?? null;
  const headerWebsiteResolved =
    (firmWebsiteUrl && firmWebsiteUrl.trim()) || fetchedHeaderFirm?.website || undefined;
  const headerFirmDisplayName =
    (firmName && firmName.trim()) || fetchedHeaderFirm?.name?.trim() || "Firm";

  const resolveVcFirmCtx = useMemo(
    () => ({
      websiteUrl: headerWebsiteResolved?.trim() || null,
      mdmFirms: mdmFirmsForResolve,
    }),
    [headerWebsiteResolved, mdmFirmsForResolve],
  );

  const vcFirmResolveHint = useMemo(
    () => vcFirmId?.trim() || directoryFirmId.trim() || null,
    [vcFirmId, directoryFirmId],
  );

  const directoryPartnerChips = useMemo(() => {
    if (!directoryFirmId) return [] as { id: string; name: string }[];
    return getPartnersForFirm(directoryFirmId)
      .map((p) => {
        const name =
          (p.preferred_name && p.preferred_name.trim()) ||
          (p.full_name && p.full_name.trim()) ||
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
        const id = typeof p.id === "string" ? p.id.trim() : "";
        if (!id || !name) return null;
        return { id, name };
      })
      .filter((x): x is { id: string; name: string } => Boolean(x));
  }, [directoryFirmId, getPartnersForFirm]);

  /** Supabase `vc_people` (when configured) + static VC directory JSON for the same firm. */
  const mergedFirmPartnerChips = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const c of firmPartnerChips) {
      if (c.id && c.name.trim()) byId.set(c.id, c);
    }
    for (const c of directoryPartnerChips) {
      if (c.id && c.name.trim() && !byId.has(c.id)) byId.set(c.id, c);
    }
    return Array.from(byId.values());
  }, [firmPartnerChips, directoryPartnerChips]);

  const rememberWhoChips = useMemo((): RememberWhoChipOption[] => {
    const out: RememberWhoChipOption[] = [];
    const seen = new Set<string>();
    const add = (name: string, vcPersonId?: string) => {
      const t = name.trim();
      if (!t) return;
      const k = t.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(vcPersonId ? { name: t, vcPersonId } : { name: t });
    };
    const pn = personName?.trim();
    const pid = personId?.trim();
    if (pn) add(pn, pid || undefined);
    for (const p of mergedFirmPartnerChips) add(p.name, p.id);
    return out;
  }, [personName, personId, mergedFirmPartnerChips]);

  const applyRememberWhoChip = useCallback((name: string, vcPersonId?: string) => {
    setRememberWho((prev) => {
      const t = prev.trim();
      if (!t) return name;
      if (t.toLowerCase().includes(name.toLowerCase())) return t;
      return `${t}, ${name}`;
    });
    if (vcPersonId) {
      setRememberWhoPersonIds((prev) => (prev.includes(vcPersonId) ? prev : [...prev, vcPersonId]));
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setFirmPartnerChips([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const resolvedFirmId = await resolveVcFirmId(firmName, vcFirmResolveHint, resolveVcFirmCtx);
      if (!resolvedFirmId || cancelled) {
        if (!cancelled) setFirmPartnerChips([]);
        return;
      }
      try {
        const { data, error } = await (supabaseVcDirectory as unknown as { from: (t: string) => any })
          .from("vc_people")
          .select("id, first_name, last_name, preferred_name")
          .eq("firm_id", resolvedFirmId)
          .is("deleted_at", null)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true })
          .limit(48);
        if (cancelled || error) {
          if (import.meta.env.DEV && error) {
            console.warn("[ReviewSubmissionModal] vc_people fetch failed:", error);
          }
          if (!cancelled) setFirmPartnerChips([]);
          return;
        }
        const rows = (data ?? []) as {
          id?: string;
          first_name?: string;
          last_name?: string;
          preferred_name?: string;
        }[];
        const chips: { id: string; name: string }[] = [];
        const seen = new Set<string>();
        for (const row of rows) {
          const id = typeof row.id === "string" ? row.id.trim() : "";
          const label = formatVcPersonChipName(row);
          if (!id || !label) continue;
          const k = label.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          chips.push({ id, name: label });
        }
        if (!cancelled) setFirmPartnerChips(chips);
      } catch {
        if (!cancelled) setFirmPartnerChips([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, firmName, vcFirmResolveHint, resolveVcFirmCtx]);

  useEffect(() => {
    if (!open) {
      setFetchedHeaderFirm(null);
      return;
    }
    if (logoUrlFromProp && firmName.trim()) {
      setFetchedHeaderFirm(null);
      return;
    }
    if (!vcFirmId) {
      setFetchedHeaderFirm(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabaseVcDirectory as unknown as { from: (t: string) => any })
          .from("vc_firms")
          .select("firm_name, logo_url, website_url")
          .eq("id", vcFirmId)
          .is("deleted_at", null)
          .maybeSingle();
        if (cancelled || error) return;
        const logo =
          typeof data?.logo_url === "string" && data.logo_url.trim().length > 0 ? data.logo_url.trim() : null;
        const website =
          typeof data?.website_url === "string" && data.website_url.trim().length > 0
            ? data.website_url.trim()
            : null;
        const name =
          typeof data?.firm_name === "string" && data.firm_name.trim().length > 0
            ? data.firm_name.trim()
            : null;
        if (!cancelled) setFetchedHeaderFirm({ logo, website, name });
      } catch {
        if (!cancelled) setFetchedHeaderFirm(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, vcFirmId, logoUrlFromProp, firmName]);

  useEffect(() => {
    if (!open || !user) {
      setReviewRecordId(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const resolvedFirmId = await resolveVcFirmId(firmName, vcFirmResolveHint, resolveVcFirmCtx);
        if (!resolvedFirmId || cancelled) return;

        const pid = personId?.trim() || null;
        let query = (supabase as unknown as { from: (t: string) => any })
          .from("vc_ratings")
          .select("id, anonymous, comment, star_ratings, created_at")
          .eq("author_user_id", user.id)
          .eq("vc_firm_id", resolvedFirmId)
          .order("created_at", { ascending: false })
          .limit(1);

        query = pid ? query.eq("vc_person_id", pid) : query.is("vc_person_id", null);

        const { data, error } = await query;
        if (cancelled || error) return;

        const row = data?.[0] as {
          id?: string;
          anonymous?: boolean;
          comment?: string | null;
          star_ratings?: {
            answers?: Record<string, string | string[]>;
            tags?: string[];
            remember_who?: string;
            remember_who_vc_person_ids?: unknown;
          } | null;
        } | undefined;

        if (!row?.id) {
          if (!cancelled) setReviewRecordId(null);
          return;
        }

        const sr = row.star_ratings ?? null;
        const loadedAnswers =
          sr && sr.answers && typeof sr.answers === "object" ? { ...sr.answers } : {};

        if (!loadedAnswers.founder_note && typeof row.comment === "string" && row.comment.trim()) {
          loadedAnswers.founder_note = row.comment.trim();
        }

        const answersToApply = investorIsMappedToProfile
          ? loadedAnswers
          : sanitizeHydratedUnlinkedAnswers(loadedAnswers);

        if (!cancelled) {
          setReviewRecordId(row.id);
          setAnswers(answersToApply);
          setSelectedTags(Array.isArray(sr?.tags) ? sr.tags.filter((t) => typeof t === "string") : []);
          setRememberWho(typeof sr?.remember_who === "string" ? sr.remember_who : "");
          const rawIds = sr?.remember_who_vc_person_ids;
          const ids = Array.isArray(rawIds)
            ? rawIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            : [];
          setRememberWhoPersonIds(ids);
          setAnonymous(typeof row.anonymous === "boolean" ? row.anonymous : true);
        }
      } catch {
        if (!cancelled) setReviewRecordId(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, user, firmName, vcFirmResolveHint, resolveVcFirmCtx, personId, investorIsMappedToProfile]);

  const setAnswer = useCallback((id: string, value: string | string[]) => {
    setAnswers((prev) => {
      const next: Record<string, string | string[]> = { ...prev, [id]: value };

      // When relationship origin changes, clear related conditional fields
      if (id === "interaction_intro") {
        delete next.interaction_intro_other;
        delete next.interaction_warm_intro_who;
        delete next.interaction_cold_inbound_discovery;
        delete next.interaction_cold_inbound_social_platform;
        delete next.interaction_cold_inbound_social_other;
        delete next.interaction_event_type;
        delete next.interaction_event_type_other;
        delete next.interaction_event_followup;
        delete next.interaction_event_followup_first;

        const intro = typeof value === "string" ? value : "";
        const how = next.interaction_how;
        const howArr = Array.isArray(how) ? [...how] : [];
        if (intro === "Cold inbound" || intro === "Cold outbound") {
          if (!howArr.includes("Email")) {
            next.interaction_how = [...howArr, "Email"];
          }
        } else if (intro === "Event") {
          if (!howArr.includes("In-Person")) {
            next.interaction_how = [...howArr, "In-Person"];
          }
        }
      }

      return next;
    });
  }, []);

  // ── Reset on close ────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setAnswers({});
    setSelectedTags([]);
    setRememberWho("");
    setRememberWhoPersonIds([]);
    setReviewRecordId(null);
    setFirmPartnerChips([]);
    setFetchedHeaderFirm(null);
    setAnonymous(true);
    setCurrentStep(1);
    setSubmitted(false);
  }, []);

  useEffect(() => {
    if (!investorIsMappedToProfile && selectedTags.length === 0) {
      setRememberWho("");
      setRememberWhoPersonIds([]);
      setAnswers((prev) => {
        if (!prev.founder_note) return prev;
        const next = { ...prev };
        delete next.founder_note;
        return next;
      });
    }
  }, [selectedTags.length, investorIsMappedToProfile]);

  /** Drop tag selections that are not valid for the current 1–10 experience score tier. */
  useEffect(() => {
    if (investorIsMappedToProfile) return;
    const allowed = new Set(
      nonInvestorTagsForOverallScore(answers.overall_interaction as string | undefined),
    );
    setSelectedTags((prev) => {
      const next = prev.filter((t) => allowed.has(t));
      return next.length === prev.length ? prev : next;
    });
  }, [investorIsMappedToProfile, answers.overall_interaction]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const showFounderNote = investorIsMappedToProfile || selectedTags.length > 0;

  const founderNoteQuestion = useMemo(
    () => formConfig.questions.find((q) => q.id === "founder_note"),
    [formConfig.questions],
  );

  const wizardTotalSteps = investorIsMappedToProfile ? 3 : 4;

  const onWizardNext = useCallback(() => {
    setCurrentStep((s) =>
      s < wizardTotalSteps ? ((s + 1) as ReviewWizardStep) : s,
    );
  }, [wizardTotalSteps]);

  const onWizardBack = useCallback(() => {
    setCurrentStep((s) => (s > 1 ? ((s - 1) as ReviewWizardStep) : s));
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────
  const canSubmit = useMemo(() => {
    if (investorIsMappedToProfile) {
      // Investor form: work_with_them_rating + take_money_again required
      return (
        typeof answers.work_with_them_rating === "string" &&
        answers.work_with_them_rating.length > 0 &&
        typeof answers.take_money_again === "string" &&
        answers.take_money_again.length > 0
      );
    } else {
      return (
        isContextStepValidUnlinked(answers) && isEvaluationStepValidUnlinked(answers)
      );
    }
  }, [answers, investorIsMappedToProfile]);

  const canGoNext = useMemo(
    () => canAdvanceWizardStep(currentStep, investorIsMappedToProfile, answers),
    [currentStep, investorIsMappedToProfile, answers],
  );

  const founderNoteVal = (answers.founder_note as string) ?? "";

  const summaryAside = useMemo(() => {
    const standout = (Array.isArray(answers.standout_tags) ? answers.standout_tags : []) as string[];
    if (investorIsMappedToProfile) {
      return (
        <ReviewWizardSummaryPanel
          investorIsMappedToProfile
          contextLine={formatLinkedEvaluationSummary(answers)}
          evaluationLine={formatTagsSummary(standout)}
          noteLine={formatNoteSummary(founderNoteVal)}
        />
      );
    }
    return (
      <ReviewWizardSummaryPanel
        investorIsMappedToProfile={false}
        contextLine={formatUnlinkedContextSummary(answers, rememberWho)}
        evaluationLine={formatUnlinkedEvaluationSummary(answers)}
        tagsLine={formatTagsSummary(selectedTags)}
        noteLine={formatNoteSummary(founderNoteVal)}
      />
    );
  }, [investorIsMappedToProfile, answers, rememberWho, selectedTags, founderNoteVal]);

  useEffect(() => {
    if (!open || submitted) return;
    const id = requestAnimationFrame(() => {
      const el = document.querySelector("[data-review-wizard-step]");
      if (el instanceof HTMLElement) el.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [currentStep, open, submitted]);

  // ── Submission ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!user) {
      toast.error("Sign in to submit a review.");
      return;
    }
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const resolvedFirmId = await resolveVcFirmId(firmName, vcFirmResolveHint, resolveVcFirmCtx);

      const pid = personId?.trim() || null;

      // Build structured payload stored in star_ratings JSONB
      const structuredAnswers = {
        form_version: "v2",
        review_type: formConfig.review_type,
        answers,
        tags: selectedTags,
        remember_who: rememberWho.trim() || undefined,
        remember_who_vc_person_ids:
          rememberWhoPersonIds.length > 0 ? rememberWhoPersonIds : undefined,
        // Preserve firm name for linkage even when vc_firm_id could not be resolved
        firm_name: firmName.trim() || undefined,
      };

      // Derive legacy score columns for backward-compat with aggregation
      const scores = investorIsMappedToProfile
        ? deriveInvestorScores(answers)
        : deriveNonInvestorScores(answers);

      // interaction_type column: map the full context to a key
      const interactionTypeValue = investorIsMappedToProfile
        ? "investor_relationship"
        : deriveInteractionTypeKey(
            answers.interaction_intro as string | undefined,
            (answers.interaction_how as string[]) || [],
          );

      const payload = {
        author_user_id: user.id,
        vc_firm_id: resolvedFirmId,
        vc_person_id: pid,
        interaction_type: interactionTypeValue,
        interaction_detail: null,
        interaction_date: null,
        ...scores,
        comment: (answers.founder_note as string | undefined)?.trim() || null,
        anonymous,
        verified: false,
        is_draft: false,
        star_ratings: structuredAnswers,
      };

      let savedAsRevision = false;

      if (isSupabaseConfigured) {
        const edge = await submitVcRatingViaEdge({
          supabaseClient: supabase,
          userId: user.id,
          reviewRecordId,
          payload,
        });
        if (edge.ok) {
          savedAsRevision = edge.savedAsRevision;
        } else if (edge.fallbackToDirect) {
          const result = await upsertVcRatingRow({
            supabaseClient: supabase,
            reviewRecordId,
            userId: user.id,
            payload,
          });
          savedAsRevision = result.savedAsRevision;
        }
      } else {
        const result = await upsertVcRatingRow({
          supabaseClient: supabase,
          reviewRecordId,
          userId: user.id,
          payload,
        });
        savedAsRevision = result.savedAsRevision;
      }

      setSubmitted(true);
      toast.success(
        reviewRecordId
          ? savedAsRevision
            ? "Your edit was saved as a new review revision."
            : anonymous
              ? "Your review was updated (anonymous)."
              : "Your review was updated."
          : anonymous
            ? "Thanks — your rating was submitted anonymously."
            : "Thanks — your rating was submitted.",
      );

      setTimeout(() => handleClose(), 1800);
    } catch (err) {
      console.error("[ReviewSubmissionModal] submit failed", err);
      toast.error(formatReviewSubmitError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const modalLayer = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — portaled to body so we are not clipped/stacked under main / other modals */}
          <motion.div
            className="fixed inset-0 z-[300] bg-foreground/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[310] flex max-h-[100dvh] items-start justify-center overflow-x-hidden overflow-y-auto p-3 pb-2 pt-4 sm:p-4 sm:pt-6 pointer-events-none [scrollbar-gutter:stable]">
            <motion.div
              data-vekta-review-modal="true"
              className="pointer-events-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
              style={{
                // Definite height so nested flex-1 / min-h-0 scroll regions work (max-h-only flex parents collapse).
                height: "min(92dvh, calc(100dvh - 3.25rem))",
                maxHeight: "min(92dvh, calc(100dvh - 3.25rem))",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className={cn(
                  "flex shrink-0 items-center justify-between border-b border-border bg-secondary/20 px-5",
                  !submitted && currentStep === 2 ? "py-3" : "py-4",
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FirmLogo
                    firmName={headerFirmDisplayName}
                    logoUrl={headerLogoUrlResolved}
                    websiteUrl={headerWebsiteResolved}
                    size="md"
                    className="bg-background"
                  />
                  <h3 className="text-sm font-bold text-foreground truncate min-w-0">{headerFirmDisplayName}</h3>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {submitted ? (
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                  <SuccessState />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div
                    className={cn(
                      "shrink-0 border-b border-border/60 bg-secondary/10",
                      currentStep === 2 ? "px-4 pb-2 pt-0.5" : "px-5 pb-3 pt-1",
                    )}
                  >
                    <ReviewWizardProgressBar
                      step={currentStep}
                      totalSteps={wizardTotalSteps}
                      investorIsMappedToProfile={investorIsMappedToProfile}
                      compact={currentStep === 2}
                    />
                  </div>

                  <ReviewWizardBody
                    step={currentStep}
                    summary={summaryAside}
                    compactMainColumn={currentStep === 2}
                  >
                    {investorIsMappedToProfile ? (
                      <>
                        {currentStep === 1 ? (
                          <ReviewWizardLinkedStep1
                            formConfig={formConfig}
                            answers={answers}
                            setAnswer={setAnswer}
                          />
                        ) : null}
                        {currentStep === 2 ? (
                          <ReviewWizardLinkedStep2
                            formConfig={formConfig}
                            answers={answers}
                            setAnswer={setAnswer}
                            rememberWho={rememberWho}
                            setRememberWho={setRememberWho}
                            rememberWhoChips={rememberWhoChips}
                            rememberWhoPersonIds={rememberWhoPersonIds}
                            applyRememberWhoChip={applyRememberWhoChip}
                            onRememberWhoRoleFallback={() => setRememberWhoPersonIds([])}
                          />
                        ) : null}
                      </>
                    ) : (
                      <>
                        {currentStep === 1 ? (
                          <ReviewWizardUnlinkedStep1
                            formConfig={formConfig}
                            answers={answers}
                            setAnswer={setAnswer}
                            firmDisplayName={headerFirmDisplayName}
                          />
                        ) : null}
                        {currentStep === 2 ? (
                          <ReviewWizardUnlinkedStep3
                            formConfig={formConfig}
                            answers={answers}
                            setAnswer={setAnswer}
                          />
                        ) : null}
                        {currentStep === 3 ? (
                          <ReviewWizardUnlinkedStep4
                            formConfig={formConfig}
                            answers={answers}
                            selectedTags={selectedTags}
                            setSelectedTags={setSelectedTags}
                            rememberWho={rememberWho}
                            setRememberWho={setRememberWho}
                            rememberWhoChips={rememberWhoChips}
                            rememberWhoPersonIds={rememberWhoPersonIds}
                            applyRememberWhoChip={applyRememberWhoChip}
                            onRememberWhoRoleFallback={() => setRememberWhoPersonIds([])}
                          />
                        ) : null}
                      </>
                    )}

                    {((investorIsMappedToProfile && currentStep === 3) ||
                      (!investorIsMappedToProfile && currentStep === 4)) ? (
                      <ReviewWizardNoteStep
                        formConfig={formConfig}
                        founderNoteQuestion={founderNoteQuestion}
                        answers={answers}
                        setAnswer={setAnswer}
                        showFounderNote={showFounderNote}
                        anonymous={anonymous}
                        setAnonymous={setAnonymous}
                      />
                    ) : null}
                  </ReviewWizardBody>

                  <ReviewWizardFooter
                    step={currentStep}
                    totalSteps={wizardTotalSteps}
                    canGoNext={canGoNext}
                    canSubmit={canSubmit}
                    submitting={submitting}
                    onBack={onWizardBack}
                    onNext={onWizardNext}
                    onSubmit={handleSubmit}
                    onCancel={handleClose}
                    compact={currentStep === 2}
                  />
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalLayer, document.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Success state
// ─────────────────────────────────────────────────────────────────────────────

function SuccessState() {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 px-6"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mb-4">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-1">Thank you</h3>
      <p className="text-sm text-muted-foreground text-center">
        Your feedback helps founders choose the right investors.
      </p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: map display label → interaction_type DB key
// ─────────────────────────────────────────────────────────────────────────────

function deriveInteractionTypeKey(
  relationshipOrigin: string | undefined,
  channels: string[],
): string {
  if (!relationshipOrigin) return "other";

  // Very simple mapping: derive from origin and presence of meeting channels
  const hasInPersonOrVideo = channels.some((c) =>
    ["In-Person", "Video"].includes(c),
  );
  const hasEmailOnly = channels.length === 1 && channels[0] === "Email";

  switch (relationshipOrigin) {
    case "Warm intro":
      return hasEmailOnly ? "email" : "meeting";
    case "Cold inbound":
      return hasEmailOnly ? "email" : "intro";
    case "Cold outbound":
      return hasEmailOnly ? "email" : "intro";
    case "Event":
      return hasInPersonOrVideo ? "meeting" : "ongoing";
    case "Community":
      return hasInPersonOrVideo ? "meeting" : "ongoing";
    case "Existing relationship":
      return hasEmailOnly ? "email" : "ongoing";
    default:
      return "other";
  }
}
