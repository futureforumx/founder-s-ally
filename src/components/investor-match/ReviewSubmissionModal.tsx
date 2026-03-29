import { useState, useMemo, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  X,
  Star,
  CheckCircle2,
  Send,
  Loader2,
  HeartHandshake,
  Inbox,
  CalendarDays,
  UsersRound,
  MoreHorizontal,
  Calendar,
  Briefcase,
  User,
  CircleHelp,
  Mail,
  Globe,
  Link2,
  AtSign,
  Check,
  Mic2,
  Sparkles,
  UtensilsCrossed,
  Home,
  Clock,
  Twitter,
  Linkedin,
  Newspaper,
  MapPin,
  Video,
  Users,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { trackMixpanelEvent } from "@/lib/mixpanel";
import {
  formatRememberWhoForInteractionDetail,
  getRememberedRoleKeysFromAnswers,
  getIncludedUnknownOthers,
  rememberWhoSubsectionSatisfied,
  computeParticipantMemoryMode,
  countRememberedNames,
  toggleParticipantRole,
  withParticipantMemoryMode,
  PARTICIPANT_MEMORY_ANSWER_KEYS,
  PARTICIPANT_ROLE_OPTIONS,
  isPlausibleFreeTextParticipantName,
  REMEMBER_WHO_NAME_REJECT_TOAST,
  type ParticipantRoleKey,
} from "@/lib/reviewParticipantMemory";
import { supabase, supabaseVcDirectory, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  buildReviewFormConfig,
  deriveNonInvestorScores,
  deriveInvestorScores,
  deriveInteractionTypeFromCharacterization,
} from "@/lib/buildReviewFormConfig";
import {
  CHARACTERIZE_INTRO_OPTIONS,
  CHARACTERIZE_WARM_INTRO_WHO_INITIATED,
  CHARACTERIZE_COLD_INBOUND_DISCOVERY,
  CHARACTERIZE_COLD_INBOUND_SOCIAL_PLATFORMS,
  CHARACTERIZE_EVENT_TYPES,
  CHARACTERIZE_EVENT_FOLLOWUP,
  CHARACTERIZE_EVENT_FOLLOWUP_FIRST,
  EVENT_TYPE_DISPLAY_LABELS,
  CHARACTERIZE_INTERACTION_HOW,
  nonInvestorTagsForOverallScore,
} from "@/lib/reviewFormContent";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewSubmissionModalProps {
  open: boolean;
  onClose: () => void;
  firmName: string;
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
  /** While true, form body is deferred so we don’t flash the unlinked form before cap_table loads */
  investorMappingLoading?: boolean;
  /** Founder's company id — stored in star_ratings JSONB for traceability */
  companyId?: string;
  /**
   * People shown on the investor card (JSON directory, DB partners, mocks) — suggested in
   * “Remember who?” even when `vcFirmId` is an investor DB UUID or missing.
   */
  cardLinkedContactOptions?: DirectoryPersonOption[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveVcFirmId(
  firmName: string,
  hint: string | null | undefined,
): Promise<string | null> {
  const trimmed = hint?.trim();
  if (trimmed) return trimmed;
  const { data, error } = await (
    supabaseVcDirectory as unknown as { from: (t: string) => any }
  )
    .from("vc_firms")
    .select("id")
    .ilike("firm_name", firmName.trim())
    .limit(1);
  if (error || !data?.[0]?.id) return null;
  return data[0].id as string;
}

type DirectoryPersonOption = { id: string; label: string; subtitle: string | null };

/** Card-linked people first, then API — dedupe by display name (case-insensitive). */
function mergeDirectoryPersonOptions(
  cardLinked: DirectoryPersonOption[] | undefined,
  fromApi: DirectoryPersonOption[],
): DirectoryPersonOption[] {
  const seen = new Set<string>();
  const out: DirectoryPersonOption[] = [];
  const add = (o: DirectoryPersonOption) => {
    const k = o.label.toLowerCase().trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(o);
  };
  for (const o of cardLinked ?? []) add(o);
  for (const o of fromApi) add(o);
  return out;
}

function displayVcPersonName(row: {
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
}): string {
  const pref = row.preferred_name?.trim();
  if (pref) return pref;
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
}

async function fetchVcFirmPeopleOptions(firmId: string): Promise<DirectoryPersonOption[]> {
  const client = supabaseVcDirectory as unknown as { from: (t: string) => any };
  const { data, error } = await client
    .from("vc_people")
    .select("id, first_name, last_name, preferred_name, title")
    .eq("firm_id", firmId)
    .is("deleted_at", null)
    .order("last_name", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return data.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    label: displayVcPersonName({
      first_name: (row.first_name as string) ?? null,
      last_name: (row.last_name as string) ?? null,
      preferred_name: (row.preferred_name as string) ?? null,
    }) || "Unknown",
    subtitle: typeof row.title === "string" && row.title.trim() ? row.title.trim() : null,
  }));
}

type RememberWhoEntry = { name: string; vc_person_id: string | null };

const REMEMBER_WHO_MAX_ENTRIES = 24;
const REMEMBER_WHO_NAME_MAX = 120;

function rememberWhoEntriesFromAnswers(answers: Record<string, string | string[]>): RememberWhoEntry[] {
  const names = answers.interaction_remembered_who_names;
  const ids = answers.interaction_remembered_who_vc_person_ids;
  if (!Array.isArray(names)) return [];
  const idArr = Array.isArray(ids) ? ids : [];
  return names.map((name, i) => ({
    name: String(name),
    vc_person_id:
      typeof idArr[i] === "string" && idArr[i].trim().length > 0 ? String(idArr[i]).trim() : null,
  }));
}

function RememberWhoSection({
  inputId,
  entries,
  onEntriesChange,
  options,
  firmCardLinkedInvestorCount,
  selectedRoles,
  onRolesChange,
  includedUnknownOthers,
  onIncludedUnknownOthersChange,
}: {
  inputId: string;
  entries: RememberWhoEntry[];
  onEntriesChange: (next: RememberWhoEntry[]) => void;
  options: DirectoryPersonOption[];
  /** Count of people on the investor firm card (passed from `cardLinkedContactOptions`). */
  firmCardLinkedInvestorCount: number;
  selectedRoles: ParticipantRoleKey[];
  onRolesChange: (next: ParticipantRoleKey[]) => void;
  includedUnknownOthers: boolean;
  onIncludedUnknownOthersChange: (next: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [showRoleFallback, setShowRoleFallback] = useState(() => selectedRoles.length > 0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rolesLenRef = useRef(selectedRoles.length);

  useEffect(() => {
    if (selectedRoles.length > 0 && rolesLenRef.current === 0) {
      setShowRoleFallback(true);
    }
    rolesLenRef.current = selectedRoles.length;
  }, [selectedRoles.length]);

  useEffect(() => {
    if (!listOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setListOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [listOpen]);

  const isDuplicate = useCallback(
    (name: string, vc_person_id: string | null) => {
      const n = name.trim().toLowerCase();
      if (vc_person_id && entries.some((e) => e.vc_person_id === vc_person_id)) return true;
      return entries.some((e) => e.name.trim().toLowerCase() === n);
    },
    [entries],
  );

  const tryAdd = useCallback(
    (name: string, vc_person_id: string | null) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > REMEMBER_WHO_NAME_MAX) return;
      if (entries.length >= REMEMBER_WHO_MAX_ENTRIES) return;
      if (isDuplicate(trimmed, vc_person_id)) return;
      if (!vc_person_id && !isPlausibleFreeTextParticipantName(trimmed)) {
        toast.error(REMEMBER_WHO_NAME_REJECT_TOAST);
        return;
      }
      onEntriesChange([...entries, { name: trimmed, vc_person_id }]);
      setDraft("");
      setListOpen(false);
      trackMixpanelEvent("participant_name_added", {
        review_flow: "unlinked_investor_review",
        source: vc_person_id ? "directory" : "free_text",
      });
    },
    [entries, isDuplicate, onEntriesChange],
  );

  const q = draft.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!options.length) return [];
    const pickedIds = new Set(entries.map((e) => e.vc_person_id).filter(Boolean) as string[]);
    const pickedNames = new Set(entries.map((e) => e.name.trim().toLowerCase()));
    const base = !q
      ? options.slice(0, 12)
      : options
          .filter(
            (o) =>
              o.label.toLowerCase().includes(q) ||
              (o.subtitle != null && o.subtitle.toLowerCase().includes(q)),
          )
          .slice(0, 12);
    return base.filter(
      (o) => !pickedIds.has(o.id) && !pickedNames.has(o.label.trim().toLowerCase()),
    );
  }, [options, q, entries]);

  const showList = listOpen && filtered.length > 0 && options.length > 0;
  const unknownOthersId = `${inputId}-unknown-others`;

  const firmListedLine =
    firmCardLinkedInvestorCount > 0
      ? `${firmCardLinkedInvestorCount} ${firmCardLinkedInvestorCount === 1 ? "person" : "people"} listed at this firm`
      : null;

  return (
    <div ref={wrapRef} className="mt-2">
      <Label htmlFor={inputId} className="text-[10px] font-semibold text-foreground">
        Remember who?
      </Label>
      <div className="mt-1 flex min-h-[2.25rem] flex-wrap items-center gap-1 rounded-md border border-border/70 bg-card/40 p-1">
        {entries.map((e, i) => (
          <span
            key={`${e.vc_person_id ?? "x"}-${i}-${e.name}`}
            className="inline-flex max-w-full items-center gap-0.5 rounded-md border border-border/80 bg-secondary/40 py-0.5 pl-1.5 pr-0.5 text-[11px] font-medium text-foreground"
          >
            <span className="max-w-[11rem] truncate">{e.name}</span>
            <button
              type="button"
              aria-label={`Remove ${e.name}`}
              onClick={() => onEntriesChange(entries.filter((_, j) => j !== i))}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3 w-3" strokeWidth={2} aria-hidden />
            </button>
          </span>
        ))}
        <div className="relative min-h-[1.75rem] min-w-[6rem] flex-1">
          <Input
            id={inputId}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setListOpen(true);
            }}
            onFocus={() => setListOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                tryAdd(draft, null);
              }
            }}
            placeholder="Add a name, press Enter"
            maxLength={REMEMBER_WHO_NAME_MAX}
            autoComplete="off"
            className="h-7 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={showList ? `${inputId}-suggestions` : undefined}
          />
          {showList && (
            <ul
              id={`${inputId}-suggestions`}
              role="listbox"
              className="absolute left-0 right-0 top-full z-[85] mt-0.5 max-h-44 overflow-y-auto rounded-md border border-border bg-popover py-0.5 text-popover-foreground shadow-md"
            >
              {filtered.map((o) => (
                <li key={o.id} role="option">
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0 px-2 py-1.5 text-left text-sm hover:bg-accent/10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => tryAdd(o.label, o.id)}
                  >
                    <span className="font-medium leading-tight">{o.label}</span>
                    {o.subtitle ? (
                      <span className="text-[10px] text-muted-foreground">{o.subtitle}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
        Add names if you remember them. Approximate answers are fine.
      </p>
      {firmListedLine ? (
        <p className="mt-0.5 text-[9px] leading-snug text-muted-foreground/70">{firmListedLine}</p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setShowRoleFallback(true);
          trackMixpanelEvent("fallback_opened", { review_flow: "unlinked_investor_review" });
        }}
        className="mt-0.5 block w-full text-left text-[9px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Can&apos;t remember names? Select by role instead
      </button>

      {showRoleFallback ? (
        <div className="mt-1.5 space-y-1 border-l-2 border-border/50 pl-2.5">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Roles involved">
            {PARTICIPANT_ROLE_OPTIONS.map((opt) => {
              const selected = selectedRoles.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    const next = toggleParticipantRole(selectedRoles, opt.value);
                    if (selected && !next.includes(opt.value)) {
                      trackMixpanelEvent("participant_role_removed", {
                        review_flow: "unlinked_investor_review",
                        role: opt.value,
                      });
                    } else if (!selected && next.includes(opt.value)) {
                      trackMixpanelEvent("participant_role_selected", {
                        review_flow: "unlinked_investor_review",
                        role: opt.value,
                      });
                    }
                    onRolesChange(next);
                  }}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[9px] font-medium transition-colors",
                    selected
                      ? "border-foreground/20 bg-foreground text-background"
                      : "border-border/70 bg-background/60 text-muted-foreground hover:border-foreground/15 hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-start gap-1.5">
            <Checkbox
              id={unknownOthersId}
              checked={includedUnknownOthers}
              onCheckedChange={(v) => onIncludedUnknownOthersChange(v === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor={unknownOthersId}
              className="cursor-pointer text-[9px] font-normal leading-snug text-muted-foreground"
            >
              Included others I don&apos;t remember by name
            </Label>
          </div>
          <button
            type="button"
            onClick={() => setShowRoleFallback(false)}
            className="text-[9px] font-medium text-muted-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
          >
            Hide role options
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const INTRO_OPTION_ICONS: Record<(typeof CHARACTERIZE_INTRO_OPTIONS)[number], LucideIcon> = {
  "Warm intro": HeartHandshake,
  "Cold inbound": Inbox,
  "Cold outbound": Send,
  Event: CalendarDays,
  "Existing relationship": UsersRound,
  Other: MoreHorizontal,
};

const WARM_INTRO_WHO_ICONS: Record<
  (typeof CHARACTERIZE_WARM_INTRO_WHO_INITIATED)[number],
  LucideIcon
> = {
  "Investor initiated": Briefcase,
  "Founder initiated": User,
  "Mutual / unclear": CircleHelp,
};

const COLD_INBOUND_DISCOVERY_ICONS: Record<
  (typeof CHARACTERIZE_COLD_INBOUND_DISCOVERY)[number],
  LucideIcon
> = {
  "inbound email": Mail,
  website: Globe,
  "referral chain": Link2,
  social: AtSign,
  unknown: CircleHelp,
};

const COLD_INBOUND_SOCIAL_PLATFORM_ICONS: Record<
  (typeof CHARACTERIZE_COLD_INBOUND_SOCIAL_PLATFORMS)[number],
  LucideIcon
> = {
  X: Twitter,
  LinkedIn: Linkedin,
  Substack: Newspaper,
  other: MoreHorizontal,
};

const COLD_INBOUND_SOCIAL_PLATFORM_LABEL: Record<
  (typeof CHARACTERIZE_COLD_INBOUND_SOCIAL_PLATFORMS)[number],
  string
> = {
  X: "X",
  LinkedIn: "LinkedIn",
  Substack: "Substack",
  other: "Other",
};

const INTERACTION_HOW_ICONS: Record<
  (typeof CHARACTERIZE_INTERACTION_HOW)[number],
  LucideIcon
> = {
  "In-Person": MapPin,
  Video,
  Group: Users,
  "1:1": User,
  Email: Mail,
  Social: AtSign,
  Phone,
};

const EVENT_TYPE_ICONS: Record<(typeof CHARACTERIZE_EVENT_TYPES)[number], LucideIcon> = {
  conference: Mic2,
  "demo day": Sparkles,
  dinner: UtensilsCrossed,
  "private gathering": Home,
  "office hours": Clock,
  other: MoreHorizontal,
};

const EVENT_FOLLOWUP_FIRST_LABEL: Record<
  (typeof CHARACTERIZE_EVENT_FOLLOWUP_FIRST)[number],
  string
> = {
  founder: "founder",
  investor: "investor",
};

const REVIEW_DRAFT_INTERACTION_TYPE = "review_draft";
const REVIEW_DRAFT_INVESTOR_INTERACTION_TYPE = "review_draft_investor";

/** Unlinked interaction summary for `interaction_detail` (draft or final). */
function buildUnlinkedInteractionDetail(
  answers: Record<string, string | string[]>,
): string | null {
  const intro = answers.interaction_intro as string | undefined;
  const introOther = (answers.interaction_intro_other as string | undefined)?.trim();
  const warmWho = (answers.interaction_warm_intro_who as string | undefined)?.trim();
  const coldDiscovery = (answers.interaction_cold_inbound_discovery as string | undefined)?.trim();
  const eventType = (answers.interaction_event_type as string | undefined)?.trim();
  const eventTypeOther = (answers.interaction_event_type_other as string | undefined)?.trim();
  const eventFollowup = answers.interaction_event_followup as string | undefined;
  const eventFollowupFirst = (answers.interaction_event_followup_first as string | undefined)?.trim();

  const introForDetail =
    intro === "Other" && introOther
      ? introOther
      : intro === "Warm intro" && warmWho
        ? `Warm intro (${warmWho})`
        : intro === "Cold inbound" && coldDiscovery
          ? `Cold inbound (${coldDiscovery})`
          : intro === "Event" && eventType
            ? (() => {
                const typeLabel =
                  eventType === "other" && eventTypeOther
                    ? eventTypeOther
                    : EVENT_TYPE_DISPLAY_LABELS[
                        eventType as keyof typeof EVENT_TYPE_DISPLAY_LABELS
                      ] ?? eventType;
                let s = `Event (${typeLabel})`;
                if (eventFollowup === "Yes" && eventFollowupFirst) {
                  const firstPretty =
                    eventFollowupFirst in EVENT_FOLLOWUP_FIRST_LABEL
                      ? EVENT_FOLLOWUP_FIRST_LABEL[
                          eventFollowupFirst as keyof typeof EVENT_FOLLOWUP_FIRST_LABEL
                        ]
                      : eventFollowupFirst;
                  s += ` · follow-up: Yes · first: ${firstPretty}`;
                } else if (eventFollowup === "No") s += ` · follow-up: No`;
                return s;
              })()
            : intro;

  const howArr = Array.isArray(answers.interaction_how)
    ? (answers.interaction_how as string[])
    : [];
  const howForDetail = howArr.length > 0 ? howArr.join(", ") : "";
  const rememberedSuffix = formatRememberWhoForInteractionDetail(answers);

  if (!introForDetail || !howForDetail) return null;
  return `${introForDetail} · ${howForDetail}${rememberedSuffix}`;
}

async function fetchExistingVcRatingDraftId(
  authorId: string,
  firmId: string,
  personUuid: string | null,
): Promise<string | null> {
  let q = supabase
    .from("vc_ratings")
    .select("id")
    .eq("author_user_id", authorId)
    .eq("vc_firm_id", firmId)
    .eq("is_draft", true);
  if (personUuid) q = q.eq("vc_person_id", personUuid);
  else q = q.is("vc_person_id", null);
  const { data, error } = await q.maybeSingle();
  if (error || !data?.id) return null;
  return data.id as string;
}

/** True once relationship-origin follow-ups are answered (next step: how you interacted). */
function relationshipOriginFollowupsComplete(
  introValue: string | null,
  introOtherValue: string,
  warmIntroWhoValue: string | null,
  coldInboundDiscoveryValue: string | null,
  coldInboundSocialPlatformValue: string | null,
  coldInboundSocialOtherValue: string,
  eventTypeValue: string | null,
  eventTypeOtherValue: string,
  eventFollowupValue: string | null,
  eventFollowupFirstValue: string | null,
): boolean {
  if (!introValue) return false;
  switch (introValue) {
    case "Warm intro":
      return Boolean(warmIntroWhoValue);
    case "Cold inbound":
      if (!coldInboundDiscoveryValue) return false;
      if (coldInboundDiscoveryValue === "social") {
        if (!coldInboundSocialPlatformValue) return false;
        if (
          coldInboundSocialPlatformValue === "other" &&
          !coldInboundSocialOtherValue.trim()
        ) {
          return false;
        }
      }
      return true;
    case "Event":
      if (!eventTypeValue) return false;
      if (eventTypeValue === "other" && !eventTypeOtherValue.trim()) return false;
      if (!eventFollowupValue) return false;
      if (eventFollowupValue === "Yes" && !eventFollowupFirstValue) return false;
      return true;
    case "Other":
      return introOtherValue.trim().length > 0;
    default:
      return true;
  }
}

function characterizeRowTileBase(selected: boolean) {
  return cn(
    "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-0.5 py-0.5 text-center transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card",
    selected
      ? "border-accent bg-accent/[0.08] ring-1 ring-accent/15"
      : "border-border/70 bg-card/40 hover:border-accent/30 hover:bg-secondary/30",
  );
}

function CharacterizeInteractionPicker({
  introValue,
  introOtherValue,
  warmIntroWhoValue,
  coldInboundDiscoveryValue,
  coldInboundSocialPlatformValue,
  coldInboundSocialOtherValue,
  eventTypeValue,
  eventTypeOtherValue,
  eventFollowupValue,
  eventFollowupFirstValue,
  interactionHowValue,
  onInteractionHowToggle,
  directoryPeopleOptions,
  rememberedWhoEntries,
  onRememberedWhoChange,
  rememberedRoles,
  onRememberedRolesChange,
  includedUnknownOthers,
  onIncludedUnknownOthersChange,
  firmCardLinkedInvestorCount,
  onIntro,
  onIntroOther,
  onWarmIntroWho,
  onColdInboundDiscovery,
  onColdInboundSocialPlatform,
  onColdInboundSocialOther,
  onEventType,
  onEventTypeOther,
  onEventFollowup,
  onEventFollowupFirst,
}: {
  introValue: string | null;
  introOtherValue: string;
  warmIntroWhoValue: string | null;
  coldInboundDiscoveryValue: string | null;
  coldInboundSocialPlatformValue: string | null;
  coldInboundSocialOtherValue: string;
  eventTypeValue: string | null;
  eventTypeOtherValue: string;
  eventFollowupValue: string | null;
  eventFollowupFirstValue: string | null;
  interactionHowValue: string[];
  onInteractionHowToggle: (option: string) => void;
  directoryPeopleOptions: DirectoryPersonOption[];
  rememberedWhoEntries: RememberWhoEntry[];
  onRememberedWhoChange: (next: RememberWhoEntry[]) => void;
  rememberedRoles: ParticipantRoleKey[];
  onRememberedRolesChange: (next: ParticipantRoleKey[]) => void;
  includedUnknownOthers: boolean;
  onIncludedUnknownOthersChange: (next: boolean) => void;
  firmCardLinkedInvestorCount: number;
  onIntro: (v: string) => void;
  onIntroOther: (v: string) => void;
  onWarmIntroWho: (v: string) => void;
  onColdInboundDiscovery: (v: string) => void;
  onColdInboundSocialPlatform: (v: string) => void;
  onColdInboundSocialOther: (v: string) => void;
  onEventType: (v: string) => void;
  onEventTypeOther: (v: string) => void;
  onEventFollowup: (v: string) => void;
  onEventFollowupFirst: (v: string) => void;
}) {
  const originComplete = relationshipOriginFollowupsComplete(
    introValue,
    introOtherValue,
    warmIntroWhoValue,
    coldInboundDiscoveryValue,
    coldInboundSocialPlatformValue,
    coldInboundSocialOtherValue,
    eventTypeValue,
    eventTypeOtherValue,
    eventFollowupValue,
    eventFollowupFirstValue,
  );
  return (
    <div className="space-y-4" role="group" aria-label="Relationship origin and how you interacted">
      <div className="space-y-1.5">
        <p className="text-[9px] font-mono font-bold tracking-wider text-muted-foreground">Relationship origin</p>
        <div className="-mx-0.5 flex w-full flex-nowrap gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:thin]">
          {CHARACTERIZE_INTRO_OPTIONS.map((opt) => {
            const Icon = INTRO_OPTION_ICONS[opt];
            const selected = introValue === opt;
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={selected}
                aria-label={opt}
                onClick={() => onIntro(opt)}
                className={cn(
                  characterizeRowTileBase(selected),
                  "min-h-[2.75rem] min-w-[3.1rem] max-w-[4.5rem] shrink-0 flex-none sm:min-w-0 sm:max-w-none sm:flex-1",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]",
                    selected ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
                  )}
                >
                  <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                </span>
                <span className="line-clamp-2 max-w-full text-[8px] font-semibold leading-[1.1] text-foreground">
                  {opt}
                </span>
              </button>
            );
          })}
        </div>
        <AnimatePresence initial={false}>
          {introValue === "Warm intro" && (
            <motion.div
              key="warm-intro-who"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="space-y-1.5 border-t border-border/50 pt-2" role="group" aria-label="Who initiated the warm intro">
                <p className="text-[10px] font-semibold text-foreground">Who initiated</p>
                <div className="flex w-full flex-nowrap gap-1">
                  {CHARACTERIZE_WARM_INTRO_WHO_INITIATED.map((opt) => {
                    const Icon = WARM_INTRO_WHO_ICONS[opt];
                    const selected = warmIntroWhoValue === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={selected}
                        aria-label={opt}
                        onClick={() => onWarmIntroWho(opt)}
                        className={cn(characterizeRowTileBase(selected), "min-h-[2.5rem] flex-1")}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]",
                            selected ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                        </span>
                        <span className="line-clamp-2 text-[8px] font-semibold leading-tight text-foreground">
                          {opt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {introValue === "Cold inbound" && (
            <motion.div
              key="cold-inbound-discovery"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div
                className="space-y-1.5 border-t border-border/50 pt-2"
                role="group"
                aria-label="How the investor discovered you"
              >
                <p className="text-[10px] font-semibold text-foreground">
                  How did the investor discover you?
                </p>
                <div className="-mx-0.5 flex w-full flex-nowrap gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:thin]">
                  {CHARACTERIZE_COLD_INBOUND_DISCOVERY.map((opt) => {
                    const Icon = COLD_INBOUND_DISCOVERY_ICONS[opt];
                    const selected = coldInboundDiscoveryValue === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        aria-pressed={selected}
                        aria-label={opt}
                        onClick={() => onColdInboundDiscovery(opt)}
                        className={cn(
                          characterizeRowTileBase(selected),
                          "min-h-[2.5rem] min-w-[3rem] max-w-[4.25rem] shrink-0 flex-none sm:min-w-0 sm:max-w-none sm:flex-1",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]",
                            selected ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                        </span>
                        <span className="line-clamp-2 max-w-full text-[8px] font-semibold leading-tight text-foreground">
                          {opt}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <AnimatePresence initial={false}>
                  {coldInboundDiscoveryValue === "social" && (
                    <motion.div
                      key="cold-inbound-social-platform"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="space-y-1.5 pt-2"
                    >
                      <div className="space-y-1.5" role="group" aria-label="Social platform">
                        <p className="text-[10px] font-semibold text-foreground">Platform</p>
                        <div className="flex w-full flex-nowrap gap-1">
                          {CHARACTERIZE_COLD_INBOUND_SOCIAL_PLATFORMS.map((opt) => {
                            const Icon = COLD_INBOUND_SOCIAL_PLATFORM_ICONS[opt];
                            const selected = coldInboundSocialPlatformValue === opt;
                            const label = COLD_INBOUND_SOCIAL_PLATFORM_LABEL[opt];
                            return (
                              <button
                                key={opt}
                                type="button"
                                aria-pressed={selected}
                                aria-label={label}
                                onClick={() => onColdInboundSocialPlatform(opt)}
                                className={cn(
                                  characterizeRowTileBase(selected),
                                  "min-h-[2.5rem] flex-1",
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]",
                                    selected ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
                                  )}
                                >
                                  <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                                </span>
                                <span className="text-[8px] font-semibold leading-tight text-foreground">
                                  {label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                        <AnimatePresence initial={false}>
                          {coldInboundSocialPlatformValue === "other" && (
                            <motion.div
                              key="cold-inbound-social-other-field"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-1.5">
                                <Label
                                  htmlFor="cold-inbound-social-other"
                                  className="text-[10px] font-semibold text-foreground"
                                >
                                  Describe the platform
                                </Label>
                                <Input
                                  id="cold-inbound-social-other"
                                  value={coldInboundSocialOtherValue}
                                  onChange={(e) => onColdInboundSocialOther(e.target.value)}
                                  placeholder="e.g. Discord, Slack community…"
                                  maxLength={200}
                                  className="h-9 text-sm"
                                  autoComplete="off"
                                />
                                <p className="text-[9px] text-muted-foreground tabular-nums">
                                  {coldInboundSocialOtherValue.length}/200
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {introValue === "Event" && (
            <motion.div
              key="event-followups"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="space-y-1.5 border-t border-border/50 pt-2"
            >
                <div role="group" aria-label="Event type">
                  <p className="text-[10px] font-semibold text-foreground">Event type:</p>
                  <div className="-mx-0.5 mt-1.5 flex w-full flex-nowrap gap-1 overflow-x-auto overflow-y-visible px-0.5 pb-0.5 [scrollbar-width:thin]">
                    {CHARACTERIZE_EVENT_TYPES.map((opt) => {
                      const Icon = EVENT_TYPE_ICONS[opt];
                      const selected = eventTypeValue === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={selected}
                          aria-label={EVENT_TYPE_DISPLAY_LABELS[opt]}
                          onClick={() => onEventType(opt)}
                          className={cn(
                            characterizeRowTileBase(selected),
                            "min-h-[2.5rem] min-w-[3.25rem] max-w-[5rem] shrink-0 flex-none sm:min-w-0 sm:max-w-none sm:flex-1",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]",
                              selected ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
                            )}
                          >
                            <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                          </span>
                          <span className="line-clamp-2 min-h-[1.5em] w-full max-w-full px-0.5 text-center text-[8px] font-semibold leading-tight text-foreground">
                            {EVENT_TYPE_DISPLAY_LABELS[opt]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {eventTypeValue === "other" && (
                    <motion.div
                      key="event-type-other"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="space-y-1.5"
                    >
                      <Label
                        htmlFor="characterize-event-type-other"
                        className="text-[10px] font-semibold text-foreground"
                      >
                        Describe the event
                      </Label>
                      <Input
                        id="characterize-event-type-other"
                        value={eventTypeOtherValue}
                        onChange={(e) => onEventTypeOther(e.target.value)}
                        placeholder="e.g. alumni mixer, hackathon…"
                        maxLength={200}
                        className="h-9 text-sm"
                        autoComplete="off"
                      />
                      <p className="text-[9px] text-muted-foreground tabular-nums">
                        {eventTypeOtherValue.length}/200
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div role="group" aria-label="Follow-up after the event">
                  <p className="text-[10px] font-semibold text-foreground">
                    Was there follow-up after the event?
                  </p>
                  <div className="mt-1.5 flex w-full flex-nowrap gap-1">
                    {CHARACTERIZE_EVENT_FOLLOWUP.map((opt) => {
                      const Icon = opt === "Yes" ? Check : X;
                      const selected = eventFollowupValue === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={selected}
                          aria-label={opt}
                          onClick={() => onEventFollowup(opt)}
                          className={cn(
                            characterizeRowTileBase(selected),
                            "min-h-[2.5rem] min-w-0 flex-1",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]",
                              selected ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
                            )}
                          >
                            <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                          </span>
                          <span className="line-clamp-2 min-h-[1.5em] w-full max-w-full px-0.5 text-center text-[8px] font-semibold leading-tight text-foreground">
                            {opt}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {eventFollowupValue === "Yes" && (
                    <motion.div
                      key="event-followup-first"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <div role="group" aria-label="Who followed up first" className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-foreground">Who followed up first?</p>
                        <div className="flex w-full flex-nowrap gap-1">
                          {CHARACTERIZE_EVENT_FOLLOWUP_FIRST.map((opt) => {
                            const Icon = opt === "founder" ? User : Briefcase;
                            const selected = eventFollowupFirstValue === opt;
                            const label = EVENT_FOLLOWUP_FIRST_LABEL[opt];
                            return (
                              <button
                                key={opt}
                                type="button"
                                aria-pressed={selected}
                                aria-label={label}
                                onClick={() => onEventFollowupFirst(opt)}
                                className={cn(
                                  characterizeRowTileBase(selected),
                                  "min-h-[2.5rem] min-w-0 flex-1",
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]",
                                    selected ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
                                  )}
                                >
                                  <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                                </span>
                                <span className="line-clamp-2 min-h-[1.5em] w-full max-w-full px-0.5 text-center text-[8px] font-semibold leading-tight text-foreground">
                                  {label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {introValue === "Other" && (
            <motion.div
              key="intro-other-field"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="space-y-1.5 border-t border-border/50 pt-2">
                <Label htmlFor="characterize-relationship-origin-other" className="text-[10px] font-semibold text-foreground">
                  Describe your relationship origin
                </Label>
                <Input
                  id="characterize-relationship-origin-other"
                  value={introOtherValue}
                  onChange={(e) => onIntroOther(e.target.value)}
                  placeholder="e.g. Twitter DM, portfolio site form…"
                  maxLength={200}
                  className="h-9 text-sm"
                  autoComplete="off"
                />
                <p className="text-[9px] text-muted-foreground tabular-nums">{introOtherValue.length}/200</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {originComplete ? (
          <div
            className="border-t border-border/50 pt-2 space-y-1.5"
            role="group"
            aria-label="How did you interact"
          >
            <div>
              <p className="text-[9px] font-mono font-bold tracking-wider text-muted-foreground">
                How did you interact?
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">Select all that apply.</p>
            </div>
            <div className="flex w-full min-w-0 flex-nowrap items-stretch gap-0.5 pt-0.5 sm:gap-1">
              {(introValue === "Event"
                ? CHARACTERIZE_INTERACTION_HOW.filter((o) => o !== "In-Person")
                : [...CHARACTERIZE_INTERACTION_HOW]
              ).map((opt) => {
                const Icon = INTERACTION_HOW_ICONS[opt];
                const selected = interactionHowValue.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={selected}
                    aria-label={opt}
                    title={opt}
                    onClick={() => onInteractionHowToggle(opt)}
                    className={cn(
                      characterizeRowTileBase(selected),
                      "min-h-[2.5rem] min-w-0 flex-1 basis-0 px-0.5 sm:px-0.5",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] sm:h-5 sm:w-5",
                        selected ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      <Icon className="h-2 w-2 sm:h-2.5 sm:w-2.5" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="line-clamp-2 w-full min-w-0 break-words text-center text-[6px] font-semibold leading-tight text-foreground sm:text-[7px] md:text-[8px]">
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
            {interactionHowValue.length > 0 ? (
              <RememberWhoSection
                inputId="characterize-remember-who"
                entries={rememberedWhoEntries}
                onEntriesChange={onRememberedWhoChange}
                options={directoryPeopleOptions}
                firmCardLinkedInvestorCount={firmCardLinkedInvestorCount}
                selectedRoles={rememberedRoles}
                onRolesChange={onRememberedRolesChange}
                includedUnknownOthers={includedUnknownOthers}
                onIncludedUnknownOthersChange={onIncludedUnknownOthersChange}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Tier labels for 1–10 overall interaction (unlinked form). 5 & 6 share “Mixed / Okay”. */
const OVERALL_SCALE_TIERS: Record<number, { label: string; description: string }> = {
  10: {
    label: "Exceptional / A+ interaction",
    description: "Felt sharp, respectful, and genuinely high-signal from start to finish.",
  },
  9: {
    label: "Great / Above expectations",
    description: "Very strong interaction with clear thinking and minimal friction.",
  },
  8: {
    label: "Strong",
    description: "Solid, useful, and better than most.",
  },
  7: {
    label: "Good",
    description: "Worked well overall, with only minor rough edges.",
  },
  6: {
    label: "Mixed / Okay",
    description: "Some useful parts, some friction, nothing especially memorable.",
  },
  5: {
    label: "Mixed / Okay",
    description: "Some useful parts, some friction, nothing especially memorable.",
  },
  4: {
    label: "Weak",
    description: "More frustrating than helpful; expectations weren't fully met.",
  },
  3: {
    label: "Poor",
    description: "Low-signal interaction with noticeable issues.",
  },
  2: {
    label: "Rough",
    description: "Hard to work with, unclear, or disappointing.",
  },
  1: {
    label: "Toxic / Terrible",
    description: "A bad experience; would actively warn other founders.",
  },
};

const OVERALL_SCALE_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function overallInteractionScoreValid(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 && n <= 10 && String(n) === v;
}

/** Color stops for the gradient line (roughly red → amber → green). */
const OVERALL_GRADIENT_STYLE: CSSProperties = {
  background:
    "linear-gradient(90deg, rgb(185 28 28) 0%, rgb(234 88 12) 22%, rgb(250 204 21) 45%, rgb(163 230 53) 72%, rgb(22 163 74) 100%)",
};

function OverallInteractionScale({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const selectedN = value != null ? parseInt(value, 10) : NaN;
  const hasSelection = Number.isFinite(selectedN) && selectedN >= 1 && selectedN <= 10;
  const previewN =
    hovered != null
      ? hovered
      : hasSelection
        ? selectedN
        : null;
  const tier = previewN != null ? OVERALL_SCALE_TIERS[previewN] : null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-secondary/20 p-3">
        <p className="sr-only" id="overall-scale-desc">
          Choose from 1 (toxic or terrible) to 10 (exceptional). The bar runs from low on the left to high on the right.
        </p>
        <div className="relative px-0.5 pt-1" aria-describedby="overall-scale-desc">
          <div
            className="relative h-3 w-full overflow-hidden rounded-full shadow-inner ring-1 ring-black/5 dark:ring-white/10"
            style={OVERALL_GRADIENT_STYLE}
            aria-hidden
          >
            <div className="absolute inset-0 flex">
              {OVERALL_SCALE_NUMS.map((n) => (
                <div
                  key={n}
                  className={cn(
                    "flex-1 border-l border-white/25 first:border-l-0 dark:border-black/20",
                    hasSelection && selectedN === n && "bg-white/25 dark:bg-black/20",
                  )}
                  style={{ flexGrow: 1 }}
                />
              ))}
            </div>
          </div>
          <div className="mt-2 flex justify-between gap-0">
            {OVERALL_SCALE_NUMS.map((n) => {
              const active = hasSelection && selectedN === n;
              return (
                <button
                  key={n}
                  type="button"
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(n)}
                  onBlur={() => setHovered(null)}
                  onClick={() => onChange(String(n))}
                  aria-label={`${n} — ${OVERALL_SCALE_TIERS[n].label}`}
                  aria-pressed={active}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "text-accent" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                      active
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "bg-card ring-1 ring-border/80 hover:ring-accent/40",
                    )}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between px-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Terrible</span>
            <span>Mixed</span>
            <span>Exceptional</span>
          </div>
        </div>
      </div>

      {tier ? (
        <div
          className={cn(
            "rounded-lg border px-2.5 py-1.5 transition-colors",
            previewN != null && previewN <= 3
              ? "border-rose-500/25 bg-rose-500/5"
              : previewN != null && previewN <= 6
                ? "border-amber-500/20 bg-amber-500/5"
                : "border-emerald-500/25 bg-emerald-500/5",
          )}
        >
          <p
            className="line-clamp-1 text-[11px] leading-none text-foreground"
            title={`${previewN} — ${tier.label} — ${tier.description}`}
          >
            <span className="font-semibold tabular-nums">{previewN}</span>
            <span className="font-normal text-muted-foreground"> — </span>
            <span className="font-semibold">{tier.label}</span>
            <span className="font-normal text-muted-foreground"> — </span>
            <span className="font-normal text-muted-foreground">{tier.description}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Single-select radio pill group */
function SingleSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150",
            value === opt
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-secondary/40 text-muted-foreground hover:border-accent/40 hover:bg-secondary/70",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/** One row of equal-width segments: filled when selected, outlined when not */
function SegmentedPillRow({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex w-full flex-nowrap gap-1 sm:gap-1.5"
    >
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            title={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "min-h-[2.65rem] min-w-0 flex-1 rounded-lg border px-1 py-1.5 text-center text-[9px] font-semibold leading-snug transition-colors duration-150 sm:min-h-[2.5rem] sm:px-1.5 sm:text-[10px] sm:leading-tight",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-transparent bg-foreground text-background shadow-sm"
                : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <span className="block">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select toggle chip group */
function MultiSelect({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt],
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150",
            selected.includes(opt)
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-secondary/40 text-muted-foreground hover:border-accent/40 hover:bg-secondary/70",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/** Numbered question block */
function QuestionBlock({
  index,
  label,
  optional,
  children,
}: {
  index: number;
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-bold text-foreground flex items-start gap-1.5">
        <span className="text-base leading-none shrink-0">{index}.</span>
        <span>
          {label}
          {optional && (
            <span className="font-normal text-muted-foreground ml-1">(optional)</span>
          )}
        </span>
      </p>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag selector (non-investor form only)
// ─────────────────────────────────────────────────────────────────────────────

function TagSelector({
  tags,
  selected,
  onChange,
  emptyHint,
}: {
  tags: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  /** Shown when there are no tags yet (e.g. overall score not chosen). */
  emptyHint?: string;
}) {
  const toggle = (tag: string) =>
    onChange(
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag],
    );

  return (
    <section className="space-y-2">
      <p className="text-xs font-bold text-foreground">Tags</p>
      {tags.length === 0 ? (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {emptyHint ?? "No tags to show."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all duration-150",
                selected.includes(tag)
                  ? "border-warning/60 bg-warning/10 text-warning-foreground"
                  : "border-border bg-secondary/30 text-muted-foreground hover:border-warning/30 hover:bg-secondary/60",
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ReviewSubmissionModal({
  open,
  onClose,
  firmName,
  vcFirmId,
  personId = "",
  personName,
  investorIsMappedToProfile,
  mappingRecordId,
  investorMappingLoading = false,
  companyId = "",
  cardLinkedContactOptions,
}: ReviewSubmissionModalProps) {
  const { user } = useAuth();

  // Build form config from the mapping decision (skip until cap_table lookup finishes)
  const formConfig = useMemo(
    () =>
      investorMappingLoading
        ? null
        : buildReviewFormConfig({
            firm_id: vcFirmId ?? "",
            company_id: companyId || user?.id || "",
            mapping_record_id: mappingRecordId,
            investor_is_mapped_to_profile: investorIsMappedToProfile,
            firm_name: firmName,
          }),
    [
      investorMappingLoading,
      vcFirmId,
      companyId,
      mappingRecordId,
      investorIsMappedToProfile,
      firmName,
      user?.id,
    ],
  );

  // ── Answer state ──────────────────────────────────────────────────────────
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const overallScoreRaw = answers.overall_interaction as string | undefined;
  const nonInvestorTagOptions = useMemo(
    () => nonInvestorTagsForOverallScore(overallScoreRaw),
    [overallScoreRaw],
  );

  useEffect(() => {
    const allowed = new Set(nonInvestorTagsForOverallScore(overallScoreRaw));
    setSelectedTags((prev) => prev.filter((t) => allowed.has(t)));
  }, [overallScoreRaw]);
  const [anonymous, setAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [directoryPeople, setDirectoryPeople] = useState<DirectoryPersonOption[]>([]);
  const [resolvedVcFirmId, setResolvedVcFirmId] = useState<string | null>(null);
  const [draftRowId, setDraftRowId] = useState<string | null>(null);
  const [draftBootstrapDone, setDraftBootstrapDone] = useState(true);
  const draftRowIdRef = useRef<string | null>(null);
  const skipHydrationPersistRef = useRef(false);

  const setDraftRow = useCallback((id: string | null) => {
    draftRowIdRef.current = id;
    setDraftRowId(id);
  }, []);

  useEffect(() => {
    if (!open) {
      setDirectoryPeople([]);
      setResolvedVcFirmId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const resolvedId = await resolveVcFirmId(firmName, vcFirmId ?? null);
      if (cancelled) return;
      setResolvedVcFirmId(resolvedId);
      if (!resolvedId) {
        setDirectoryPeople([]);
        return;
      }
      const rows = await fetchVcFirmPeopleOptions(resolvedId);
      if (!cancelled) setDirectoryPeople(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, firmName, vcFirmId]);

  const mergedDirectoryPeople = useMemo(
    () => mergeDirectoryPersonOptions(cardLinkedContactOptions, directoryPeople),
    [cardLinkedContactOptions, directoryPeople],
  );

  const firmCardLinkedInvestorCount = (cardLinkedContactOptions ?? []).length;

  const setAnswer = useCallback((id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  // ── Reset on close ────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setAnswers({});
    setSelectedTags([]);
    setAnonymous(true);
    setSubmitted(false);
    setDraftRow(null);
    skipHydrationPersistRef.current = false;
  }, [setDraftRow]);

  const handleClose = () => {
    reset();
    onClose();
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const canSubmit = useMemo(() => {
    if (investorMappingLoading || !formConfig) return false;
    if (investorIsMappedToProfile) {
      // Investor form: Q1 + Q2 required
      return (
        typeof answers.work_with_them_rating === "string" &&
        answers.work_with_them_rating.length > 0 &&
        typeof answers.take_money_again === "string" &&
        answers.take_money_again.length > 0
      );
    } else {
      // Non-investor form: Q1–Q4 required
      const introOk =
        typeof answers.interaction_intro === "string" && answers.interaction_intro.length > 0;
      const otherOk =
        answers.interaction_intro !== "Other" ||
        (typeof answers.interaction_intro_other === "string" &&
          answers.interaction_intro_other.trim().length > 0);
      const warmWhoOk =
        answers.interaction_intro !== "Warm intro" ||
        (typeof answers.interaction_warm_intro_who === "string" &&
          answers.interaction_warm_intro_who.length > 0);
      const coldInboundDiscoveryOk =
        answers.interaction_intro !== "Cold inbound" ||
        ((typeof answers.interaction_cold_inbound_discovery === "string" &&
          answers.interaction_cold_inbound_discovery.length > 0) &&
          (answers.interaction_cold_inbound_discovery !== "social" ||
            ((typeof answers.interaction_cold_inbound_social_platform === "string" &&
              answers.interaction_cold_inbound_social_platform.length > 0) &&
              (answers.interaction_cold_inbound_social_platform !== "other" ||
                (typeof answers.interaction_cold_inbound_social_other === "string" &&
                  answers.interaction_cold_inbound_social_other.trim().length > 0)))));
      const eventOk =
        answers.interaction_intro !== "Event" ||
        ((typeof answers.interaction_event_type === "string" &&
          answers.interaction_event_type.length > 0 &&
          (answers.interaction_event_type !== "other" ||
            (typeof answers.interaction_event_type_other === "string" &&
              answers.interaction_event_type_other.trim().length > 0))) &&
          typeof answers.interaction_event_followup === "string" &&
          answers.interaction_event_followup.length > 0 &&
          (answers.interaction_event_followup !== "Yes" ||
            (typeof answers.interaction_event_followup_first === "string" &&
              answers.interaction_event_followup_first.length > 0)));
      const howOk =
        Array.isArray(answers.interaction_how) && answers.interaction_how.length > 0;
      const rememberWhoOk = !howOk || rememberWhoSubsectionSatisfied(answers);
      return (
        introOk &&
        otherOk &&
        warmWhoOk &&
        coldInboundDiscoveryOk &&
        eventOk &&
        howOk &&
        rememberWhoOk &&
        overallInteractionScoreValid(answers.overall_interaction) &&
        typeof answers.would_engage_again === "string" &&
        answers.would_engage_again.length > 0
      );
    }
  }, [answers, investorIsMappedToProfile, investorMappingLoading, formConfig]);

  // ── Draft autosave (partial reviews) ─────────────────────────────────────
  const digestNoNote = useMemo(() => {
    const { founder_note: _fn, ...rest } = answers;
    return JSON.stringify([rest, selectedTags, anonymous, investorIsMappedToProfile]);
  }, [answers, selectedTags, anonymous, investorIsMappedToProfile]);

  const founderNoteVal = (answers.founder_note as string) ?? "";

  const persistDraft = useCallback(async () => {
    if (skipHydrationPersistRef.current) {
      skipHydrationPersistRef.current = false;
      return;
    }
    if (
      !isSupabaseConfigured ||
      !open ||
      !user?.id ||
      !resolvedVcFirmId ||
      !formConfig ||
      submitted ||
      investorMappingLoading ||
      !draftBootstrapDone
    ) {
      return;
    }
    const hasPayload = Object.keys(answers).length > 0 || selectedTags.length > 0;
    if (!hasPayload) return;

    const structuredAnswers = {
      form_version: "v2" as const,
      review_type: formConfig.review_type,
      answers: withParticipantMemoryMode(answers),
      tags: selectedTags,
    };
    const scores = investorIsMappedToProfile
      ? deriveInvestorScores(answers)
      : deriveNonInvestorScores(answers);
    const pid = personId?.trim() || null;
    const interactionTypeValue = investorIsMappedToProfile
      ? REVIEW_DRAFT_INVESTOR_INTERACTION_TYPE
      : REVIEW_DRAFT_INTERACTION_TYPE;
    const interactionDetail = !investorIsMappedToProfile
      ? buildUnlinkedInteractionDetail(answers)
      : null;

    const payload = {
      author_user_id: user.id,
      vc_firm_id: resolvedVcFirmId,
      vc_person_id: pid,
      interaction_type: interactionTypeValue,
      interaction_detail: interactionDetail,
      interaction_date: null as null,
      score_resp: scores.score_resp,
      score_respect: scores.score_respect,
      score_feedback: scores.score_feedback,
      score_follow_thru: scores.score_follow_thru,
      score_value_add: scores.score_value_add,
      nps: scores.nps,
      comment: (answers.founder_note as string | undefined)?.trim() || null,
      anonymous,
      verified: false,
      is_draft: true,
      star_ratings: structuredAnswers as unknown as Record<string, unknown>,
    };

    try {
      const rowId = draftRowIdRef.current;
      if (rowId) {
        const { error } = await supabase.from("vc_ratings").update(payload).eq("id", rowId);
        if (error) throw error;
        return;
      }
      const ins = await supabase.from("vc_ratings").insert(payload).select("id").single();
      if (ins.error) {
        if (ins.error.code === "23505") {
          const rescueId = await fetchExistingVcRatingDraftId(user.id, resolvedVcFirmId, pid);
          if (rescueId) {
            setDraftRow(rescueId);
            const { error: e2 } = await supabase.from("vc_ratings").update(payload).eq("id", rescueId);
            if (e2) console.warn("[review draft]", e2);
          }
          return;
        }
        throw ins.error;
      }
      if (ins.data?.id) setDraftRow(ins.data.id as string);
    } catch (e) {
      console.warn("[review draft]", e);
    }
  }, [
    answers,
    anonymous,
    formConfig,
    investorIsMappedToProfile,
    investorMappingLoading,
    open,
    personId,
    resolvedVcFirmId,
    selectedTags,
    submitted,
    user?.id,
    draftBootstrapDone,
    setDraftRow,
  ]);

  const prevAutosaveDigestRef = useRef("");
  const prevAutosaveNoteRef = useRef("");

  useEffect(() => {
    if (!open) {
      prevAutosaveDigestRef.current = "";
      prevAutosaveNoteRef.current = "";
      return;
    }
    const noteOnly =
      digestNoNote === prevAutosaveDigestRef.current &&
      founderNoteVal !== prevAutosaveNoteRef.current;
    prevAutosaveDigestRef.current = digestNoNote;
    prevAutosaveNoteRef.current = founderNoteVal;
    const delay = noteOnly ? 520 : 0;
    const t = window.setTimeout(() => void persistDraft(), delay);
    return () => window.clearTimeout(t);
  }, [digestNoNote, founderNoteVal, open, persistDraft]);

  useEffect(() => {
    if (!open || !formConfig || investorMappingLoading) {
      setDraftBootstrapDone(true);
      return;
    }
    if (!user?.id || !resolvedVcFirmId) {
      setDraftBootstrapDone(true);
      return;
    }

    let cancelled = false;
    const pid = personId?.trim() || null;
    const rt = formConfig.review_type;

    setDraftBootstrapDone(false);
    (async () => {
      try {
        let q = supabase
          .from("vc_ratings")
          .select("id, star_ratings")
          .eq("author_user_id", user.id)
          .eq("vc_firm_id", resolvedVcFirmId)
          .eq("is_draft", true);
        if (pid) q = q.eq("vc_person_id", pid);
        else q = q.is("vc_person_id", null);
        const { data, error } = await q.maybeSingle();
        if (cancelled || error || !data?.id) return;
        const sr = (data.star_ratings ?? {}) as Record<string, unknown>;
        if (typeof sr.review_type === "string" && sr.review_type !== rt) return;
        const loadedAnswers = sr.answers;
        const loadedTags = sr.tags;
        if (loadedAnswers && typeof loadedAnswers === "object" && !Array.isArray(loadedAnswers)) {
          skipHydrationPersistRef.current = true;
          setAnswers(loadedAnswers as Record<string, string | string[]>);
        }
        if (Array.isArray(loadedTags)) {
          setSelectedTags(loadedTags.map((t) => String(t)));
        }
        setDraftRow(data.id as string);
      } finally {
        if (!cancelled) setDraftBootstrapDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    user?.id,
    investorMappingLoading,
    resolvedVcFirmId,
    formConfig?.review_type,
    personId,
    setDraftRow,
  ]);

  // ── Submission ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit || !user || !formConfig) return;
    setSubmitting(true);

    try {
      const resolvedFirmId =
        resolvedVcFirmId ?? (await resolveVcFirmId(firmName, vcFirmId ?? null));
      if (!resolvedFirmId) {
        throw new Error(
          "Could not resolve this firm in the VC directory. Open the investor from search so we have a match.",
        );
      }

      const pid = personId?.trim() || null;

      const structuredAnswers = {
        form_version: "v2",
        review_type: formConfig.review_type,
        answers: withParticipantMemoryMode(answers),
        tags: selectedTags,
      };

      const scores = investorIsMappedToProfile
        ? deriveInvestorScores(answers)
        : deriveNonInvestorScores(answers);

      const intro = answers.interaction_intro as string | undefined;
      const interactionTypeValue = investorIsMappedToProfile
        ? "investor_relationship"
        : deriveInteractionTypeFromCharacterization(intro, undefined);

      const interactionDetail = !investorIsMappedToProfile
        ? buildUnlinkedInteractionDetail(answers)
        : null;

      const npsFinal = scores.nps ?? 0;

      const payload = {
        author_user_id: user.id,
        vc_firm_id: resolvedFirmId,
        vc_person_id: pid,
        interaction_type: interactionTypeValue,
        interaction_detail: interactionDetail,
        interaction_date: null,
        score_resp: scores.score_resp,
        score_respect: scores.score_respect,
        score_feedback: scores.score_feedback,
        score_follow_thru: scores.score_follow_thru,
        score_value_add: scores.score_value_add,
        nps: npsFinal,
        comment: (answers.founder_note as string | undefined)?.trim() || null,
        anonymous,
        verified: false,
        is_draft: false,
        star_ratings: structuredAnswers as unknown as Record<string, unknown>,
      };

      const rowId = draftRowIdRef.current;
      const { error } = rowId
        ? await supabase.from("vc_ratings").update(payload).eq("id", rowId)
        : await supabase.from("vc_ratings").insert(payload);
      if (error) throw error;

      if (!investorIsMappedToProfile) {
        trackMixpanelEvent("participant_memory_mode_finalized", {
          review_flow: "unlinked_investor_review",
          mode: computeParticipantMemoryMode(answers),
          name_count: countRememberedNames(answers),
          role_count: getRememberedRoleKeysFromAnswers(answers).length,
          included_unknown_others: getIncludedUnknownOthers(answers),
        });
      }

      setSubmitted(true);
      toast.success(
        anonymous
          ? "Thanks — your rating was submitted anonymously."
          : "Thanks — your rating was submitted.",
      );

      setTimeout(() => handleClose(), 1800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit rating");
    } finally {
      setSubmitting(false);
    }
  };

  const subjectLine = personName ? `${personName} · ${firmName}` : firmName;

  const wouldEngageRaw = answers.would_engage_again as string | undefined;
  const unlinkedEngageSelected =
    !investorIsMappedToProfile &&
    typeof wouldEngageRaw === "string" &&
    wouldEngageRaw.length > 0;

  const visibleNonTextQuestions = useMemo(() => {
    if (!formConfig) return [];
    return formConfig.questions
      .filter((q) => q.type !== "text")
      .filter(
        (q) =>
          investorIsMappedToProfile ||
          q.id === "overall_interaction" ||
          q.id === "would_engage_again" ||
          unlinkedEngageSelected,
      );
  }, [formConfig, investorIsMappedToProfile, unlinkedEngageSelected]);

  const visibleTextQuestions = useMemo(() => {
    if (!formConfig) return [];
    return formConfig.questions
      .filter((q) => q.type === "text")
      .filter(() => investorIsMappedToProfile || unlinkedEngageSelected);
  }, [formConfig, investorIsMappedToProfile, unlinkedEngageSelected]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-lg max-h-[90vh] flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/20 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 shrink-0">
                    <Star className="h-4 w-4 text-warning" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground truncate">
                      {formConfig?.title ?? "Review"}
                    </h3>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {subjectLine}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Body */}
              {submitted ? (
                <SuccessState />
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                    {investorMappingLoading || !formConfig || !draftBootstrapDone ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-14 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin text-accent" />
                        <p className="text-xs">
                          {investorMappingLoading
                            ? "Checking your cap table…"
                            : !draftBootstrapDone
                              ? "Loading your draft…"
                              : "…"}
                        </p>
                      </div>
                    ) : (
                      <>
                    {/* Non-text questions: unlinked flow reveals the rest after “engage again” */}
                    {visibleNonTextQuestions.map((q, i) => (
                        <QuestionBlock
                          key={q.id}
                          index={i + 1}
                          label={
                            q.id === "overall_interaction"
                              ? `How was your experience with ${firmName.trim() || "this firm"}?`
                              : q.label
                          }
                          optional={q.optional}
                        >
                          {q.type === "characterize_interaction" && !investorIsMappedToProfile ? (
                            <CharacterizeInteractionPicker
                              introValue={(answers.interaction_intro as string) ?? null}
                              introOtherValue={(answers.interaction_intro_other as string) ?? ""}
                              warmIntroWhoValue={(answers.interaction_warm_intro_who as string) ?? null}
                              coldInboundDiscoveryValue={
                                (answers.interaction_cold_inbound_discovery as string) ?? null
                              }
                              coldInboundSocialPlatformValue={
                                (answers.interaction_cold_inbound_social_platform as string) ?? null
                              }
                              coldInboundSocialOtherValue={
                                (answers.interaction_cold_inbound_social_other as string) ?? ""
                              }
                              eventTypeValue={
                                (answers.interaction_event_type as string | undefined)?.trim() || null
                              }
                              eventTypeOtherValue={(answers.interaction_event_type_other as string) ?? ""}
                              eventFollowupValue={
                                (answers.interaction_event_followup as string | undefined)?.trim() || null
                              }
                              eventFollowupFirstValue={
                                (answers.interaction_event_followup_first as string | undefined)?.trim() ||
                                null
                              }
                              interactionHowValue={
                                Array.isArray(answers.interaction_how)
                                  ? (answers.interaction_how as string[])
                                  : []
                              }
                              onInteractionHowToggle={(opt) => {
                                setAnswers((prev) => {
                                  const raw = prev.interaction_how;
                                  const cur = Array.isArray(raw) ? [...raw] : [];
                                  const has = cur.includes(opt);
                                  const next = has ? cur.filter((x) => x !== opt) : [...cur, opt];
                                  if (next.length === 0) {
                                    return {
                                      ...prev,
                                      interaction_how: next,
                                      interaction_remembered_who_names: [],
                                      interaction_remembered_who_vc_person_ids: [],
                                      [PARTICIPANT_MEMORY_ANSWER_KEYS.roles]: [],
                                      [PARTICIPANT_MEMORY_ANSWER_KEYS.includedUnknownOthers]: "",
                                    };
                                  }
                                  return { ...prev, interaction_how: next };
                                });
                              }}
                              directoryPeopleOptions={mergedDirectoryPeople}
                              rememberedWhoEntries={rememberWhoEntriesFromAnswers(answers)}
                              onRememberedWhoChange={(next) => {
                                setAnswers((prev) => ({
                                  ...prev,
                                  interaction_remembered_who_names: next.map((e) => e.name),
                                  interaction_remembered_who_vc_person_ids: next.map(
                                    (e) => e.vc_person_id ?? "",
                                  ),
                                }));
                              }}
                              rememberedRoles={getRememberedRoleKeysFromAnswers(answers)}
                              onRememberedRolesChange={(next) => {
                                setAnswers((prev) => ({
                                  ...prev,
                                  [PARTICIPANT_MEMORY_ANSWER_KEYS.roles]: next,
                                }));
                              }}
                              includedUnknownOthers={getIncludedUnknownOthers(answers)}
                              onIncludedUnknownOthersChange={(next) => {
                                setAnswers((prev) => ({
                                  ...prev,
                                  [PARTICIPANT_MEMORY_ANSWER_KEYS.includedUnknownOthers]: next
                                    ? "true"
                                    : "",
                                }));
                              }}
                              firmCardLinkedInvestorCount={firmCardLinkedInvestorCount}
                              onIntro={(v) => {
                                setAnswers((prev) => {
                                  const next: Record<string, string | string[]> = {
                                    ...prev,
                                    interaction_intro: v,
                                  };
                                  if (v !== "Other") next.interaction_intro_other = "";
                                  if (v !== "Warm intro") next.interaction_warm_intro_who = "";
                                  if (v !== "Cold inbound") {
                                    next.interaction_cold_inbound_discovery = "";
                                    next.interaction_cold_inbound_social_platform = "";
                                    next.interaction_cold_inbound_social_other = "";
                                  }
                                  if (v !== "Event") {
                                    next.interaction_event_type = "";
                                    next.interaction_event_type_other = "";
                                    next.interaction_event_followup = "";
                                    next.interaction_event_followup_first = "";
                                  }

                                  if (v === "Warm intro" || v === "Cold outbound" || v === "Existing relationship") {
                                    next.interaction_how = ["Email"];
                                  } else if (v === "Cold inbound") {
                                    const disc = String(next.interaction_cold_inbound_discovery ?? "").trim();
                                    next.interaction_how = disc === "social" ? ["Social"] : ["Email"];
                                  } else if (v === "Event") {
                                    const raw = next.interaction_how;
                                    if (Array.isArray(raw)) {
                                      const filtered = raw.filter((x) => x !== "In-Person");
                                      next.interaction_how = filtered;
                                      if (filtered.length === 0) {
                                        next.interaction_remembered_who_names = [];
                                        next.interaction_remembered_who_vc_person_ids = [];
                                        next[PARTICIPANT_MEMORY_ANSWER_KEYS.roles] = [];
                                        next[PARTICIPANT_MEMORY_ANSWER_KEYS.includedUnknownOthers] = "";
                                      }
                                    }
                                  }

                                  return next;
                                });
                              }}
                              onIntroOther={(v) => setAnswer("interaction_intro_other", v)}
                              onWarmIntroWho={(v) => setAnswer("interaction_warm_intro_who", v)}
                              onColdInboundDiscovery={(v) => {
                                setAnswers((prev) => {
                                  const next: Record<string, string | string[]> = {
                                    ...prev,
                                    interaction_cold_inbound_discovery: v,
                                  };
                                  if (v !== "social") {
                                    next.interaction_cold_inbound_social_platform = "";
                                    next.interaction_cold_inbound_social_other = "";
                                  }
                                  if (prev.interaction_intro === "Cold inbound") {
                                    next.interaction_how = v === "social" ? ["Social"] : ["Email"];
                                  }
                                  return next;
                                });
                              }}
                              onColdInboundSocialPlatform={(v) =>
                                setAnswer("interaction_cold_inbound_social_platform", v)
                              }
                              onColdInboundSocialOther={(v) =>
                                setAnswer("interaction_cold_inbound_social_other", v)
                              }
                              onEventType={(v) => {
                                setAnswer("interaction_event_type", v);
                                if (v !== "other") setAnswer("interaction_event_type_other", "");
                              }}
                              onEventTypeOther={(v) => setAnswer("interaction_event_type_other", v)}
                              onEventFollowup={(v) => {
                                setAnswer("interaction_event_followup", v);
                                if (v !== "Yes") setAnswer("interaction_event_followup_first", "");
                              }}
                              onEventFollowupFirst={(v) =>
                                setAnswer("interaction_event_followup_first", v)
                              }
                            />
                          ) : null}

                          {q.type === "single_select" &&
                            (q.id === "overall_interaction" && !investorIsMappedToProfile ? (
                              <OverallInteractionScale
                                value={(answers[q.id] as string) ?? null}
                                onChange={(v) => setAnswer(q.id, v)}
                              />
                            ) : (
                              <SingleSelect
                                options={q.options ?? []}
                                value={(answers[q.id] as string) ?? null}
                                onChange={(v) => setAnswer(q.id, v)}
                              />
                            ))}

                          {q.type === "segmented_select" && (
                            <SegmentedPillRow
                              ariaLabel={q.label}
                              options={q.options ?? []}
                              value={(answers[q.id] as string) ?? null}
                              onChange={(v) => setAnswer(q.id, v)}
                            />
                          )}

                          {q.type === "multi_select" && (
                            <MultiSelect
                              options={q.options ?? []}
                              selected={(answers[q.id] as string[]) ?? []}
                              onChange={(v) => setAnswer(q.id, v)}
                            />
                          )}
                        </QuestionBlock>
                      ))}

                    {/* Tag selector — after engage-again in unlinked flow */}
                    {!investorIsMappedToProfile && unlinkedEngageSelected && (
                      <TagSelector
                        tags={nonInvestorTagOptions}
                        selected={selectedTags}
                        onChange={setSelectedTags}
                        emptyHint="Set your overall score above to see tags that match how the interaction felt."
                      />
                    )}

                    {/* Optional text question rendered last */}
                    {visibleTextQuestions.map((q, ti) => (
                        <QuestionBlock
                          key={q.id}
                          index={visibleNonTextQuestions.length + ti + 1}
                          label={q.label}
                          optional={q.optional}
                        >
                          <div className="space-y-1">
                            <Textarea
                              value={(answers[q.id] as string) ?? ""}
                              onChange={(e) => setAnswer(q.id, e.target.value)}
                              placeholder='e.g. "Partner gave sharp GTM feedback…"'
                              rows={3}
                              maxLength={500}
                              className="resize-none text-sm"
                            />
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {((answers[q.id] as string) ?? "").length}/500
                            </span>
                          </div>
                        </QuestionBlock>
                      ))}

                    {/* Anonymous toggle */}
                    <div className="flex items-center justify-between gap-3 pt-4 border-t border-border">
                      <div className="space-y-0.5">
                        <Label
                          htmlFor="review-anon"
                          className="text-sm font-semibold text-foreground cursor-pointer"
                        >
                          Submit anonymously
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                          {anonymous
                            ? "Your name won't appear on the public feed."
                            : "Your name may be visible to verified founders."}
                        </p>
                      </div>
                      <Switch
                        id="review-anon"
                        checked={anonymous}
                        onCheckedChange={setAnonymous}
                      />
                    </div>
                      </>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-secondary/10 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClose}
                      className="text-muted-foreground"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSubmit}
                      disabled={!canSubmit || submitting || investorMappingLoading || !formConfig}
                      className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 px-5"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" /> Submit
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
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

