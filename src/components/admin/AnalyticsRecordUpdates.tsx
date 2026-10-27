import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BouncingDots } from "@/components/loading-ui/bouncing-dots";
import { ENGAGEMENT_CARD } from "@/components/admin/AnalyticsEngagement";
import { getSupabaseBearerForFunctions, supabase } from "@/integrations/supabase/client";
import {
  KIND_LABEL,
  changeTypeLabel,
  loadRecordUpdates,
  recordUpdatedInWindow,
  type RecordUpdateKind,
  type RecordUpdateRow,
} from "@/components/admin/recordUpdates";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

type QueueKind = Extract<RecordUpdateKind, "company" | "vc_firm" | "vc_investor">;

type NeedsConfirmationRow = {
  kind: QueueKind;
  id: string;
  name: string;
  detail: string | null;
};

const QUEUE_ORDER: Record<QueueKind, number> = {
  company: 0,
  vc_firm: 1,
  vc_investor: 2,
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

function placeDetail(city: string | null | undefined, state: string | null | undefined): string | null {
  const place = [city, state].map((part) => part?.trim()).filter(Boolean).join(", ");
  return place || null;
}

async function adminHeaders(): Promise<Record<string, string>> {
  const jwt = await getSupabaseBearerForFunctions();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ""}`,
    "X-User-Auth": jwt ?? "",
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listAdminRows<T>(entity: string, filter: Record<string, string> = {}): Promise<T[]> {
  if (!SUPABASE_URL) throw new Error("Supabase is not configured");
  const pageSize = 100;
  const all: T[] = [];
  for (let page = 0; page < 30; page++) {
    const params = new URLSearchParams({
      entity,
      page: String(page),
      limit: String(pageSize),
    });
    for (const [key, value] of Object.entries(filter)) {
      if (value) params.set(key, value);
    }
    let json: { rows?: T[]; total?: number; error?: string; message?: string } = {};
    let ok = false;
    let status = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-market-intel?${params}`, {
        headers: await adminHeaders(),
      });
      status = res.status;
      json = await res.json().catch(() => ({})) as typeof json;
      if (res.status === 429 && attempt < 3) {
        await wait(800 * (attempt + 1));
        continue;
      }
      ok = res.ok;
      break;
    }
    if (!ok) throw new Error(json.error ?? json.message ?? `Could not load ${entity} (${status})`);
    const rows = json.rows ?? [];
    all.push(...rows);
    const total = typeof json.total === "number" ? json.total : all.length;
    if (rows.length === 0 || all.length >= total) break;
  }
  return all;
}

type CompanyListRow = {
  id: string;
  company_name?: string | null;
  sector?: string | null;
  stage?: string | null;
  hq_city?: string | null;
  hq_state?: string | null;
  record_status?: string | null;
};

async function loadReviewCompanies(): Promise<NeedsConfirmationRow[]> {
  const listed = await listAdminRows<CompanyListRow>("companies");
  const fromCatalog = listed.filter((company) => company.record_status === "needs_review");
  const catalogKnowsStatus = listed.length === 0 || listed.some((company) => "record_status" in company);
  let companies: CompanyListRow[] = fromCatalog;
  if (!catalogKnowsStatus) {
    const fallback = await supabase
      .from("startups")
      .select("id, company_name, sector, stage, hq_city, hq_state, record_status")
      .eq("record_status", "needs_review")
      .is("deleted_at", null)
      .order("company_name", { ascending: true })
      .limit(1000);
    if (fallback.error) throw new Error(fallback.error.message);
    companies = fallback.data ?? [];
  }

  return companies
    .filter((company) => company.record_status === "needs_review")
    .map((company) => {
      const detail = [company.sector, company.stage, placeDetail(company.hq_city, company.hq_state)]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" · ");
      return {
        kind: "company" as const,
        id: company.id,
        name: company.company_name?.trim() || "Unnamed company",
        detail: detail || null,
      };
    });
}

