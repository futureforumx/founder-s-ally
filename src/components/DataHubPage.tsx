import { useState } from "react";
import { Share2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeckAuditView } from "./DeckAuditView";
import { MetricsPanel } from "./data-room/MetricsPanel";
import { AssessmentBenchmarkBar } from "./data-room/AssessmentBenchmarkBar";
import { MarketPanel } from "./data-room/MarketPanel";
import { useStoredCompanyProfile } from "@/hooks/useStoredCompanyProfile";
import type { AuditResult } from "./deck-audit/types";

const DATA_ROOM_TABS = [
  { id: "files" as const, label: "Files" },
  { id: "metrics" as const, label: "Metrics" },
  { id: "assessment" as const, label: "Assessment" },
  { id: "market" as const, label: "Market" },
  { id: "share" as const, label: "Share" },
  { id: "analytics" as const, label: "Analytics" },
];

type DataRoomTabId = (typeof DATA_ROOM_TABS)[number]["id"];

function readDeckAuditResult(): AuditResult | null {
  try {
    const cached = sessionStorage.getItem("deck-audit-result");
    return cached ? (JSON.parse(cached) as AuditResult) : null;
  } catch {
    return null;
  }
}

function ComingSoonPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Share2;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 min-h-[40vh] text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-card/70">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function DataHubPage() {
  const [activeTab, setActiveTab] = useState<DataRoomTabId>("files");
  const companyProfile = useStoredCompanyProfile();
  const auditResult = activeTab === "assessment" ? readDeckAuditResult() : null;

  return (
    <div className={cn("mx-auto w-full px-4 py-8 sm:px-6 lg:px-8", activeTab === "market" ? "max-w-6xl" : "max-w-5xl")}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
        {DATA_ROOM_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest rounded-md transition-all",
                isActive
                  ? "bg-accent/10 text-accent font-bold"
                  : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "assessment" && (
        <AssessmentBenchmarkBar
          className="mt-5"
          profile={companyProfile}
          auditResult={auditResult}
        />
      )}

      <div className={cn(activeTab === "assessment" || activeTab === "market" ? "mt-5" : "mt-8")}>
        {activeTab === "metrics" ? (
          <MetricsPanel />
        ) : activeTab === "market" ? (
          <MarketPanel profile={companyProfile} />
        ) : activeTab === "share" ? (
          <ComingSoonPanel
            icon={Share2}
            title="Sharing is coming soon"
            description="You'll be able to share your pitch deck and assessment with investors directly from here."
          />
        ) : activeTab === "analytics" ? (
          <ComingSoonPanel
            icon={BarChart3}
            title="Analytics is coming soon"
            description="You'll be able to track views, engagement, and investor activity on your shared materials here."
          />
        ) : (
          <DeckAuditView activeSection={activeTab} />
        )}
      </div>
    </div>
  );
}

export default DataHubPage;
