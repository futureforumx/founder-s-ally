import { Fragment } from "react";
import { motion } from "framer-motion";
import type { IntroPath, PathHop } from "./types";
import { cn } from "@/lib/utils";
import { nwTransition } from "./networkMotion";

function HopAvatar({ hop, isYou, isTarget, isIntermediary }: { hop: PathHop; isYou: boolean; isTarget: boolean; isIntermediary: boolean }) {
  const initials = hop.displayName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold tabular-nums tracking-tight",
        isYou && "border-foreground/15 bg-muted/60 text-foreground",
        isTarget && "border-foreground/20 bg-foreground/[0.06] text-foreground",
        isIntermediary && !isYou && !isTarget && "border-border/80 bg-muted/40 text-foreground/90",
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function NetworkPathChain({
  path,
  className,
  bestLabel = "Best path",
}: {
  path: IntroPath;
  className?: string;
  bestLabel?: string;
}) {
  const hops = path.hops;
  const last = hops.length - 1;
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{bestLabel}</p>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          Score <span className="font-medium text-foreground">{Math.round(path.score)}</span>
        </span>
      </div>
      <div className="flex w-full min-w-0 items-start">
        {hops.map((hop, i) => {
          const isYou = i === 0;
          const isTarget = i === last;
          const isIntermediary = i > 0 && i < last;
          return (
            <Fragment key={hop.id}>
              {i > 0 ? (
                <div className="flex min-h-[52px] min-w-[10px] flex-1 flex-col justify-center px-0.5" aria-hidden>
                  <div className="h-px w-full bg-border/70" />
                </div>
              ) : null}
              <motion.div
                className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 text-center sm:w-[5.5rem]"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...nwTransition, delay: i * 0.04 }}
              >
                <HopAvatar hop={hop} isYou={isYou} isTarget={isTarget} isIntermediary={isIntermediary} />
                <div className="w-full">
                  <p className="line-clamp-2 text-[11px] font-medium leading-snug text-foreground">{hop.displayName}</p>
                  {(hop.role || hop.firmName) && (
                    <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-muted-foreground">
                      {[hop.role, hop.firmName].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                {isIntermediary ? (
                  <span className="max-w-full truncate rounded border border-border/60 bg-muted/30 px-1 py-0.5 text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
                    Bridge
                  </span>
                ) : null}
                {isTarget ? (
                  <span className="max-w-full truncate rounded border border-border/60 bg-muted/30 px-1 py-0.5 text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
                    Target
                  </span>
                ) : null}
              </motion.div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
