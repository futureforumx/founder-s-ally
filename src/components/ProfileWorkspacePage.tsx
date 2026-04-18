import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useActiveContext } from "@/context/ActiveContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { useConnectedAccounts } from "@/hooks/useConnectedAccounts";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";

function formatAccountSummary(rows: { provider: string; account_email: string | null; status: string }[]): string {
  if (!rows.length) return "No linked accounts in Supabase for this context.";
  return rows
    .map((r) => {
      const email = r.account_email?.trim();
      return email ? `${r.provider}: ${email} (${r.status})` : `${r.provider} (${r.status})`;
    })
    .join(" · ");
}

function collectEmails(rows: { account_email: string | null }[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const e = r.account_email?.trim();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

export function ProfileWorkspacePage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { activeContextLabel, availableContexts, activeContextId } = useActiveContext();

  const workspaceMeta = useMemo(
    () => availableContexts.find((c) => c.kind === "workspace" && c.ownerContextId === activeContextId),
    [availableContexts, activeContextId],
  );

  const activeScopeId = isOwnerContextUuid(activeContextId) ? activeContextId : null;
  const activeAccounts = useConnectedAccounts(activeScopeId);

  const personalName =
    profile?.full_name?.trim() ||
    (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() ||
    "—";
  const personalEmail = user?.email?.trim() || "—";

  const linkedEmails = useMemo(() => collectEmails(activeAccounts.data ?? []), [activeAccounts.data]);

  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const companyId = profile?.company_id;
    if (!companyId) {
      setOrgName(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("company_analyses")
        .select("company_name")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setOrgName(null);
        return;
      }
      const row = data as Database["public"]["Tables"]["company_analyses"]["Row"];
      setOrgName(row.company_name?.trim() || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.company_id]);

  const connectorSummaryLine = formatAccountSummary(activeAccounts.data ?? []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Profile &amp; Workspace</h1>
        <Badge variant="secondary" className="text-[10px] font-normal uppercase tracking-wide">
          {activeContextLabel}
        </Badge>
        {isOwnerContextUuid(activeContextId) ? (
          <span className="font-mono text-[10px] text-muted-foreground">{activeContextId}</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Your profile, the active owner context, and linked integrations (same data model for every context).
      </p>

      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Personal profile</h2>
          <Badge variant="outline" className="text-[10px]">
            User
          </Badge>
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Full name</dt>
            <dd className="text-right font-medium text-foreground">{personalName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Primary email</dt>
            <dd className="text-right font-medium text-foreground break-all">{personalEmail}</dd>
          </div>
        </dl>
      </div>

      {workspaceMeta ? (
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Active workspace</h2>
            <Badge variant="outline" className="text-[10px]">
              {workspaceMeta.role}
            </Badge>
          </div>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="text-right font-medium text-foreground">{workspaceMeta.label}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Your role in workspace</dt>
              <dd className="text-right font-medium text-foreground capitalize">{workspaceMeta.role}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Linked organization</dt>
              <dd className="text-right font-medium text-foreground break-all">
                {orgName ? (
                  <>
                    {orgName}
                    {profile?.company_id ? (
                      <span className="mt-0.5 block font-mono text-[10px] font-normal text-muted-foreground">
                        {profile.company_id}
                      </span>
                    ) : null}
                  </>
                ) : profile?.company_id ? (
                  <span className="font-mono text-[10px]">{profile.company_id}</span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-xs text-muted-foreground">
          Select a workspace from the context switcher to see workspace name, your role, and linked company metadata.
        </div>
      )}

      {activeScopeId ? (
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Connectors</h2>
            <Badge variant="outline" className="text-[10px]">
              owner_context_id
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {activeAccounts.isLoading ? "Loading…" : connectorSummaryLine}
          </p>
          {!activeAccounts.isLoading && activeAccounts.isFetched && (activeAccounts.data?.length ?? 0) === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground/90">No connectors linked for this context yet.</p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-xs text-muted-foreground">
          Switch to a provisioned context to load <span className="font-mono">connected_accounts</span> from Supabase.
        </div>
      )}

      {linkedEmails.length > 0 ? (
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Linked account emails</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">From connected_accounts for the active owner context.</p>
          <ul className="mt-2 list-inside list-disc text-xs text-foreground">
            {linkedEmails.map((e) => (
              <li key={e} className="break-all">
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
