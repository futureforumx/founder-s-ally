import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Layers, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, isValid } from "date-fns";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AdminStickyHeader } from "@/components/admin/AdminStickyHeader";
import { AdminFirmEditor } from "@/components/admin/AdminFirmRecords";

export type RecordUpdateKind =
  | "vc_firm"
  | "vc_investor"
  | "company"
  | "user_founder"
  | "user_operator"
  | "user_investor"
  | "user_other";

export interface RecordUpdateRow {
  kind: RecordUpdateKind;
  recordId: string;
  name: string;
  subtitle: string | null;
  updatedAt: string;
  firmId?: string | null;
}

const KIND_LABEL: Record<RecordUpdateKind, string> = {
  vc_firm: "VC firm",
  vc_investor: "VC investor",
  company: "Company",
  user_founder: "Founder",
  user_operator: "Operator",
  user_investor: "Investor (user)",
  user_other: "User (other)",
};

function changeTypeLabel(row: RecordUpdateRow): string {
  switch (row.kind) {
    case "vc_firm": return "Firm details updated";
    case "vc_investor": return row.firmId ? "Linked to firm" : "Investor details updated";
    case "company": return "Company details updated";
    case "user_founder": return "Founder profile updated";
    case "user_operator": return "Operator profile updated";
    case "user_investor": return "Investor profile updated";
    case "user_other": return "User profile updated";
  }
}

type CategoryFilter =
  | "all"
  | RecordUpdateKind;

function isCategoryFilter(value: string): value is CategoryFilter {
  switch (value) {
    case "all":
    case "vc_firm":
    case "vc_investor":
    case "company":
    case "user_founder":
    case "user_operator":
    case "user_investor":
    case "user_other":
      return true;
    default:
      return false;
  }
}

type SortKey = "updatedAt" | "name" | "kind";

const DIRECTORY_PAGE_SIZE = 50;
const DIRECTORY_KINDS = new Set<CategoryFilter>(["vc_firm", "vc_investor"]);

type EditorTarget = {
  firmId: string;
  initialTab: "profile" | "investors";
  focusInvestorId: string | null;
};

