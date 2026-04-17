import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { ReachablePerson } from "./types";
import { NetworkPathChain } from "./NetworkPathChain";
import { PathPreview } from "./PathPreview";
import { cn } from "@/lib/utils";
import { nwTransition } from "./networkMotion";
import { deriveReadiness, readinessCtaLabel } from "./networkReadiness";

const catShort: Record<ReachablePerson["category"], string> = {
  investor: "Investor",
  founder: "Founder",
  operator: "Operator",
  customer: "Customer",
  advisor: "Advisor",
  other: "Other",
};

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">Confidence</span>
        <motion.span
          key={pct}
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 1 }}
          transition={nwTransition}
          className="tabular-nums text-foreground/90"
        >
          {pct}%
        </motion.span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted/80" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <motion.div
          className="h-full rounded-full bg-foreground/25"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={nwTransition}
        />
      </div>
    </div>
  );
}

export function NetworkRelationshipDetailPanel({
  person,
  className,
  showClose,
  onClose,
}: {
  person: ReachablePerson;
  className?: string;
  showClose?: boolean;
  onClose?: () => void;
}) {
  const { action, rationale } = deriveReadiness(person);
  const conf = person.bestPath.confidence ?? 0;
  const warmth = person.warmth ?? Math.round(person.bestPath.score * 0.85);
  const fit = person.fitRelevance ?? null;

  const bridge =
    person.bestPath.hops.length >= 2 ? person.bestPath.hops[person.bestPath.hops.length - 2]?.displayName?.split(/\s+/)[0] : null;
  const introDraft = `Hi ${bridge ?? "there"},\n\nI'm reaching out for a warm intro to ${person.fullName} (${person.role}, ${person.firmName}). We're aligned on ${person.bestPath.reasonTags[0] ?? "stage and thesis"}.\n\nHappy to send a forwardable blurb — 15m works anytime this week.\n\nThanks,`;

  return (
    <div className={cn("flex flex-col bg-background", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={person.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={nwTransition}
            >
              <p className="truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground">{person.fullName}</p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {person.role} · {person.firmName}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="rounded border border-border/60 bg-muted/35 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground/85">
                  {catShort[person.category]}
                </span>
                <span className="rounded border border-border/50 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-muted-foreground">
                  {person.hop === "direct" ? "1-hop" : person.hop}
                </span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        {showClose && onClose ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-[11px] font-medium text-muted-foreground" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        <motion.div
          key={`scores-${person.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={nwTransition}
          className="grid grid-cols-3 gap-2"
        >
          <div className="rounded-md border border-border/50 bg-muted/20 px-2 py-2">
            <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Path</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-foreground">{Math.round(person.bestPath.score)}</p>
          </div>
          <div className="rounded-md border border-border/50 bg-muted/20 px-2 py-2">
            <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Warmth</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-foreground">{warmth}</p>
          </div>
          <div className="rounded-md border border-border/50 bg-muted/20 px-2 py-2">
            <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Stage fit</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-foreground">{fit != null ? fit : "—"}</p>
          </div>
        </motion.div>

        <ConfidenceMeter value={conf} />

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Compact path</p>
          <div className="mt-1.5 text-[11px] font-medium text-foreground/90">
            <PathPreview path={person.bestPath} />
          </div>
        </div>

        <NetworkPathChain path={person.bestPath} />

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Why this path is credible</p>
          <ul className="mt-2 space-y-2">
            {person.bestPath.reasonTags.slice(0, 5).map((tag) => (
              <li key={tag} className="flex gap-2 text-[12px] leading-snug text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/35" aria-hidden />
                <span className="text-foreground/90">{tag}</span>
              </li>
            ))}
            {(person.evidenceLines ?? []).map((line) => (
              <li key={line} className="flex gap-2 text-[12px] leading-snug text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/35" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {person.recentSignalSummary ? (
          <div className="rounded-lg border border-border/40 bg-background px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recent signal</p>
            <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">{person.recentSignalSummary}</p>
          </div>
        ) : null}

        {person.alternatePaths?.length ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Alternate paths</p>
            <div className="mt-2 space-y-2">
              {person.alternatePaths.map((p) => (
                <div key={p.id} className="rounded-md border border-border/40 bg-muted/10 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">Score {Math.round(p.score)}</span>
                  </div>
                  <PathPreview path={p} className="mt-1 text-[11px]" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <Separator className="bg-border/50" />

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Suggested intro</p>
          <Textarea
            readOnly
            value={introDraft}
            className="mt-2 min-h-[140px] resize-none rounded-md border-border/50 bg-muted/15 text-[12px] leading-relaxed text-foreground/90"
            aria-label="Suggested intro copy"
          />
          <p className="mt-1.5 text-[10px] text-muted-foreground">Editable drafts will sync when the intro assistant is connected.</p>
        </div>

        <div className="rounded-lg border border-border/45 bg-muted/10 px-3 py-2.5">
          <p className="text-[11px] font-medium text-foreground">{rationale}</p>
        </div>

        <Button type="button" className="h-9 w-full rounded-md text-[12px] font-semibold shadow-sm" size="sm">
          {readinessCtaLabel(action)}
        </Button>
      </div>
    </div>
  );
}
