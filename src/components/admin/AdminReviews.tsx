import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Loader2, Pencil, RefreshCw, Save, Search, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";
import { AdminStickyFilters, AdminStickyHeader } from "@/components/admin/AdminStickyHeader";

export type AdminRating = {
  id: string;
  author_user_id: string | null;
  author_name: string | null;
  author_email: string | null;
  vc_firm_id: string | null;
  vc_person_id: string | null;
  target_firm_name: string | null;
  target_person_name: string | null;
  interaction_type: string;
  interaction_detail: string | null;
  interaction_date: string | null;
  score_resp: number | null;
  score_respect: number | null;
  score_feedback: number | null;
  score_follow_thru: number | null;
  score_value_add: number | null;
  nps: number | null;
  comment: string | null;
  anonymous: boolean;
  verified: boolean;
  is_draft: boolean;
  star_ratings: unknown;
  created_at: string;
  archived_at: string | null;
};

type EditableRating = Pick<AdminRating,
  "comment" | "interaction_detail" | "score_resp" | "score_respect" | "score_feedback" |
  "score_follow_thru" | "score_value_add" | "nps" | "anonymous" | "verified" | "is_draft"
>;

const PAGE_SIZE = 30;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function adminHeaders(): Promise<Record<string, string>> {
  const token = await getSupabaseBearerForFunctions();
  const anon = SUPABASE_ANON_KEY ?? "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${anon}`,
    "Content-Type": "application/json",
    apikey: anon,
  };
  if (token && token !== anon) headers["X-User-Auth"] = `Bearer ${token}`;
  return headers;
}