async function loadNeedsConfirmation(): Promise<NeedsConfirmationRow[]> {
  const [companies, firms, people] = await Promise.all([
    loadReviewCompanies(),
    listAdminRows<{ id: string; firm_name?: string | null; hq_city?: string | null; hq_state?: string | null; needs_review?: boolean }>(
      "firms",
      { needs_review: "true" },
    ),
    listAdminRows<{ id: string; full_name?: string | null; title?: string | null; firm_name?: string | null; needs_review?: boolean }>(
      "firm-people",
      { needs_review: "true" },
    ),
  ]);

  const rows: NeedsConfirmationRow[] = [...companies];

  for (const firm of firms) {
    if (firm.needs_review === false) continue;
    rows.push({
      kind: "vc_firm",
      id: firm.id,
      name: firm.firm_name?.trim() || "Unnamed firm",
      detail: placeDetail(firm.hq_city, firm.hq_state),
    });
  }

  for (const person of people) {
    if (person.needs_review === false) continue;
    const detail = [person.firm_name, person.title].map((part) => part?.trim()).filter(Boolean).join(" · ");
    rows.push({
      kind: "vc_investor",
      id: person.id,
      name: person.full_name?.trim() || "Unnamed",
      detail: detail || null,
    });
  }

  rows.sort((a, b) => QUEUE_ORDER[a.kind] - QUEUE_ORDER[b.kind] || a.name.localeCompare(b.name));
  return rows;
}

