import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabaseBearerForFunctions } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FRESH_CAPITAL_PUBLIC_DESTINATIONS,
  formatFreshCapitalPublicPath,
  parseFreshCapitalPublicDestination,
  validateFreshCapitalPublicPathInput,
  type FreshCapitalPublicDestination,
} from "@/lib/freshCapitalPublicPaths";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

type PublicPathRow = {
  id: string;
  path_slug: string;
  destination: FreshCapitalPublicDestination;
  created_at: string;
  updated_at: string;
};

async function adminHeaders(): Promise<Record<string, string>> {
  const jwt = await getSupabaseBearerForFunctions();
  const anon = SUPABASE_ANON_KEY ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${anon}`,
    apikey: anon,
    "X-User-Auth": jwt ?? "",
  };
}

async function adminFetch(
  path: string,
  init?: RequestInit,
): Promise<{ json: Record<string, unknown>; ok: boolean; status: number }> {
  if (!SUPABASE_URL) return { json: { error: "Supabase not configured" }, ok: false, status: 0 };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${path}`, {
    ...init,
    headers: { ...(await adminHeaders()), ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { json, ok: res.ok, status: res.status };
}

export function FreshCapitalPublicPathsAdmin() {
  const [rows, setRows] = useState<PublicPathRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftPath, setDraftPath] = useState("");
  const [draftDestination, setDraftDestination] = useState<FreshCapitalPublicDestination>("new_funds");
  const [adding, setAdding] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { json, ok } = await adminFetch("entity=fc-public-paths");
    setLoading(false);
    if (!ok) {
      setError(typeof json.error === "string" ? json.error : "Could not load domain extensions");
      return;
    }
    const next = Array.isArray(json.rows)
      ? (json.rows as PublicPathRow[]).filter(
          (row) => row?.path_slug && parseFreshCapitalPublicDestination(row.destination),
        )
      : [];
    setRows(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addPath = async () => {
    const { slug, error: pathError } = validateFreshCapitalPublicPathInput(draftPath);
    if (!slug || pathError) {
      toast.error(pathError ?? "Enter a path");
      return;
    }
    setAdding(true);
    const { json, ok } = await adminFetch("entity=fc-public-paths", {
      method: "POST",
      body: JSON.stringify({ path: slug, destination: draftDestination }),
    });
    setAdding(false);
    if (!ok) {
      toast.error(typeof json.error === "string" ? json.error : "Could not add path");
      return;
    }
    const row = json.row as PublicPathRow | undefined;
    if (row?.id) {
      setRows((prev) => [...prev.filter((r) => r.path_slug !== row.path_slug), row]
        .sort((a, b) => a.path_slug.localeCompare(b.path_slug)));
    } else {
      void load();
    }
    setDraftPath("");
    toast.success(`Added ${formatFreshCapitalPublicPath(slug)}`);
  };

  const patchDestination = async (id: string, destination: FreshCapitalPublicDestination) => {
    setSavingId(id);
    const prev = rows;
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, destination } : r)));
    const { json, ok } = await adminFetch(`entity=fc-public-paths&id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ destination }),
    });
    setSavingId(null);
    if (!ok) {
      setRows(prev);
      toast.error(typeof json.error === "string" ? json.error : "Could not update destination");
    }
  };

  const removePath = async (row: PublicPathRow) => {
    if (!window.confirm(`Remove ${formatFreshCapitalPublicPath(row.path_slug)}?`)) return;
    setSavingId(row.id);
    const { json, ok } = await adminFetch(
      `entity=fc-public-paths&id=${encodeURIComponent(row.id)}&action=delete`,
      { method: "POST", body: JSON.stringify({}) },
    );
    setSavingId(null);
    if (!ok) {
      toast.error(typeof json.error === "string" ? json.error : "Could not remove path");
      return;
    }
    setRows((cur) => cur.filter((r) => r.id !== row.id));
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-label={open ? "Collapse domain extensions" : "Expand domain extensions"}
        >
          <span className="min-w-0">
            <span
              className="block text-[10px] font-medium uppercase tracking-[0.12em]"
              style={{ color: "rgba(255,255,255,0.35)", fontFamily: "ui-monospace, monospace" }}
            >
              Domain extensions
            </span>
            {!open ? (
              <span className="mt-0.5 block text-[11px]" style={{ color: "rgba(255,255,255,0.38)" }}>
                {loading
                  ? "Public paths for New Funds or Latest Funding"
                  : rows.length
                    ? `${rows.length} path${rows.length === 1 ? "" : "s"} · New Funds or Latest Funding`
                    : "Add a public path for New Funds or Latest Funding"}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform duration-200"
            style={{
              color: "rgba(255,255,255,0.4)",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
      <p className="mt-3 text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
        Public paths such as <span className="font-mono text-white/55">/fresh-capital</span> open New Funds or Latest Funding.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={draftPath}
          onChange={(e) => setDraftPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addPath();
            }
          }}
          placeholder="/fresh-capital"
          className="h-8 min-w-[180px] flex-1 font-mono text-[12px]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)" }}
        />
        <Select
          value={draftDestination}
          onValueChange={(v) => {
            const dest = parseFreshCapitalPublicDestination(v);
            if (dest) setDraftDestination(dest);
          }}
        >
          <SelectTrigger
            className="h-8 w-[160px] text-[12px]"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FRESH_CAPITAL_PUBLIC_DESTINATIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => void addPath()}
          disabled={adding}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
          style={{ borderColor: "rgba(46,230,166,0.35)", color: "#2EE6A6", background: "rgba(46,230,166,0.08)" }}
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-[11px]" style={{ color: "#ef4444" }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading paths…
        </div>
      ) : rows.length ? (
        <div className="mt-3 flex flex-col gap-1.5">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <span className="min-w-[140px] flex-1 font-mono text-[12px] text-white/80">
                {formatFreshCapitalPublicPath(row.path_slug)}
              </span>
              <Select
                value={row.destination}
                onValueChange={(v) => {
                  const dest = parseFreshCapitalPublicDestination(v);
                  if (dest) void patchDestination(row.id, dest);
                }}
                disabled={savingId === row.id}
              >
                <SelectTrigger
                  className="h-7 w-[160px] text-[11px]"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRESH_CAPITAL_PUBLIC_DESTINATIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <a
                href={formatFreshCapitalPublicPath(row.path_slug)}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1 text-white/35 hover:text-white/80"
                aria-label={`Open ${formatFreshCapitalPublicPath(row.path_slug)}`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => void removePath(row)}
                disabled={savingId === row.id}
                className="rounded p-1 text-white/35 hover:text-red-400 disabled:opacity-50"
                aria-label={`Remove ${formatFreshCapitalPublicPath(row.path_slug)}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : !error ? (
        <p className="mt-3 text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          No domain extensions yet. Add one to publish a public URL.
        </p>
      ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
