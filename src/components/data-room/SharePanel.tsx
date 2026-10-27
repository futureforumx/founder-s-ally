import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Eye, EyeOff, Info, Link2Off, Loader2, LockKeyhole, Pencil, Plus, RefreshCw, Search, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { STAGE_OPTIONS } from "@/constants/taxonomy";
import { toast } from "@/hooks/use-toast";
import { getSupabaseAccessToken } from "@/integrations/supabase/client";
import { usePitchDecks } from "@/hooks/usePitchDecks";
import { useInvestorDirectory } from "@/hooks/useInvestorDirectory";
import { useCompanyProfileFields } from "@/hooks/useCompanyProfileFields";
import { useAuth } from "@/hooks/useAuth";
import { useActiveContext } from "@/context/ActiveContext";

type NativeLink = {
  id: string; deck_id: string; token: string | null; name: string; recipient_name: string; recipient_firm: string | null;
  recipient_email: string | null; intended_investor_id: string | null; created_at: string; expires_at: string | null;
  revoked_at: string | null; has_password: boolean; require_email: boolean; show_download: boolean;
  company_stage_snapshot: string | null; deck_version_uploaded_at: string | null; company_slug: string | null;
  presentation_slug: string | null; contact_email: string | null; workspace_id: string | null;
  company_pitch_decks?: { file_name: string; uploaded_at: string; slide_count: number | null } | null;
};
type LinkActivity = { id: string; totalVisits: number; uniqueViewers: number; lastActivityAt: string | null };
type Form = {
  companyStage: string; changeAcrossAccount: boolean; investorId: string; expiresAt: string; expirationEnabled: boolean;
  password: string; passwordEnabled: boolean; preserveExistingPassword: boolean; requireEmail: boolean; showDownload: boolean;
  createRequestId: string; presentationSlug: string; contactEmail: string;
};
const EMPTY: Form = { companyStage: "", changeAcrossAccount: false, investorId: "", expiresAt: "", expirationEnabled: false, password: "", passwordEnabled: false, preserveExistingPassword: false, requireEmail: false, showDownload: false, createRequestId: "", presentationSlug: "", contactEmail: "" };
function newCreateRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
}
function randomPresentationSlug() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
const validSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
async function api(path: string, init: RequestInit = {}) {
  const token = await getSupabaseAccessToken();
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}
const customUrl = (companySlug: string | null | undefined, presentationSlug: string | null | undefined) => companySlug && presentationSlug ? `${window.location.origin}/share/${companySlug}/${presentationSlug}` : "";
const legacyUrl = (token: string | null) => token ? `${window.location.origin}/share/${token}` : "";
const statusOf = (link: NativeLink) => link.revoked_at ? "Revoked" : link.expires_at && Date.parse(link.expires_at) <= Date.now() ? "Expired" : "Active";
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString() : "No expiration";

