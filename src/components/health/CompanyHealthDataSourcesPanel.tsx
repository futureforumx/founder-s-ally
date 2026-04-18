import { useEffect, useMemo, useState } from "react";
import { Database, ExternalLink, FileText, Pencil } from "lucide-react";
import {
  collectCompanyLinkedDataSources,
  COMPANY_LINKED_DATA_SECTION_ORDER,
  normalizeHttpHref,
} from "@/lib/companyLinkedDataSources";
import { useActiveContext } from "@/context/ActiveContext";
import { usePitchDecks } from "@/hooks/usePitchDecks";
import type { CompanyData } from "@/components/company-profile/types";
import { NETWORK_SURFACE_DISPLAY_NAME } from "@/lib/networkNavVariant";
import { cn } from "@/lib/utils";

export function CompanyHealthDataSourcesPanel({
  className,
  onEditDocumentsInDataRoom,
}: {
  className?: string;
  /** Opens Raise → Data Room (e.g. to manage pitch deck and one-pager). */
  onEditDocumentsInDataRoom?: () => void;
}) {
  const { activeContextId } = useActiveContext();
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const bump = () => setRefresh((n) => n + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("storage", bump);
    window.addEventListener("company-profile-changed", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", bump);
      window.removeEventListener("company-profile-changed", bump);
    };
  }, []);

  const rows = useMemo(() => collectCompanyLinkedDataSources(activeContextId), [refresh, activeContextId]);

  const bySection = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = m.get(r.section) ?? [];
      list.push(r);
      m.set(r.section, list);
    }
    return m;
  }, [rows]);

  const orderedSections = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of COMPANY_LINKED_DATA_SECTION_ORDER) {
      if (bySection.has(s)) {
        out.push(s);
        seen.add(s);
      }
    }
    for (const s of bySection.keys()) {
      if (!seen.has(s)) out.push(s);
    }
    return out;
  }, [bySection]);

  return (
    <div className={cn("space-y-8", className)}>
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80">
          <Database className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Linked data sources</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Everything below is read from your company profile, brand assets, last analysis run, and workspace
            connections in Settings. Update sources there to change what feeds Company Health.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No linked sources yet. Add a website or socials under{" "}
            <span className="font-medium text-foreground">Settings → Company</span>, or connect tools under{" "}
            <span className="font-medium text-foreground">Settings → {NETWORK_SURFACE_DISPLAY_NAME}</span>.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {orderedSections.map((section) => {
            const list = bySection.get(section);
            if (!list?.length) return null;
            return (
              <section key={section} className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {section}
                </h4>
                <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/40">
                  {list.map((row) => (
                    <li key={row.id}>
                      {row.href ? (
                        <a
                          href={row.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30"
                        >
                          <SourceGlyph iconUrl={row.iconUrl} label={row.label} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground">{row.label}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{row.detail}</p>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
                        </a>
                      ) : (
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <SourceGlyph iconUrl={row.iconUrl} label={row.label} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground">{row.label}</p>
                            <p className="text-[11px] leading-snug text-muted-foreground">{row.detail}</p>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <DocumentsBlock refreshKey={refresh} onEditDocumentsInDataRoom={onEditDocumentsInDataRoom} />
    </div>
  );
}

function DocumentsBlock({
  refreshKey,
  onEditDocumentsInDataRoom,
}: {
  refreshKey: number;
  onEditDocumentsInDataRoom?: () => void;
}) {
  const { activeDeck, loading: deckLoading, getDownloadUrl, refetch } = usePitchDecks();
  const [deckHref, setDeckHref] = useState<string | null>(null);

  useEffect(() => {
    if (refreshKey === 0) return;
    void refetch();
  }, [refreshKey, refetch]);

  useEffect(() => {
    let cancelled = false;
    if (!activeDeck?.file_url) {
      setDeckHref(null);
      return;
    }
    getDownloadUrl(activeDeck.file_url).then((url) => {
      if (!cancelled) setDeckHref(url);
    });
    return () => {
      cancelled = true;
    };
  }, [activeDeck?.file_url, activeDeck?.id, getDownloadUrl]);

  const onePager = useMemo(() => {
    try {
      const raw = localStorage.getItem("company-profile");
      if (!raw) return { href: null as string | null, detail: "" };
      const profile = JSON.parse(raw) as Partial<CompanyData>;
      const t = profile.onePagerUrl?.trim();
      if (!t) return { href: null as string | null, detail: "" };
      const href = normalizeHttpHref(t);
      return { href, detail: t };
    } catch {
      return { href: null as string | null, detail: "" };
    }
  }, [refreshKey]);

  return (
    <section className="space-y-3">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Documents</h4>
      <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <li className="flex min-h-[52px] items-stretch">
          {deckLoading ? (
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
              <SourceGlyph iconUrl={null} label="Latest pitch deck" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Latest pitch deck</p>
                <p className="text-[11px] text-muted-foreground">Loading…</p>
              </div>
            </div>
          ) : deckHref && activeDeck ? (
            <a
              href={deckHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/40">
                <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Latest pitch deck</p>
                <p className="truncate text-[11px] text-muted-foreground">{activeDeck.file_name}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
            </a>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/40">
                <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Latest pitch deck</p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Upload a PDF under <span className="font-medium text-foreground">Settings → Company</span> to set your
                  active deck.
                </p>
              </div>
            </div>
          )}
          {onEditDocumentsInDataRoom ? (
            <DocumentEditControl
              label="Edit pitch deck in Raise Data Room"
              onClick={onEditDocumentsInDataRoom}
            />
          ) : null}
        </li>
        <li className="flex min-h-[52px] items-stretch">
          {onePager.href && onePager.detail ? (
            <a
              href={onePager.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30"
            >
              <SourceGlyph iconUrl={null} label="One-pager" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">One-pager</p>
                <p className="truncate text-[11px] text-muted-foreground">{onePager.detail}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
            </a>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
              <SourceGlyph iconUrl={null} label="One-pager" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">One-pager</p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Add a link under <span className="font-medium text-foreground">Settings → Company</span> (One-pager).
                </p>
              </div>
            </div>
          )}
          {onEditDocumentsInDataRoom ? (
            <DocumentEditControl
              label="Edit one-pager in Raise Data Room"
              onClick={onEditDocumentsInDataRoom}
            />
          ) : null}
        </li>
      </ul>
    </section>
  );
}

function DocumentEditControl({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="flex shrink-0 items-stretch border-l border-border/50">
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        className="flex items-center justify-center px-3 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

function SourceGlyph({ iconUrl, label }: { iconUrl: string | null; label: string }) {
  if (iconUrl) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-background">
        <img src={iconUrl} alt="" className="h-5 w-5 object-contain" />
      </div>
    );
  }
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/40 text-[10px] font-bold text-muted-foreground"
      aria-hidden
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}