async function requestRatings(params: URLSearchParams) {
  if (!SUPABASE_URL) throw new Error("Supabase is not configured");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`, {
    headers: await adminHeaders(),
  });
  const payload = await response.json().catch(() => ({})) as { rows?: AdminRating[]; total?: number; error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return { rows: payload.rows ?? [], total: payload.total ?? 0 };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function scoreLabel(key: keyof EditableRating): string {
  const labels: Partial<Record<keyof EditableRating, string>> = {
    score_resp: "Responsiveness",
    score_respect: "Respect",
    score_feedback: "Feedback",
    score_follow_thru: "Follow through",
    score_value_add: "Value add",
    nps: "Overall score",
  };
  return labels[key] ?? String(key);
}

function ScoreInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number | null;
  max: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="space-y-1 text-[10px] text-white/45">
      <span className="block truncate">{label}</span>
      <Input
        type="number"
        min={max === 10 ? 0 : 1}
        max={max}
        step="1"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className="h-8 border-white/10 bg-black/30 text-xs text-white"
      />
    </label>
  );
}

export function AdminReviews({ sampleRatings = null, onOpenUser }: { sampleRatings?: AdminRating[] | null; onOpenUser?: (email: string) => void } = {}) {
  const [catalog, setCatalog] = useState<AdminRating[]>(() => sampleRatings ?? []);
  const [rows, setRows] = useState<AdminRating[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EditableRating>>({});
  const [starRatingsDrafts, setStarRatingsDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draftFilter, setDraftFilter] = useState("all");
  const [archiveFilter, setArchiveFilter] = useState("active");
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const loadRows = useCallback(async () => {
    if (sampleRatings) {
      setLoading(true);
      setError(null);
      const query = search.trim().toLowerCase();
      const filtered = catalog.filter((row) => {
        if (draftFilter === "drafts" && !row.is_draft) return false;
        if (draftFilter === "submitted" && row.is_draft) return false;
        if (archiveFilter === "active" && row.archived_at) return false;
        if (archiveFilter === "archived" && !row.archived_at) return false;
        if (!query) return true;
        return [row.target_firm_name, row.target_person_name, row.author_name, row.author_email, row.interaction_type, row.comment, row.id]
          .some((value) => value?.toLowerCase().includes(query));
      });
      const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
      setRows(pageRows);
      setTotal(filtered.length);
      setDrafts(Object.fromEntries(pageRows.map((row) => [row.id, {
        comment: row.comment,
        interaction_detail: row.interaction_detail,
        score_resp: row.score_resp,
        score_respect: row.score_respect,
        score_feedback: row.score_feedback,
        score_follow_thru: row.score_follow_thru,
        score_value_add: row.score_value_add,
        nps: row.nps,
        anonymous: row.anonymous,
        verified: row.verified,
        is_draft: row.is_draft,
      }])));
      setStarRatingsDrafts(Object.fromEntries(pageRows.map((row) => [row.id, JSON.stringify(row.star_ratings ?? {}, null, 2)])));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ entity: "vc-ratings", limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), archive: archiveFilter });
      if (draftFilter !== "all") params.set("draft", draftFilter === "drafts" ? "true" : "false");
      const result = await requestRatings(params);
      setRows(result.rows);
      setTotal(result.total);
      setDrafts(Object.fromEntries(result.rows.map((row) => [row.id, {
        comment: row.comment,
        interaction_detail: row.interaction_detail,
        score_resp: row.score_resp,
        score_respect: row.score_respect,
        score_feedback: row.score_feedback,
        score_follow_thru: row.score_follow_thru,
        score_value_add: row.score_value_add,
        nps: row.nps,
        anonymous: row.anonymous,
        verified: row.verified,
        is_draft: row.is_draft,
      }])));
      setStarRatingsDrafts(Object.fromEntries(result.rows.map((row) => [row.id, JSON.stringify(row.star_ratings ?? {}, null, 2)])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load reviews");
    } finally {
      setLoading(false);
    }
  }, [archiveFilter, catalog, draftFilter, page, sampleRatings, search]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const visibleRows = useMemo(() => {
    if (sampleRatings) return rows;
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => [
      row.target_firm_name,
      row.target_person_name,
      row.interaction_type,
      row.comment,
      row.id,
    ].some((value) => value?.toLowerCase().includes(query)));
  }, [rows, sampleRatings, search]);

  const updateDraft = <K extends keyof EditableRating>(id: string, key: K, value: EditableRating[K]) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  };

  const saveRow = async (row: AdminRating) => {
    const draft = drafts[row.id];
    if (!draft) return;
    let starRatings: unknown;
    try {
      starRatings = JSON.parse(starRatingsDrafts[row.id] ?? "{}");
    } catch {
      toast.error("Structured review answers must be valid JSON", { description: row.target_firm_name || row.target_person_name || row.id });
      return;
    }
    if (!starRatings || typeof starRatings !== "object" || Array.isArray(starRatings)) {
      toast.error("Structured review answers must be a JSON object");
      return;
    }

    setSavingIds((current) => new Set(current).add(row.id));
    if (sampleRatings) {
      const saved = { ...row, ...draft, star_ratings: starRatings };
      setCatalog((current) => current.map((candidate) => candidate.id === row.id ? saved : candidate));
      setRows((current) => current.map((candidate) => candidate.id === row.id ? saved : candidate));
      toast.success("Review and scores saved in the test console");
      setEditingIds((current) => { const next = new Set(current); next.delete(row.id); return next; });
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
      return;
    }
    try {
      if (!SUPABASE_URL) throw new Error("Supabase is not configured");
      const url = `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=vc-ratings&id=${encodeURIComponent(row.id)}`;
      const response = await fetch(url, { method: "PATCH", headers: await adminHeaders(), body: JSON.stringify({ ...draft, star_ratings: starRatings }) });
      const payload = await response.json().catch(() => ({})) as { row?: AdminRating; error?: string };
      if (!response.ok || !payload.row) throw new Error(payload.error || `Save failed (${response.status})`);
      setRows((current) => current.map((candidate) => candidate.id === row.id ? { ...candidate, ...payload.row } : candidate));
      setEditingIds((current) => { const next = new Set(current); next.delete(row.id); return next; });
      toast.success("Review and scores saved");
    } catch (cause) {
      toast.error("Could not save review", { description: cause instanceof Error ? cause.message : "Unknown error" });
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  };

  const archiveRow = async (row: AdminRating) => {
    const archivedAt = row.archived_at ? null : new Date().toISOString();
    try {
      if (sampleRatings) {
        const updated = { ...row, archived_at: archivedAt };
        setCatalog((current) => current.map((candidate) => candidate.id === row.id ? updated : candidate));
        setRows((current) => current.map((candidate) => candidate.id === row.id ? updated : candidate));
        toast.success(archivedAt ? "Review archived" : "Review restored");
        return;
      }
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?entity=vc-ratings&id=${encodeURIComponent(row.id)}`, {
        method: "PATCH", headers: await adminHeaders(), body: JSON.stringify({ archived_at: archivedAt }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `Update failed (${response.status})`);
      toast.success(archivedAt ? "Review archived" : "Review restored");
      await loadRows();
    } catch (cause) {
      toast.error("Could not update review archive status", { description: cause instanceof Error ? cause.message : "Unknown error" });
    }
  };

  const deleteRow = async (row: AdminRating) => {
    if (!window.confirm("Permanently delete this review? This cannot be undone.")) return;
    try {
      if (sampleRatings) {
        setCatalog((current) => current.filter((candidate) => candidate.id !== row.id));
      } else {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?entity=vc-ratings&id=${encodeURIComponent(row.id)}`, { method: "DELETE", headers: await adminHeaders() });
        const payload = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(payload.error || `Delete failed (${response.status})`);
      }
      setRows((current) => current.filter((candidate) => candidate.id !== row.id));
      setTotal((current) => Math.max(0, current - 1));
      toast.success("Review deleted");
    } catch (cause) {
      toast.error("Could not delete review", { description: cause instanceof Error ? cause.message : "Unknown error" });
    }
  };

  const cancelEdit = (row: AdminRating) => {
    setDrafts((current) => ({ ...current, [row.id]: {
      comment: row.comment, interaction_detail: row.interaction_detail,
      score_resp: row.score_resp, score_respect: row.score_respect, score_feedback: row.score_feedback,
      score_follow_thru: row.score_follow_thru, score_value_add: row.score_value_add, nps: row.nps,
      anonymous: row.anonymous, verified: row.verified, is_draft: row.is_draft,
    } }));
    setStarRatingsDrafts((current) => ({ ...current, [row.id]: JSON.stringify(row.star_ratings ?? {}, null, 2) }));
    setEditingIds((current) => { const next = new Set(current); next.delete(row.id); return next; });
  };

  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="space-y-5">
      <AdminStickyHeader
        trailing={(
          <button type="button" onClick={() => void loadRows()} disabled={loading} className="inline-flex h-8 items-center gap-2 border border-white/10 px-3 text-xs text-white/60 transition hover:border-white/20 hover:text-white disabled:opacity-40">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        )}
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300">Investor records</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Reviews &amp; Scores</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/45">Review and update founder feedback, individual scores, and structured review answers.</p>
        </div>
      </AdminStickyHeader>

      <AdminStickyFilters className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search firm, person, review, or ID…" className="h-8 border-white/10 bg-white/[0.04] pl-8 text-xs text-white" />
        </div>
        <select value={draftFilter} onChange={(event) => { setDraftFilter(event.target.value); setPage(0); }} className="h-8 border border-white/10 bg-[#101010] px-2 text-xs text-white/70">
          <option value="all">All reviews</option>
          <option value="submitted">Submitted</option>
          <option value="drafts">Drafts</option>
        </select>
        <select value={archiveFilter} onChange={(event) => { setArchiveFilter(event.target.value); setPage(0); }} className="h-8 border border-white/10 bg-[#101010] px-2 text-xs text-white/70" aria-label="Archive status">
          <option value="active">Live reviews</option>
          <option value="archived">Archived</option>
          <option value="all">All archive states</option>
        </select>
        <span className="ml-auto font-mono text-[11px] text-white/35">{total.toLocaleString()} reviews</span>
      </AdminStickyFilters>

      {error ? (
        <div className="rounded-lg border border-red-400/20 bg-red-400/[0.05] p-4 text-sm text-red-200">{error}</div>
      ) : loading ? (
        <div className="rounded-lg border border-white/[0.08] p-10 text-center text-sm text-white/40">Loading reviews…</div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border border-white/[0.08] p-10 text-center text-sm text-white/40">No reviews found.</div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map((row) => {
            const draft = drafts[row.id];
            const saving = savingIds.has(row.id);
            const target = row.target_person_name
              ? `${row.target_person_name}${row.target_firm_name ? ` · ${row.target_firm_name}` : ""}`
              : row.target_firm_name || "Unknown firm";
            return (
              <article key={row.id} className="rounded-lg border border-white/[0.08] bg-[#080808] p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-medium text-white/85">{target}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                      <span>{row.interaction_type === "ongoing" ? "Ongoing relationship" : row.interaction_type === "email" ? "Email interaction" : row.interaction_type.replaceAll("_", " ")} · {formatDate(row.created_at)}</span>
                      {row.anonymous && <span className="rounded-full border border-purple-400/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-200">Anonymous</span>}
                      {row.archived_at && <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">Archived</span>}
                    </p>
                    <p className="mt-1 text-[11px] text-white/60">
                      Submitted by {row.author_name || row.author_user_id || "Unknown user"} · {row.author_email ? <button type="button" onClick={() => onOpenUser?.(row.author_email!)} className="text-emerald-200 underline decoration-emerald-200/30 underline-offset-2 hover:text-emerald-100" title="Open user record">{row.author_email}</button> : "Email unavailable"}
                    </p>
                    <p className="mt-1 truncate font-mono text-[9px] text-white/25">{row.id}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {editingIds.has(row.id) ? <>
                      <button type="button" onClick={() => void saveRow(row)} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-300 px-3 text-xs font-semibold text-black disabled:opacity-50">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                      </button>
                      <button type="button" onClick={() => cancelEdit(row)} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs text-white/65"><X className="h-3.5 w-3.5" /> Cancel</button>
                    </> : <button type="button" onClick={() => setEditingIds((current) => new Set(current).add(row.id))} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs text-white/65 hover:text-white"><Pencil className="h-3.5 w-3.5" /> Edit</button>}
                    <button type="button" onClick={() => void archiveRow(row)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs text-white/65 hover:text-white">
                      {row.archived_at ? <Undo2 className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}{row.archived_at ? "Restore" : "Archive"}
                    </button>
                    <button type="button" onClick={() => void deleteRow(row)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-400/20 px-2.5 text-xs text-red-200/80 hover:text-red-100"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                </div>

                {draft && editingIds.has(row.id) && (
                  <>
                    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      {(["score_resp", "score_respect", "score_feedback", "score_follow_thru", "score_value_add"] as const).map((key) => (
                        <ScoreInput key={key} label={scoreLabel(key)} value={draft[key]} max={5} onChange={(value) => updateDraft(row.id, key, value)} />
                      ))}
                      <ScoreInput label="Overall (0–10)" value={draft.nps} max={10} onChange={(value) => updateDraft(row.id, "nps", value)} />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <label className="space-y-1 text-[10px] text-white/45">
                        <span className="block">Review comment</span>
                        <textarea value={draft.comment ?? ""} onChange={(event) => updateDraft(row.id, "comment", event.target.value || null)} rows={4} className="w-full resize-y rounded-md border border-white/10 bg-black/30 p-2 text-xs leading-relaxed text-white outline-none focus:border-emerald-300/40" placeholder="No written comment" />
                      </label>
                      <div className="space-y-3">
                        <label className="block space-y-1 text-[10px] text-white/45">
                          <span className="block">Interaction detail</span>
                          <textarea value={draft.interaction_detail ?? ""} onChange={(event) => updateDraft(row.id, "interaction_detail", event.target.value || null)} rows={2} className="w-full resize-y rounded-md border border-white/10 bg-black/30 p-2 text-xs text-white outline-none focus:border-emerald-300/40" />
                        </label>
                        <div className="flex flex-wrap gap-4 text-[11px] text-white/55">
                          {(["anonymous", "verified", "is_draft"] as const).map((key) => (
                            <label key={key} className="inline-flex items-center gap-2 capitalize">
                              <input type="checkbox" checked={draft[key]} onChange={(event) => updateDraft(row.id, key, event.target.checked)} className="accent-emerald-300" />
                              {key === "is_draft" ? "Draft" : key}
                            </label>
                          ))}
                        </div>
                        <details className="rounded border border-white/[0.08] px-2 py-1.5">
                          <summary className="cursor-pointer text-[10px] text-white/45">Structured review answers (JSON)</summary>
                          <textarea value={starRatingsDrafts[row.id] ?? "{}"} onChange={(event) => setStarRatingsDrafts((current) => ({ ...current, [row.id]: event.target.value }))} rows={8} className="mt-2 w-full rounded-md border border-white/10 bg-black/30 p-2 font-mono text-[10px] text-white/70 outline-none focus:border-emerald-300/40" spellCheck={false} />
                        </details>
                      </div>
                    </div>
                  </>
                )}
                {draft && !editingIds.has(row.id) && <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      ["Responsiveness", row.score_resp, 5], ["Respect", row.score_respect, 5],
                      ["Feedback", row.score_feedback, 5], ["Follow through", row.score_follow_thru, 5],
                      ["Value add", row.score_value_add, 5], ["Overall", row.nps, 10],
                    ].map(([label, value, max]) => <p key={String(label)} className="text-[10px] text-white/40">
                      {label}<span className="ml-1 text-xs text-white/80">{value ?? "—"}/{max}</span>
                    </p>)}
                  </div>
                  <div className="grid gap-2 text-xs text-white/55 sm:grid-cols-2">
                    <p className="line-clamp-2">Comment: <span className="text-white/80">{row.comment || "No written comment"}</span></p>
                    <p className="line-clamp-2">Interaction detail: <span className="text-white/80">{row.interaction_detail || "—"}</span></p>
                  </div>
                </div>}
              </article>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-white/45">
        <span>Page {page + 1} of {maxPage + 1}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))} className="border border-white/10 px-3 py-1.5 disabled:opacity-30">Previous</button>
          <button type="button" disabled={page >= maxPage || loading} onClick={() => setPage((current) => Math.min(maxPage, current + 1))} className="border border-white/10 px-3 py-1.5 disabled:opacity-30">Next</button>
        </div>
      </div>
    </div>
  );
}
