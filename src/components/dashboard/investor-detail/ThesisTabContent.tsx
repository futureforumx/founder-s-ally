import { useState } from "react";
import { motion } from "framer-motion";
import { SectorAlignment } from "./SectorAlignment";
import { StageTimeline } from "./StageTimeline";
import { InvestorThemes } from "./InvestorThemes";
import { DealDynamics } from "./DealDynamics";
import { GeographicFocus } from "./GeographicFocus";

type ExpandedPanel = "sector" | "stage" | "themes" | "geo" | null;

interface ThesisTabContentProps {
  vcFirm: any;
  effectiveInvestor: any;
  companyData: any;
  enrichedData: any;
  displayName: string;
}

export function ThesisTabContent({
  vcFirm,
  effectiveInvestor,
  companyData,
  enrichedData,
  displayName,
}: ThesisTabContentProps) {
  const [expanded, setExpanded] = useState<ExpandedPanel>(null);

  const toggle = (panel: NonNullable<ExpandedPanel>) =>
    setExpanded((prev) => (prev === panel ? null : panel));

  // If any panel is expanded, only render that panel
  if (expanded) {
    return (
      <motion.div
        key={`expanded-${expanded}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
      >
        {expanded === "sector" && (
          <SectorAlignment
            vcSectors={vcFirm?.sectors || effectiveInvestor.sector.split(", ").map((s: string) => s.trim())}
            primarySector={companyData?.sector}
            secondarySectors={(companyData as any)?.subsectors || []}
            isExpanded
            onToggleExpand={() => toggle("sector")}
          />
        )}
        {expanded === "stage" && (
          <StageTimeline isExpanded onToggleExpand={() => toggle("stage")} />
        )}
        {expanded === "themes" && (
          <InvestorThemes
            currentThesis={enrichedData?.profile?.currentThesis}
            recentDeals={enrichedData?.profile?.recentDeals}
            firmName={displayName}
            isExpanded
            onToggleExpand={() => toggle("themes")}
          />
        )}
        {expanded === "geo" && (
          <GeographicFocus isExpanded onToggleExpand={() => toggle("geo")} />
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      key="thesis"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
    >
      <div className="space-y-3">
        {/* Row 1: Sector Alignment (1col) + Stage Timeline (2col) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1 h-full">
            <SectorAlignment
              vcSectors={vcFirm?.sectors || effectiveInvestor.sector.split(", ").map((s: string) => s.trim())}
              primarySector={companyData?.sector}
              secondarySectors={(companyData as any)?.subsectors || []}
              onToggleExpand={() => toggle("sector")}
            />
          </div>
          <div className="lg:col-span-2 h-full">
            <StageTimeline onToggleExpand={() => toggle("stage")} />
          </div>
        </div>

        {/* Row 2: Themes + Deal Dynamics + Geographic Focus */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1 h-full">
            <InvestorThemes
              currentThesis={enrichedData?.profile?.currentThesis}
              recentDeals={enrichedData?.profile?.recentDeals}
              firmName={displayName}
              onToggleExpand={() => toggle("themes")}
            />
          </div>
          <div className="lg:col-span-1 h-full">
            <DealDynamics />
          </div>
          <div className="lg:col-span-1 h-full">
            <GeographicFocus
              isExpanded={false}
              onToggleExpand={() => toggle("geo")}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