export function SharePanel({ initialDeckId }: { initialDeckId?: string }) {
  const { decks, loading: decksLoading } = usePitchDecks();
  const { data: investors = [] } = useInvestorDirectory();
  const { profile, patch } = useCompanyProfileFields();
  const { user } = useAuth();
  const { availableContexts } = useActiveContext();
  const workspace = availableContexts.find((context) => context.kind === "workspace");
  const workspaceSlug = workspace?.kind === "workspace" ? workspace.slug : "";
  const companyPathSlug = slugify(typeof profile.name === "string" ? profile.name : "") || slugify(workspaceSlug) || "company";
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [links, setLinks] = useState<NativeLink[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [emptyComposerDismissed, setEmptyComposerDismissed] = useState(false);
  const [editing, setEditing] = useState<NativeLink | null>(null);
  const [investorPickerOpen, setInvestorPickerOpen] = useState(false);
  const [investorQuery, setInvestorQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");
  const [slugAvailability, setSlugAvailability] = useState<"idle" | "checking" | "available" | "taken" | "invalid" | "unavailable">("idle");
  const [activity, setActivity] = useState<LinkActivity[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const pdfDecks = useMemo(() => decks.filter((item) => item.file_name.toLowerCase().endsWith(".pdf")), [decks]);
  const deck = pdfDecks.find((item) => item.id === selectedDeckId)
    ?? pdfDecks.find((item) => item.id === initialDeckId)
    ?? pdfDecks.find((item) => item.is_active)
    ?? pdfDecks[0]
    ?? null;
  const sortedInvestors = useMemo(() => [...investors].sort((a, b) => a.name.localeCompare(b.name)), [investors]);
  const deckLinks = useMemo(() => links.filter((link) => link.deck_id === deck?.id), [links, deck?.id]);
  const pdfDeck = Boolean(deck?.file_name.toLowerCase().endsWith(".pdf"));
  const composerOpen = Boolean(editing || creating || (!loading && deckLinks.length === 0 && !emptyComposerDismissed));
  const selectedInvestor = sortedInvestors.find((investor) => investor.id === form.investorId);
  const shareUrl = customUrl(companyPathSlug, form.presentationSlug);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api("/api/deck-shares");
      setLinks((data.links ?? []).map((row: NativeLink) => ({ ...row, token: row.token ?? null })));
    } catch (error) {
      toast({ title: "Could not load sharing links", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadLinks(); }, [loadLinks]);
  useEffect(() => { if (initialDeckId) setSelectedDeckId(initialDeckId); }, [initialDeckId]);
  useEffect(() => {
    if (!decks.length) return;
    const defaultDeck = pdfDecks.find((item) => item.id === initialDeckId) ?? pdfDecks.find((item) => item.is_active) ?? pdfDecks[0];
    if (defaultDeck) setSelectedDeckId((current) => pdfDecks.some((item) => item.id === current) ? current : defaultDeck.id);
  }, [decks, initialDeckId, pdfDecks]);
  useEffect(() => {
    if (!deck?.id) { setActivity(null); return; }
    let cancelled = false;
    setActivityLoading(true);
    void getSupabaseAccessToken().then(async (token) => {
      const response = await fetch(`/api/deck-share-analytics?deckId=${encodeURIComponent(deck.id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Analytics unavailable");
      if (!cancelled) setActivity((data.links ?? []).map((row: LinkActivity) => ({ id: row.id, totalVisits: row.totalVisits, uniqueViewers: row.uniqueViewers, lastActivityAt: row.lastActivityAt })));
    }).catch(() => { if (!cancelled) setActivity(null); }).finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, [deck?.id]);

  const reset = () => { setEditing(null); setCreating(false); setEmptyComposerDismissed(true); setShowPassword(false); setForm(EMPTY); setInvestorQuery(""); setInvestorPickerOpen(false); setSlugAvailability("idle"); };
  useEffect(() => {
    if (loading || !deck || deckLinks.length > 0 || editing || creating || emptyComposerDismissed || form.createRequestId) return;
    setForm({ ...EMPTY, companyStage: typeof profile.stage === "string" ? profile.stage.trim() : "", contactEmail: user?.email || "", presentationSlug: randomPresentationSlug(), createRequestId: newCreateRequestId() });
  }, [loading, deck, deckLinks.length, editing, creating, emptyComposerDismissed, form.createRequestId, profile.stage, profile.name, user?.email]);
  const startCreate = () => {
    setEditing(null); setCreating(true); setEmptyComposerDismissed(false); setShowPassword(false); setInvestorPickerOpen(false); setInvestorQuery("");
    if (deck) setSelectedDeckId(deck.id);
    setForm({ ...EMPTY, companyStage: typeof profile.stage === "string" ? profile.stage.trim() : "", contactEmail: user?.email || "", presentationSlug: randomPresentationSlug(), createRequestId: newCreateRequestId() });
  };
  const beginEdit = (link: NativeLink) => {
    setCreating(false); setShowPassword(false); setEditing(link);
    setInvestorQuery(sortedInvestors.find((investor) => investor.id === link.intended_investor_id)?.name ?? "");
    setForm({ ...EMPTY, companyStage: link.company_stage_snapshot || (typeof profile.stage === "string" ? profile.stage.trim() : ""), investorId: link.intended_investor_id || "", expiresAt: link.expires_at ? new Date(link.expires_at).toISOString().slice(0, 16) : "", expirationEnabled: Boolean(link.expires_at), passwordEnabled: link.has_password, preserveExistingPassword: link.has_password, requireEmail: link.require_email, showDownload: link.show_download, presentationSlug: link.presentation_slug || randomPresentationSlug(), contactEmail: link.contact_email || user?.email || "" });
  };
  const matchingInvestors = useMemo(() => {
    const query = investorQuery.trim().toLocaleLowerCase();
    return query ? sortedInvestors.filter((investor) => investor.name.toLocaleLowerCase().includes(query)) : sortedInvestors;
  }, [investorQuery, sortedInvestors]);

  useEffect(() => {
    if (!composerOpen) { setSlugAvailability("idle"); return; }
    if (!validSlug(form.presentationSlug)) { setSlugAvailability("invalid"); return; }
    let cancelled = false;
    setSlugAvailability("checking");
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ checkAvailability: "1", checkSlug: form.presentationSlug, companyName: typeof profile.name === "string" ? profile.name : "" });
      if (editing?.id) params.set("excludeLinkId", editing.id);
      void api(`/api/deck-shares?${params.toString()}`).then((data) => {
        if (!cancelled) setSlugAvailability(data.available ? "available" : "taken");
      }).catch(() => { if (!cancelled) setSlugAvailability("unavailable"); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [composerOpen, form.presentationSlug, profile.name, editing?.id]);

  const save = async () => {
    if (!deck?.id) return;
    if (!validSlug(form.presentationSlug)) { toast({ title: "Check the custom link", description: "Use lowercase letters, numbers, and hyphens.", variant: "destructive" }); return; }
    setBusy(true);
    try {
      if (form.expirationEnabled && !form.expiresAt) throw new Error("Choose an expiration date and time, or select No expiration.");
      if (form.passwordEnabled && !form.password && !form.preserveExistingPassword) throw new Error("Enter a password, or select No password.");
      if (form.passwordEnabled && form.password.length > 0 && form.password.length < 4) throw new Error("Use a password with at least 4 characters.");
      if (slugAvailability === "taken") throw new Error("This custom link is already in use. Choose another address.");
      const settings = {
        name: `${deck.file_name.replace(/\.pdf$/i, "")} · ${selectedInvestor?.name || "Pitch deck"}`,
        companyStage: form.companyStage || null, password: form.passwordEnabled ? form.password || undefined : undefined,
        clearPassword: Boolean(editing?.has_password && !form.passwordEnabled), requireEmail: form.requireEmail,
        allowedEmails: "", showDownload: form.showDownload,
        expiresAt: form.expirationEnabled && form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        presentationSlug: form.presentationSlug, contactEmail: form.contactEmail.trim(),
        investorId: form.investorId || null, investorName: selectedInvestor?.name || "", companyName: typeof profile.name === "string" ? profile.name.trim() : "",
      };
      if (editing) {
        await api(`/api/deck-shares?linkId=${encodeURIComponent(editing.id)}`, { method: "PATCH", body: JSON.stringify(settings) });
        toast({ title: "Share link updated" });
      } else {
        const companyName = typeof profile.name === "string" ? profile.name.trim() : "";
        if (!companyName) throw new Error("Set your company name in account settings before creating a sharing link.");
        const profileLogo = (profile as Record<string, unknown>).logo_url;
        const createRequestId = /^[A-Za-z0-9_-]{43}$/.test(form.createRequestId) ? form.createRequestId : newCreateRequestId();
        const linkName = `${deck.file_name.replace(/\.pdf$/i, "")} · ${selectedInvestor?.name || "Pitch deck"}`;
        const data = await api("/api/deck-shares", { method: "POST", body: JSON.stringify({
          ...settings, name: linkName, createRequestId, deckId: deck.id, investorId: form.investorId || null,
          investorName: selectedInvestor?.name || "", companyName,
          companyLogoUrl: typeof profileLogo === "string" ? profileLogo : "",
        }) });
        const url = customUrl(data.link?.company_slug || companyPathSlug, data.link?.presentation_slug || form.presentationSlug);
        if (url) {
          try { await navigator.clipboard.writeText(url); toast({ title: "Share link created and copied" }); }
          catch { toast({ title: "Share link created", description: "Use Copy link below to copy it." }); }
        }
        if (data.link?.id) setLinks((current) => [{ ...data.link, token: data.link.token ?? null }, ...current.filter((link) => link.id !== data.link.id)]);
      }
      if (form.changeAcrossAccount && form.companyStage !== (typeof profile.stage === "string" ? profile.stage.trim() : "")) patch({ stage: form.companyStage });
      reset();
      await loadLinks();
    } catch (error) {
      toast({ title: editing ? "Could not update link" : "Could not create link", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const copy = async (link: NativeLink) => {
    const url = customUrl(link.company_slug, link.presentation_slug) || legacyUrl(link.token);
    if (!url) { toast({ title: "Link URL unavailable", description: "Edit this link to assign a branded address.", variant: "destructive" }); return; }
    try { await navigator.clipboard.writeText(url); setCopied(link.id); window.setTimeout(() => setCopied(""), 1800); }
    catch { toast({ title: "Could not copy link", variant: "destructive" }); }
  };
  const revoke = async (link: NativeLink) => {
    if (!window.confirm(`Revoke “${link.name}”? The shared URL will stop working.`)) return;
    try { await api(`/api/deck-shares?linkId=${encodeURIComponent(link.id)}`, { method: "DELETE" }); toast({ title: "Link revoked" }); await loadLinks(); }
    catch (error) { toast({ title: "Could not revoke link", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); }
  };

  const stageOptions = <select id="deck-share-stage" aria-label="Fundraising stage" value={form.companyStage} onChange={(event) => setForm((current) => ({ ...current, companyStage: event.target.value, changeAcrossAccount: false }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
    <option value="">No stage selected</option>{form.companyStage && !STAGE_OPTIONS.some((option) => option.label === form.companyStage) && <option value={form.companyStage}>{form.companyStage}</option>}{STAGE_OPTIONS.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
  </select>;

  const viewingRequirements = <>
    <section aria-labelledby="deck-share-viewing-requirements" className="space-y-4 border-t border-border pt-4">
      <h3 id="deck-share-viewing-requirements" className="text-sm font-semibold">Viewing requirements</h3>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <div className="space-y-2"><p className="text-xs font-medium">Download and print access</p><RadioGroup aria-label="Download and print access" value={form.showDownload ? "allow" : "hidden"} onValueChange={(value) => setForm((current) => ({ ...current, showDownload: value === "allow" }))} className="flex flex-wrap gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs"><RadioGroupItem value="allow" />Allow downloads and printing</label><label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><RadioGroupItem value="hidden" />No download or print access</label>
        </RadioGroup></div>
        <div className="space-y-2"><p className="text-xs font-medium">Email access</p><RadioGroup aria-label="Email requirement" value={form.requireEmail ? "required" : "not-required"} onValueChange={(value) => setForm((current) => ({ ...current, requireEmail: value === "required" }))} className="flex flex-wrap gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs"><RadioGroupItem value="required" />Require email to view</label><label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><RadioGroupItem value="not-required" />No email requirement</label>
        </RadioGroup></div>
        <div className="space-y-2"><p className="text-xs font-medium">Expiration</p><RadioGroup aria-label="Link expiration" value={form.expirationEnabled ? "set" : "none"} onValueChange={(value) => setForm((current) => ({ ...current, expirationEnabled: value === "set" }))} className="flex flex-wrap gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs"><RadioGroupItem value="set" />Set expiration date</label><label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><RadioGroupItem value="none" />No expiration</label>
        </RadioGroup>{form.expirationEnabled && <div className="space-y-1"><label htmlFor="deck-share-expiration" className="text-xs font-medium">Expire date</label><Input id="deck-share-expiration" type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} required /></div>}</div>
        <div className="space-y-2"><p className="text-xs font-medium">Password protection</p><RadioGroup aria-label="Password requirement" value={form.passwordEnabled ? "required" : "none"} onValueChange={(value) => { const enabled = value === "required"; if (!enabled) setShowPassword(false); setForm((current) => ({ ...current, passwordEnabled: enabled, preserveExistingPassword: enabled && current.passwordEnabled && current.preserveExistingPassword, password: enabled ? current.password : "" })); }} className="flex flex-wrap gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs"><RadioGroupItem value="required" />Require password</label><label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><RadioGroupItem value="none" />No password</label>
        </RadioGroup>{form.passwordEnabled && <div className="space-y-1"><label htmlFor="deck-share-password" className="text-xs font-medium">Password</label><div className="relative"><Input id="deck-share-password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder={form.preserveExistingPassword ? "Password is set; blank keeps it" : "Password (4 characters minimum)"} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value, preserveExistingPassword: false }))} required={!form.preserveExistingPassword} minLength={4} className="pr-10" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Reveal password"} aria-pressed={showPassword} title={showPassword ? "Hide password" : "Reveal password"} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>}</div>
      </div>
    </section>
  </>;

  return <div className="space-y-5">
    {decksLoading ? <div className="rounded-xl border border-border p-5 text-sm text-muted-foreground">Loading decks…</div> : !deck ? <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-lg font-semibold">Share pitch deck</h2><p className="mt-2 text-sm text-muted-foreground">Upload a pitch deck in Files before sharing.</p></section> : !pdfDeck ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs">Native investor sharing currently supports published PDFs. Upload a PDF version of this deck to share it.</div> : <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-lg font-semibold">Share pitch deck</h2><p className="mt-1 max-w-xl text-xs text-muted-foreground">Create trackable links for published PDFs. Each link stays pinned to this exact upload.</p></div>
        {!composerOpen && <Button size="sm" onClick={startCreate} className="bg-[#A487F5] text-[#17121f] hover:bg-[#9675ef]"><Plus className="mr-2 h-4 w-4" />Add another link</Button>}
      </div>

      <div className="mt-5 grid gap-4">
        <div className="space-y-1"><label htmlFor="deck-share-file" className="text-xs font-medium">SELECT FILE</label><select id="deck-share-file" value={deck.id} disabled={Boolean(editing)} onChange={(event) => { const next = pdfDecks.find((item) => item.id === event.target.value); setSelectedDeckId(event.target.value); if (next && !editing) setForm((current) => ({ ...current, presentationSlug: slugify(`${next.file_name.replace(/\.pdf$/i, "")}${selectedInvestor ? `-${selectedInvestor.name}` : ""}`) })); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60">{pdfDecks.map((item) => <option key={item.id} value={item.id}>{item.file_name} · {new Date(item.uploaded_at).toLocaleDateString()}</option>)}</select><p className="text-[11px] text-muted-foreground">Published {dateTime(deck.uploaded_at)}{deck.slide_count ? ` · ${deck.slide_count} slides` : ""}</p></div>

        {composerOpen && <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1"><label className="flex items-center gap-1 text-xs font-medium">Select investor<TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><button type="button" aria-label="Investor selection information" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"><Info className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent className="max-w-64 text-xs">This helps track the investors you contact.</TooltipContent></Tooltip></TooltipProvider></label>
              <Popover open={investorPickerOpen} onOpenChange={setInvestorPickerOpen}><PopoverAnchor asChild><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input role="combobox" aria-label="Select investor" aria-expanded={investorPickerOpen} aria-controls="deck-share-investor-results" aria-autocomplete="list" aria-haspopup="listbox" autoComplete="off" placeholder="Select investor" value={investorQuery} onFocus={() => setInvestorPickerOpen(true)} onClick={() => setInvestorPickerOpen(true)} onChange={(event) => { const value = event.target.value; setInvestorQuery(value); setInvestorPickerOpen(true); if (value !== selectedInvestor?.name) setForm((current) => ({ ...current, investorId: "" })); }} onKeyDown={(event) => { if (event.key === "Escape") setInvestorPickerOpen(false); if (event.key === "ArrowDown") setInvestorPickerOpen(true); }} className="h-10 pr-10 pl-9 text-sm" /><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div></PopoverAnchor>
                <PopoverContent align="start" sideOffset={4} onOpenAutoFocus={(event) => event.preventDefault()} className="w-[var(--radix-popper-anchor-width)] min-w-64 p-1"><Command shouldFilter={false}><CommandList id="deck-share-investor-results" role="listbox" className="max-h-60">{matchingInvestors.length === 0 && investorQuery.trim() ? <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No investors found.</CommandEmpty> : <CommandGroup>
                  <CommandItem value="no-intended-investor" onSelect={() => { setForm((current) => ({ ...current, investorId: "" })); setInvestorQuery(""); setInvestorPickerOpen(false); }}><Check className={`mr-2 h-4 w-4 ${form.investorId ? "opacity-0" : "opacity-100"}`} />No intended investor</CommandItem>
                  {matchingInvestors.map((investor) => <CommandItem key={investor.id} value={investor.id} onSelect={() => { setForm((current) => ({ ...current, investorId: investor.id })); setInvestorQuery(investor.name); setInvestorPickerOpen(false); }}><Check className={`mr-2 h-4 w-4 ${form.investorId === investor.id ? "opacity-100" : "opacity-0"}`} />{investor.name}</CommandItem>)}
                </CommandGroup>}</CommandList></Command></PopoverContent></Popover>
            </div>
            <div className="space-y-1"><label htmlFor="deck-share-stage" className="text-xs font-medium">Fundraising stage</label>{stageOptions}</div>
            {form.companyStage !== (typeof profile.stage === "string" ? profile.stage.trim() : "") && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-2"><span className="text-xs font-medium">Change across account?</span><RadioGroup aria-label="Change stage across account" value={form.changeAcrossAccount ? "yes" : "no"} onValueChange={(value) => setForm((current) => ({ ...current, changeAcrossAccount: value === "yes" }))} className="flex items-center gap-3"><label htmlFor="stage-account-no" className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"><RadioGroupItem id="stage-account-no" value="no" />No</label><label htmlFor="stage-account-yes" className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"><RadioGroupItem id="stage-account-yes" value="yes" />Yes</label></RadioGroup><TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><button type="button" aria-label="About changing stage across the account" className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"><Info className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent className="max-w-64 text-xs">This will change the stage of {profile.name?.trim() || "your company"} across your account.</TooltipContent></Tooltip></TooltipProvider></div>}
          </div>

          {viewingRequirements}
        </>}

        <section aria-labelledby="deck-share-link-details" className={`${composerOpen ? "border-t border-border pt-4" : "border-t border-border pt-5"}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 id="deck-share-link-details" className="text-sm font-semibold">Link details</h3>{deckLinks.length === 1 && !composerOpen && <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusOf(deckLinks[0]) === "Active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{statusOf(deckLinks[0])}</span>}</div>
          {composerOpen ? <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1"><label htmlFor="deck-share-contact-email" className="text-xs font-medium">Contact email <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="deck-share-contact-email" type="email" autoComplete="email" placeholder="you@company.com" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} /><p className="text-[11px] text-muted-foreground">Viewers can contact you at this address.</p></div>
            </div>
            <div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={busy || slugAvailability === "checking" || slugAvailability === "taken" || !validSlug(form.presentationSlug)} className="bg-[#A487F5] text-[#17121f] hover:bg-[#9675ef]">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editing ? <Pencil className="mr-2 h-4 w-4" /> : <Share2 className="mr-2 h-4 w-4" />}{editing ? "Save changes" : "Generate link"}</Button><Button variant="outline" onClick={reset} disabled={busy}>Cancel</Button></div>
            {!editing && form.investorId && <p className="text-[11px] text-muted-foreground">{selectedInvestor?.name} is the intended recipient; analytics only verify a viewer when they sign in to a verified Vekta account.</p>}
          </div> : loading ? <p className="text-xs text-muted-foreground">Loading links…</p> : !deckLinks.length ? <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">Generate a link to share this published PDF.</div> : <div className="divide-y divide-border">{deckLinks.map((link) => {
            const status = statusOf(link);
            const url = customUrl(link.company_slug, link.presentation_slug) || legacyUrl(link.token);
            const item = activity?.find((entry) => entry.id === link.id);
            const activityLabel = activityLoading ? "Activity is syncing…" : item ? `${item.totalVisits} visits · ${item.uniqueViewers} visitors${item.lastActivityAt ? ` · last active ${dateTime(item.lastActivityAt)}` : " · no activity yet"}` : activity ? "0 visits · 0 visitors · no activity yet" : "Activity unavailable";
            return <article key={link.id} className="space-y-3 py-4 first:pt-1 last:pb-1">
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-medium">{link.name}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${status === "Active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{status}</span>{link.has_password && <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}</div>{status === "Active" && <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => beginEdit(link)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" onClick={() => void revoke(link)}><Link2Off className="mr-1.5 h-3.5 w-3.5" />Revoke</Button></div>}</div>
              {url && <div className="space-y-1.5"><p className="text-[10px] font-semibold tracking-wider text-muted-foreground">SHARABLE LINK</p><div className="flex min-w-0 flex-col gap-2 sm:flex-row"><p className="min-w-0 flex-1 break-all rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs text-foreground">{url}</p><Button className="shrink-0 self-start sm:self-auto" variant="outline" size="sm" onClick={() => void copy(link)} disabled={status !== "Active" || !url} title={status !== "Active" ? `This link is ${status.toLowerCase()}.` : "Copy link"}>{copied === link.id ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}{copied === link.id ? "Copied" : "Copy link"}</Button></div></div>}
              <p className="text-[11px] text-muted-foreground">{link.contact_email ? `Contact: ${link.contact_email}` : "No contact email"}</p>
              <p className="text-[11px] text-muted-foreground">Intended for {link.recipient_name || "no specific investor"}{link.recipient_firm ? ` · ${link.recipient_firm}` : ""}{link.company_stage_snapshot ? ` · ${link.company_stage_snapshot}` : ""} · {link.show_download ? "download and print allowed" : "download and print disabled"}{link.require_email ? " · email required" : ""}{link.has_password ? " · password protected" : ""}</p>
              <p className="text-[11px] text-muted-foreground">Created {dateTime(link.created_at)} · {link.expires_at ? `expires ${dateTime(link.expires_at)}` : "no expiration"} · {activityLabel}</p>
            </article>;
          })}</div>}
        </section>
      </div>
    </section>}
  </div>;
}

export default SharePanel;
