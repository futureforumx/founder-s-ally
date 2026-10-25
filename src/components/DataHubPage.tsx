import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeckAuditView } from "./DeckAuditView";
import { CompanyPanel } from "./data-room/CompanyPanel";
import { MetricsPanel } from "./data-room/MetricsPanel";
import { AssessmentBenchmarkBar } from "./data-room/AssessmentBenchmarkBar";
import { MarketPanel } from "./data-room/MarketPanel";
import { SharePanel } from "./data-room/SharePanel";
import { BestMatchesPanel } from "./data-room/BestMatchesPanel";
import { RecentActivityPanel } from "./data-room/RecentActivityPanel";
import { useStoredCompanyProfile } from "@/hooks/useStoredCompanyProfile";
import { useCompanyProfileFields } from "@/hooks/useCompanyProfileFields";
import { companyGeoFromProfile } from "@/lib/resolveCompanyGeo";
import type { AuditResult } from "./deck-audit/types";

const DATA_ROOM_TABS = [
  { id: "overview" as const, label: "Overview" },
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
  icon: typeof BarChart3;
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

interface DataHubPageProps {
  /** Tab to open on. Entry points that used to lead to the standalone deck audit pass "assessment". */
  initialTab?: DataRoomTabId;
}

export function DataHubPage({ initialTab = "overview" }: DataHubPageProps) {
  const [activeTab, setActiveTab] = useState<DataRoomTabId>(initialTab);
  const companyProfile = useStoredCompanyProfile();
  const auditResult = activeTab === "assessment" ? readDeckAuditResult() : null;
  // The raw stored fields, so Best Matches tracks the Company Details card even
  // before a company name has been saved.
  const { profile } = useCompanyProfileFields();

  return (
    <div className={cn(
      "mx-auto w-full px-4 py-8 sm:px-6 lg:px-8",
      activeTab === "overview" || activeTab === "files"
        ? "max-w-[1312px]"
        : activeTab === "market" || activeTab === "metrics"
          ? "max-w-6xl"
          : "max-w-5xl",
    )}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-4">
        {DATA_ROOM_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-md px-3 py-1.5 font-spaceGrotesk text-[11px] uppercase tracking-[0.14em] transition-colors",
                isActive
                  ? "bg-primary/10 font-bold text-primary"
                  : "font-medium text-muted-foreground hover:text-foreground",
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

      <div className={cn(
        activeTab === "assessment" || activeTab === "market"
          ? "mt-5"
          : activeTab === "overview" || activeTab === "files"
            ? "mt-9"
            : "mt-8",
      )}>
        {activeTab === "overview" ? (
          <div className="space-y-9">
            <CompanyPanel />
            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
              <BestMatchesPanel
                company={{
                  stage: profile.stage,
                  sector: profile.sector,
                  industry: profile.industry,
                  businessModel: profile.businessModel,
                  targetCustomer: profile.targetCustomer,
                  geo: companyGeoFromProfile(profile),
                }}
              />
              <RecentActivityPanel />
            </div>
          </div>
        ) : activeTab === "metrics" ? (
          <MetricsPanel
            onReupload={() => setActiveTab("files")}
            onSkip={() => setActiveTab("overview")}
            onConfirm={() => setActiveTab("overview")}
          />
        ) : activeTab === "market" ? (
          <MarketPanel profile={companyProfile} />
        ) : activeTab === "share" ? (
          <SharePanel />
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