export function AnalyticsRecordUpdates({
  window,
  refreshKey,
  onOpenCompanyRecord,
  onOpenFirmRecord,
  onOpenPersonRecord,
}: {
  window: { from: string; to: string } | null;
  refreshKey: number;
  onOpenCompanyRecord?: (companyId: string, companyName: string) => void;
  onOpenFirmRecord?: (firmId: string, firmName: string) => void;
  onOpenPersonRecord?: (personId: string, personName: string) => void;
}) {
  const [rows, setRows] = useState<RecordUpdateRow[] | null>(null);
  const [queue, setQueue] = useState<NeedsConfirmationRow[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setActivityError(null);
    setQueueError(null);
    const [activityResult, queueResult] = await Promise.allSettled([
      loadRecordUpdates(),
      loadNeedsConfirmation(),
    ]);

    if (activityResult.status === "fulfilled") {
      setRows(activityResult.value.updates);
    } else {
      setRows([]);
      const reason = activityResult.reason;
      setActivityError(reason instanceof Error ? reason.message : "Could not load record updates");
    }

    if (queueResult.status === "fulfilled") {
      setQueue(queueResult.value);
    } else {
      setQueue([]);
      const reason = queueResult.reason;
      setQueueError(reason instanceof Error ? reason.message : "Could not load records that need confirmation");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const visible = useMemo(
    () => (rows ?? []).filter((row) => recordUpdatedInWindow(row.updatedAt, window)),
    [rows, window],
  );

  const openQueueRow = (row: NeedsConfirmationRow) => {
    if (row.kind === "company") onOpenCompanyRecord?.(row.id, row.name);
    else if (row.kind === "vc_firm") onOpenFirmRecord?.(row.id, row.name);
    else onOpenPersonRecord?.(row.id, row.name);
  };

  const canOpen = (row: NeedsConfirmationRow) => {
    if (row.kind === "company") return Boolean(onOpenCompanyRecord);
    if (row.kind === "vc_firm") return Boolean(onOpenFirmRecord);
    return Boolean(onOpenPersonRecord);
  };

  return (
    <>
      <section className={ENGAGEMENT_CARD} aria-label="Activity">
        <div className="mb-1">
          <h2 className="text-sm font-semibold text-white/80">Activity</h2>
          <p className="mt-1 text-xs text-white/35">
            Latest changes across firms, investors, companies, and users
            {rows == null ? "" : ` · ${visible.length.toLocaleString()} in this range`}
          </p>
        </div>

        {rows == null ? (
          <div className="flex items-center justify-center py-10">
            <BouncingDots />
          </div>
        ) : activityError ? (
          <p className="mt-4 text-sm text-red-300">{activityError}</p>
        ) : visible.length === 0 ? (
          <p className="mt-4 text-xs text-white/35">No record updates in this range</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.45fr)_7.5rem_6.5rem] gap-3 border-b border-white/5 px-1 pb-2 font-mono text-[10px] uppercase tracking-widest text-white/30">
                <span>Entity</span>
                <span>What changed</span>
                <span>Source</span>
                <span className="text-right">When</span>
              </div>
              <div className="max-h-[28rem] divide-y divide-white/5 overflow-y-auto">
                {visible.map((row) => {
                  const extra = row.change === "linked" ? null : row.subtitle;
                  const detail = [changeTypeLabel(row), extra].filter(Boolean).join(" · ");
                  const origin = row.origin?.trim() || "—";
                  return (
                    <div key={`${row.kind}-${row.recordId}`} className="px-1 py-3">
                      <p className="font-mono text-[10px] uppercase tracking-wide text-success">
                        {KIND_LABEL[row.kind]}
                      </p>
                      <div className="mt-1.5 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.45fr)_7.5rem_6.5rem] items-start gap-3">
                        <p className="truncate text-[13px] font-medium text-white/80">{row.name}</p>
                        <p className="truncate font-mono text-[10px] uppercase tracking-wide text-white/55" title={detail}>
                          {detail || "—"}
                        </p>
                        <p className="truncate font-mono text-[10px] uppercase tracking-wide text-white/45" title={origin}>
                          {origin}
                        </p>
                        <span className="text-right text-[11px] text-white/35">{formatWhen(row.updatedAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className={ENGAGEMENT_CARD} aria-label="Needs confirmation">
        <div className="mb-1">
          <h2 className="text-sm font-semibold text-white/80">Needs confirmation</h2>
          <p className="mt-1 text-xs text-white/35">
            Confirm these before they go live
            {queue == null ? "" : ` · ${queue.length.toLocaleString()}`}
          </p>
        </div>

        {queue == null ? (
          <div className="flex items-center justify-center py-10">
            <BouncingDots />
          </div>
        ) : queueError ? (
          <p className="mt-4 text-sm text-red-300">{queueError}</p>
        ) : queue.length === 0 ? (
          <p className="mt-4 text-xs text-white/35">No records are waiting for confirmation</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_8rem] gap-3 border-b border-white/5 px-1 pb-2 font-mono text-[10px] uppercase tracking-widest text-white/30">
                <span>Record</span>
                <span>Status</span>
                <span className="text-right">Open</span>
              </div>
              <div className="max-h-[32rem] divide-y divide-white/5 overflow-y-auto">
                {queue.map((row) => {
                  const interactive = canOpen(row);
                  const body = (
                    <>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-success">
                        {KIND_LABEL[row.kind]}
                      </p>
                      <div className="mt-1.5 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_8rem] items-center gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-white/80">{row.name}</p>
                          {row.detail ? (
                            <p className="mt-0.5 truncate text-xs text-white/40">{row.detail}</p>
                          ) : null}
                        </div>
                        <div>
                          <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-primary">
                            Needs Review
                          </span>
                        </div>
                        <span className={`text-right text-[11px] ${interactive ? "text-primary" : "text-white/25"}`}>
                          {interactive ? "Open" : "—"}
                        </span>
                      </div>
                    </>
                  );
                  const className = "block w-full px-1 py-3 text-left";
                  if (!interactive) {
                    return (
                      <div key={`${row.kind}-${row.id}`} className={className}>
                        {body}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={`${row.kind}-${row.id}`}
                      type="button"
                      onClick={() => openQueueRow(row)}
                      className={`${className} transition-colors hover:bg-white/[0.03]`}
                    >
                      {body}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
