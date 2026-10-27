import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export type RecordUpdateKind =
  | "vc_firm"
  | "vc_investor"
  | "company"
  | "user_founder"
  | "user_operator"
  | "user_investor"
  | "user_other";

export type RecordChange = "created" | "updated" | "linked";

export interface RecordUpdateRow {
  kind: RecordUpdateKind;
  recordId: string;
  name: string;
  subtitle: string | null;
  updatedAt: string;
  firmId?: string | null;
  /** Present for catalog companies, which open in the startup editor. */
  source?: "startup";
  /** What happened on this record. */
  change?: RecordChange;
  /** The other record named by a link, such as the firm an investor joined. */
  linkedTo?: string | null;
  /** Where the record came from: User, Admin, Firecrawl, and so on. */
  origin?: string | null;
}

export const KIND_LABEL: Record<RecordUpdateKind, string> = {
  vc_firm: "VC firm",
  vc_investor: "VC investor",
  company: "Company",
  user_founder: "Founder",
  user_operator: "Operator",
  user_investor: "Investor (user)",
  user_other: "User (other)",
};

export function changeTypeLabel(row: RecordUpdateRow): string {
  if (row.change === "created") return "Record created";
  if (row.change === "linked") {
    const target = row.linkedTo?.trim();
    return target ? `Linked to ${target}` : "Linked to record";
  }
  if (row.change === "updated") return "Details updated";
  switch (row.kind) {
    case "vc_firm": return "Details updated";
    case "vc_investor": return row.firmId ? "Linked to record" : "Details updated";
    case "company": return "Details updated";
    case "user_founder": return "Details updated";
    case "user_operator": return "Details updated";
    case "user_investor": return "Details updated";
    case "user_other": return "Details updated";
  }
}

export type RecordUpdatesResult = {
  updates: RecordUpdateRow[];
  total: number;
  directory: boolean;
};

/** Latest record changes from the admin-record-updates edge function. */
export async function loadRecordUpdates(body: Record<string, unknown> = {}): Promise<RecordUpdatesResult> {
  const { data, error } = await invokeEdgeFunction("admin-record-updates", {
    preferClerkSessionToken: true,
    body,
  });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = (await ctx.json()) as { error?: string };
        if (typeof parsed?.error === "string") detail = parsed.error;
      } catch {
        /* ignore */
      }
    }
    throw new Error(detail);
  }
  const parsed = data as { updates?: RecordUpdateRow[]; total?: number; directory?: boolean; error?: string } | null;
  if (parsed?.error) throw new Error(parsed.error);
  const updates = parsed?.updates ?? [];
  return {
    updates,
    total: typeof parsed?.total === "number" ? parsed.total : updates.length,
    directory: parsed?.directory === true,
  };
}

/** Inclusive UTC day window. `null` keeps every row (all time). */
export function recordUpdatedInWindow(
  updatedAt: string,
  window: { from: string; to: string } | null,
): boolean {
  if (!window) return true;
  const at = new Date(updatedAt).getTime();
  if (Number.isNaN(at)) return false;
  const from = Date.parse(`${window.from}T00:00:00.000Z`);
  const to = Date.parse(`${window.to}T00:00:00.000Z`) + 86_400_000;
  if (Number.isNaN(from) || Number.isNaN(to)) return true;
  return at >= from && at < to;
}
