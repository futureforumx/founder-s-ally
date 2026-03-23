import { Building2 } from "lucide-react";

interface GlobalTopNavProps {
  companyName?: string | null;
  logoUrl?: string | null;
  hasProfile: boolean;
  lastSyncedAt: Date | null;
  syncFlash: boolean;
  relativeTime: string;
  onNavigateProfile: () => void;
}

export function GlobalTopNav({
  companyName,
  logoUrl,
  hasProfile,
  lastSyncedAt,
  syncFlash,
  relativeTime,
  onNavigateProfile,
}: GlobalTopNavProps) {
  return (
    <div
      className="fixed top-0 right-0 z-50 border-b border-border bg-card/80 backdrop-blur-md px-8 py-3 flex items-center justify-between"
      style={{ left: "11rem" }}
    >
      {/* Left: Company identity */}
      <button
        onClick={onNavigateProfile}
        className="flex items-center gap-3 group cursor-pointer"
      >
        <div className="relative w-9 h-9 rounded-lg border border-emerald-400/40 bg-muted/30 animate-[glow-pulse_2.5s_ease-in-out_infinite] group-hover:shadow-[0_0_14px_3px_rgba(52,211,153,0.3)] transition-all flex items-center justify-center overflow-hidden shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-full h-full object-contain rounded-lg" />
          ) : hasProfile ? (
            <span className="text-sm font-bold text-muted-foreground">
              {companyName?.charAt(0).toUpperCase() || "?"}
            </span>
          ) : (
            <Building2 className="h-4 w-4 text-muted-foreground/40" />
          )}
        </div>
        <span className="text-sm font-semibold tracking-tight text-foreground group-hover:text-accent transition-colors">
          {hasProfile ? companyName : "My Company"}
        </span>
      </button>

      {/* Right: Live status indicator */}
      <div className="flex items-center gap-3">
        {hasProfile && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Live
          </span>
        )}
        {lastSyncedAt ? (
          <span
            className={`text-xs font-medium transition-colors duration-500 ${syncFlash ? "text-success" : "text-muted-foreground"}`}
            title={lastSyncedAt.toLocaleString()}
          >
            {syncFlash ? "Analyzed just now" : `Last analyzed ${relativeTime || ""}`}
          </span>
        ) : null}
        <button
          onClick={() => {
            try {
              throw new Error("Sentry Test Error — safe to ignore");
            } catch (e) {
              Sentry.captureException(e);
              alert("Test error sent to Sentry! Check your Sentry dashboard.");
            }
          }}
          className="ml-4 flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
          title="Send a test error to Sentry"
        >
          <Bug className="h-3 w-3" />
          Test Sentry
        </button>
      </div>
    </div>
  );
}
