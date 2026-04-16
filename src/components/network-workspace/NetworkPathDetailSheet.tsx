import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import type { IntroPath, PathHop, ReachablePerson } from "./types";
import { PathPreview } from "./PathPreview";
import { ReasonTags } from "./ReasonTags";
import { cn } from "@/lib/utils";

function introducerHopFromPath(path: IntroPath): PathHop | null {
  const { hops } = path;
  if (hops.length < 2) return null;
  return hops[hops.length - 2] ?? null;
}

function PathBlock({ title, path, muted }: { title: string; path: IntroPath; muted?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5", muted && "opacity-90")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {Math.round(path.score)}
          {path.confidence != null ? ` · ${Math.round(path.confidence * 100)}% conf.` : ""}
        </span>
      </div>
      <PathPreview path={path} className="mt-2 text-[12px]" />
      <ReasonTags tags={path.reasonTags} className="mt-2" />
      {path.summary ? <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{path.summary}</p> : null}
    </div>
  );
}

export function NetworkPathDetailSheet({
  person,
  open,
  onOpenChange,
}: {
  person: ReachablePerson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const best = person?.bestPath;
  const ask = best ? introducerHopFromPath(best) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        {person && best ? (
          <>
            <SheetHeader className="space-y-1 pr-8 text-left">
              <SheetTitle className="text-xl font-semibold tracking-tight">{person.fullName}</SheetTitle>
              <SheetDescription className="text-[13px] leading-snug">
                {person.role}
                {person.firmName ? ` · ${person.firmName}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6 pb-8">
              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Best intro path</h3>
                <div className="mt-2">
                  <PathBlock title="Primary" path={best} />
                </div>
              </section>

              {person.alternatePaths?.length ? (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Alternate paths</h3>
                  <div className="mt-2 space-y-2">
                    {person.alternatePaths.map((p) => (
                      <PathBlock key={p.id} title="Alternate" path={p} muted />
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Who to ask</h3>
                <div className="mt-2 rounded-xl border border-border/50 bg-card/60 px-3 py-3">
                  {ask ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">{ask.displayName}</p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {[ask.role, ask.firmName].filter(Boolean).join(" · ") || "Warm intermediary on this path"}
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">You already have a direct line — no intermediary required.</p>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Why this path is strong</h3>
                <ReasonTags tags={best.reasonTags} className="mt-2" />
              </section>

              {person.evidenceLines?.length ? (
                <section>
                  <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Relationship evidence</h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted-foreground">
                    {person.evidenceLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recent interactions / signals</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {person.recentSignalSummary ?? "No recent timing signals — path rank is from structural trust and overlap."}
                </p>
              </section>

              <Separator />

              <div className="space-y-3">
                <Button className="w-full rounded-xl font-semibold" type="button">
                  Draft intro request
                </Button>
                <Button variant="outline" className="w-full rounded-xl font-semibold" type="button">
                  Copy suggested opener (soon)
                </Button>
                <p className="text-center text-[10px] text-muted-foreground/80">
                  Generated message copy will appear here when the intro assistant is connected.
                </p>
              </div>
            </div>
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>Path</SheetTitle>
            <SheetDescription>Select someone reachable to see paths and next actions.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}
