import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { extractXHandle } from "@/lib/extractXHandle";
import { hydrateTwitterWidgets } from "@/lib/twitterWidgets";

export type FirmXPostsCardProps = {
  xUrl?: string | null;
  firmName?: string;
  theme?: "light" | "dark";
  height?: number;
  className?: string;
};

const WIDGET_TIMEOUT_MS = 18_000;

type EmbedState = "idle" | "loading" | "ready" | "error";

export function FirmXPostsCard({
  xUrl,
  firmName,
  theme = "light",
  height = 420,
  className,
}: FirmXPostsCardProps) {
  const handle = extractXHandle(xUrl);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [embedState, setEmbedState] = useState<EmbedState>("idle");
  const timelineKey = handle ? `${handle}-${theme}-${height}` : "none";

  useEffect(() => {
    if (!handle) {
      setEmbedState("idle");
      return;
    }

    setEmbedState("loading");
    let cancelled = false;
    let rafAttempts = 0;
    const maxRafAttempts = 40;

    const run = () => {
      if (cancelled) return;
      const host = hostRef.current;
      if (!host) {
        rafAttempts += 1;
        if (rafAttempts > maxRafAttempts) {
          setEmbedState("error");
          return;
        }
        requestAnimationFrame(run);
        return;
      }

      void (async () => {
        try {
          await hydrateTwitterWidgets(host);
          if (cancelled) return;

          const deadline = Date.now() + WIDGET_TIMEOUT_MS;
          const check = () => {
            if (cancelled) return;
            const iframe = host.querySelector("iframe");
            if (iframe) {
              setEmbedState("ready");
              return;
            }
            if (Date.now() > deadline) {
              setEmbedState("error");
              return;
            }
            window.setTimeout(check, 220);
          };
          check();
        } catch {
          if (!cancelled) setEmbedState("error");
        }
      })();
    };

    requestAnimationFrame(run);

    return () => {
      cancelled = true;
    };
  }, [handle, theme, height]);

  const profileUrl = handle ? `https://x.com/${handle}` : null;
  const showBlockingOverlay = Boolean(handle) && embedState !== "ready" && embedState !== "error";

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/80 border-l-[3px] border-l-muted-foreground/25 shadow-sm bg-card/95",
        className,
      )}
      aria-label={firmName ? `X posts — ${firmName}` : "X posts"}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-semibold bg-muted/50 text-foreground border-border">
            X Posts
          </Badge>
          {handle ? (
            <>
              <span className="text-[10px] font-medium text-foreground/80">@{handle}</span>
              <span className="text-border">·</span>
              <span className="text-[10px] text-muted-foreground">Live feed</span>
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground">Not connected</span>
          )}
        </div>

        {!handle ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-secondary/15 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-foreground">No X profile connected</p>
            <p className="mt-1.5 text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Add an X profile to show live firm posts here.
            </p>
          </div>
        ) : embedState === "error" ? (
          <div className="rounded-lg border border-border/60 bg-secondary/20 px-4 py-8 text-center space-y-3">
            <p className="text-sm font-semibold text-foreground">Unable to load X posts</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              The timeline could not be embedded. The profile may be private or temporarily unavailable.
            </p>
            {profileUrl ? (
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                  View on X
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="relative min-h-[420px]">
            {showBlockingOverlay ? (
              <div className="absolute inset-0 z-10 rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-2 animate-pulse pointer-events-none">
                <div className="h-3 w-28 rounded bg-border/60" />
                <div className="h-[280px] w-full rounded-lg bg-border/40" />
                <div className="h-3 w-full rounded bg-border/30" />
                <div className="h-3 w-4/5 rounded bg-border/30" />
              </div>
            ) : null}
            <div
              key={timelineKey}
              ref={hostRef}
              className={cn(
                "rounded-lg border border-border/50 bg-background/50 overflow-auto relative z-0 min-h-[420px]",
              )}
            >
              <a
                className="twitter-timeline"
                href={profileUrl!}
                data-theme={theme}
                data-height={height}
                data-chrome="noheader nofooter"
                data-dnt="true"
              >
                {`Posts by @${handle}`}
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
