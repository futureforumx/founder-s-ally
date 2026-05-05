/**
 * Edit public /tools/ai-agents hero copy (title, description, SEO meta).
 * Stored in `tool_category_page_overrides`; empty fields fall back to app defaults.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { getSupabaseBearerForFunctions, isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TOOL_CATEGORY_INTROS } from "@/features/tools/lib/tools";
import { fetchToolCategoryPageOverride } from "@/features/tools/lib/toolCategoryPageOverrides";

const SLUG = "ai-agents";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const DEFAULTS = TOOL_CATEGORY_INTROS["AI Agents"];

const IC =
  "w-full rounded-md px-2.5 py-2 text-[13px] text-white/85 outline-none transition-colors placeholder:text-white/25";
const IS = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" } as const;
const IF = { ...IS, borderColor: "rgba(46,230,166,0.4)" } as const;

function FL({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
        {label}
      </label>
      {hint ? (
        <p className="mb-1.5 font-mono text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.28)" }}>
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

type Row = {
  category_slug: string;
  title: string | null;
  description: string | null;
  meta: string | null;
  updated_at: string | null;
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

async function fetchRow(): Promise<{ row: Row | null; error?: string }> {
  if (!isSupabaseConfigured) return { row: null, error: "Supabase not configured" };
  const row = await fetchToolCategoryPageOverride(SLUG);
  return { row: row as Row | null };
}

async function saveViaEdgeFunction(body: Record<string, string | null>): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_URL) return { ok: false, error: "Supabase not configured" };
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/admin-market-intel?entity=tool-category-page&slug=${encodeURIComponent(SLUG)}`,
    { method: "PATCH", headers: await adminHeaders(), body: JSON.stringify(body) },
  );
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
  return { ok: true };
}

export function AdminAiAgentsToolPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [meta, setMeta] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { row, error } = await fetchRow();
    if (error) setLoadError(error);
    if (row) {
      setTitle(row.title ?? "");
      setDescription(row.description ?? "");
      setMeta(row.meta ?? "");
      setUpdatedAt(row.updated_at);
    } else if (!error) {
      setTitle("");
      setDescription("");
      setMeta("");
      setUpdatedAt(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase not configured");
      const body = {
        title: title.trim() || null,
        description: description.trim() || null,
        meta: meta.trim() || null,
      };

      const { data, error } = await supabase
        .from("tool_category_page_overrides")
        .upsert(
          {
            category_slug: SLUG,
            title: body.title,
            description: body.description,
            meta: body.meta,
          },
          { onConflict: "category_slug" },
        )
        .select("*")
        .single();

      if (!error && data) {
        toast.success("AI Agents page saved");
        void load();
        return;
      }

      const fallback = await saveViaEdgeFunction(body);
      if (fallback.ok) {
        toast.success("AI Agents page saved");
        void load();
        return;
      }

      const combined = [error?.message, fallback.error].filter(Boolean).join(" · ");
      const hint = combined.includes("Unknown entity")
        ? " Deploy admin-market-intel from this repo, or apply migrations including 20260504220000_tool_category_page_admin_write.sql so authenticated admins can save without the edge function."
        : "";
      throw new Error(combined + hint);
    } catch (e: unknown) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white/90">AI Agents tool page</h1>
        <p className="mt-1 font-mono text-xs" style={{ color: "rgba(255,255,255,0.32)" }}>
          Public URL{" "}
          <code className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-emerald-400/90">
            /tools/ai-agents
          </code>
          . Leave a field empty to use the built-in default.
        </p>
        <a
          href="/tools/ai-agents"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-emerald-400/90 hover:text-emerald-400"
        >
          Open live page <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 font-mono text-[12px] text-amber-200/90">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/45">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
          Loading…
        </div>
      ) : (
        <>
          <div className="space-y-4 rounded-xl border p-5" style={{ borderColor: "rgba(255,255,255,0.08)", background: "#0a0a0a" }}>
            <FL label="Page title (H1)" hint={`Default: ${DEFAULTS.title}`}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={DEFAULTS.title}
                className={IC}
                style={IS}
                onFocus={(e) => Object.assign(e.target.style, IF)}
                onBlur={(e) => Object.assign(e.target.style, IS)}
              />
            </FL>
            <FL label="Hero description" hint={`Default begins: ${DEFAULTS.description.slice(0, 72)}…`}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={DEFAULTS.description}
                rows={4}
                className={`${IC} resize-y min-h-[100px]`}
                style={IS}
                onFocus={(e) => Object.assign(e.target.style, IF)}
                onBlur={(e) => Object.assign(e.target.style, IS)}
              />
            </FL>
            <FL label="Meta description (SEO)" hint={`Default: ${DEFAULTS.meta.slice(0, 90)}…`}>
              <textarea
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
                placeholder={DEFAULTS.meta}
                rows={3}
                className={`${IC} resize-y min-h-[72px]`}
                style={IS}
                onFocus={(e) => Object.assign(e.target.style, IF)}
                onBlur={(e) => Object.assign(e.target.style, IS)}
              />
            </FL>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-[13px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </button>
            {updatedAt ? (
              <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                Last updated {new Date(updatedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
