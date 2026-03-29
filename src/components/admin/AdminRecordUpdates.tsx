import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Loader2, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, isValid } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

type CategoryFilter =
  | "all"
  | RecordUpdateKind;

type SortKey = "updatedAt" | "name" | "kind";

export function AdminRecordUpdates() {
  const [rows, setRows] = useState<RecordUpdateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeEdgeFunction("admin-record-updates");
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
      const body = data as { updates?: RecordUpdateRow[]; error?: string };
      if (body?.error) throw new Error(body.error);
      setRows(body?.updates ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Failed to load record updates", { description: msg });
      setRows([]);
    }
    setLoading(false);
  }, []);

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

  const SortHead = ({ col, children }: { col: SortKey; children: ReactNode }) => {
    const active = sortKey === col;
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className="inline-flex items-center gap-1 font-mono transition-colors hover:text-white/70"
        style={{ color: active ? "#39FF14" : "rgba(255,255,255,0.35)" }}
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-lg font-semibold text-white/90">Record updates</h1>
          <p className="mt-1 font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Latest changes by record type · {sorted.length} shown
            {category !== "all" ? ` (filtered)` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={category} onValueChange={(v) => setCategory(v as CategoryFilter)}>
            <SelectTrigger
              className="h-9 w-[200px] border-white/10 bg-white/5 text-xs text-white/70"
            >
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="vc_firm">VC firm</SelectItem>
              <SelectItem value="vc_investor">VC investor</SelectItem>
              <SelectItem value="company">Company (users)</SelectItem>
              <SelectItem value="user_founder">Founders (users)</SelectItem>
              <SelectItem value="user_operator">Operators (users)</SelectItem>
              <SelectItem value="user_investor">Investors (users)</SelectItem>
              <SelectItem value="user_other">Users (other type)</SelectItem>
            </SelectContent>
          </Select>
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

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#39FF14" }} />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div
            className="grid items-center gap-2 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest"
            style={{
              background: "rgba(255,255,255,0.02)",
              color: "rgba(255,255,255,0.3)",
              gridTemplateColumns: "1.1fr 2fr 1.5fr 1fr",
            }}
          >
            <SortHead col="kind">Category</SortHead>
            <SortHead col="name">Name</SortHead>
            <span className="font-mono">Detail</span>
            <SortHead col="updatedAt">Updated</SortHead>
          </div>

          {sorted.map((r) => (
            <div
              key={`${r.kind}-${r.recordId}`}
              className="grid items-center gap-2 border-t px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
              style={{ borderColor: "rgba(255,255,255,0.04)", gridTemplateColumns: "1.1fr 2fr 1.5fr 1fr" }}
            >
              <span className="font-mono text-[11px]" style={{ color: "#39FF14" }}>
                {KIND_LABEL[r.kind]}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/85">{r.name}</p>
                <p className="truncate font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }} title={r.recordId}>
                  {r.recordId}
                </p>
              </div>
              <p className="truncate text-[11px] text-white/45" title={r.subtitle ?? ""}>
                {r.subtitle ?? "—"}
              </p>
              <span className="text-[11px] text-white/50">
                {(() => {
                  const d = new Date(r.updatedAt);
                  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : "—";
                })()}
              </span>
            </div>
          ))}

          {sorted.length === 0 && (
            <p className="py-12 text-center font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              No records in this view.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