export function AdminRecordUpdates() {
  const [rows, setRows] = useState<RecordUpdateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [dSearch, setDSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const isDirectory = DIRECTORY_KINDS.has(category);
  const requestSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setDSearch(search.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const { data, error } = await invokeEdgeFunction("admin-record-updates", {
        preferClerkSessionToken: true,
        body: isDirectory
          ? { kind: category, search: dSearch, limit: DIRECTORY_PAGE_SIZE, offset: page * DIRECTORY_PAGE_SIZE }
          : {},
      });
      if (error) {
        let detail = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const j = (await ctx.json()) as { error?: string };
            if (typeof j?.error === "string") detail = j.error;
          } catch {
            /* ignore */
          }
        }
        throw new Error(detail);
      }
      const body = data as { updates?: RecordUpdateRow[]; total?: number; directory?: boolean; error?: string };
      if (body?.error) throw new Error(body.error);
      if (seq !== requestSeq.current) return;
      const updates = body?.updates ?? [];
      if (isDirectory && body?.directory !== true) {
        throw new Error("The record list is still capped. Deploy the admin-record-updates function to page through every firm and investor.");
      }
      setRows(updates);
      setTotal(typeof body?.total === "number" ? body.total : updates.length);
    } catch (e: unknown) {
      if (seq !== requestSeq.current) return;
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Failed to load record updates", { description: msg });
      setRows([]);
      setTotal(0);
    }
    if (seq === requestSeq.current) setLoading(false);
  }, [category, dSearch, isDirectory, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (category === "all") return rows;
    return rows.filter((r) => r.kind === category);
  }, [rows, category]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortKey === "updatedAt") {
        return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
      }
      if (sortKey === "name") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * dir;
      }
      return (KIND_LABEL[a.kind].localeCompare(KIND_LABEL[b.kind], undefined, { sensitivity: "base" }) * dir);
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "updatedAt" ? "desc" : "asc");
    }
  };

  const pages = isDirectory ? Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)) : 1;
  const grid = "minmax(100px,0.8fr) minmax(180px,1.5fr) minmax(140px,1.2fr) minmax(160px,1.3fr) minmax(120px,1fr) 64px";

  const openEditor = (row: RecordUpdateRow) => {
    if (row.kind !== "vc_firm" && row.kind !== "vc_investor") return;
    const firmId = row.kind === "vc_firm" ? row.recordId : row.firmId;
    if (!firmId) {
      toast.error("This investor is not linked to a firm");
      return;
    }
    setEditor({
      firmId,
      initialTab: row.kind === "vc_investor" ? "investors" : "profile",
      focusInvestorId: row.kind === "vc_investor" ? row.recordId : null,
    });
  };

  const SortHead = ({ col, children }: { col: SortKey; children: ReactNode }) => {
    const active = sortKey === col;
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className="inline-flex items-center gap-1 font-mono transition-colors hover:text-white/70"
        style={{ color: active ? "#2EE6A6" : "rgba(255,255,255,0.35)" }}
      >
        {children}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <AdminStickyHeader>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-mono text-lg font-semibold text-white/90">Record updates</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isDirectory && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={category === "vc_firm" ? "Search firm name or paste UUID" : "Search investor, title, or firm"}
                className="h-9 w-[240px] border-white/10 bg-white/5 pl-8 text-xs text-white/80 placeholder:text-white/30"
              />
            </div>
          )}
          <FilterSelect
            label="Category"
            icon={Layers}
            value={category}
            options={[
              { value: "all", label: "All" },
              { value: "vc_firm", label: "VC firms" },
              { value: "vc_investor", label: "VC investors" },
              { value: "company", label: "Companies" },
              { value: "user_founder", label: "Founders" },
              { value: "user_operator", label: "Operators" },
              { value: "user_investor", label: "Investors" },
              { value: "user_other", label: "Other users" },
            ]}
            onValueChange={(value) => {
              if (!isCategoryFilter(value)) return;

              setCategory(value);
              setPage(0);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="h-9 border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>
      </AdminStickyHeader>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="min-w-[960px]">
          <div
            className="grid items-center gap-2 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest"
            style={{
              background: "rgba(255,255,255,0.02)",
              color: "rgba(255,255,255,0.3)",
              gridTemplateColumns: grid,
            }}
          >
            <SortHead col="kind">Category</SortHead>
            <SortHead col="name">Name</SortHead>
            <span className="font-mono">Change type</span>
            <span className="font-mono">Detail</span>
            <SortHead col="updatedAt">Updated</SortHead>
            <span className="font-mono">Edit</span>
          </div>

          {sorted.map((r) => {
            const editable = r.kind === "vc_firm" || r.kind === "vc_investor";
            return (
            <div
              key={`${r.kind}-${r.recordId}`}
              className={cn("grid items-center gap-2 border-t px-4 py-2.5 transition-colors hover:bg-white/[0.02]", editable && "cursor-pointer")}
              style={{ borderColor: "rgba(255,255,255,0.04)", gridTemplateColumns: grid }}
              onClick={() => openEditor(r)}
            >
              <span className="font-mono text-[11px]" style={{ color: "#2EE6A6" }}>
                {KIND_LABEL[r.kind]}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/85">{r.name}</p>
                <p className="truncate font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }} title={r.recordId}>
                  {r.recordId}
                </p>
              </div>
              <p className="truncate text-[11px] text-white/55" title={changeTypeLabel(r)}>
                {changeTypeLabel(r)}
              </p>
              <p className="truncate text-[11px] text-white/45" title={r.subtitle ?? ""}>
                {r.subtitle ?? "—"}
              </p>
              <span className="text-[11px] text-white/50">
                {(() => {
                  const d = new Date(r.updatedAt);
                  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : "—";
                })()}
              </span>
              {editable ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openEditor(r); }}
                  className="rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: "rgba(46,230,166,0.14)", color: "#2EE6A6" }}
                >
                  Edit
                </button>
              ) : (
                <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
              )}
            </div>
            );
          })}

          {sorted.length === 0 && (
            <p className="py-12 text-center font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              No records in this view.
            </p>
          )}
          </div>
        </div>
      )}

      {isDirectory && pages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            {page + 1} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages - 1 || loading}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[12px] disabled:opacity-30"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {editor && (
        <AdminFirmEditor
          firmId={editor.firmId}
          initialTab={editor.initialTab}
          focusInvestorId={editor.focusInvestorId}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
