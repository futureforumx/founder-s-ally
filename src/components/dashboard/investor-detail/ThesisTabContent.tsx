import { useState } from "react";
import { motion } from "framer-motion";
import { SectorAlignment } from "./SectorAlignment";
import { StageTimeline } from "./StageTimeline";
import { InvestorThemes } from "./InvestorThemes";
import { DealDynamics } from "./DealDynamics";
import { GeographicFocus } from "./GeographicFocus";

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
  const [geoExpanded, setGeoExpanded] = useState(false);

  return (
    <motion.div
      key="thesis"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
    >
      <div className="space-y-4">
        {/* Row 1: Sector Alignment (1col) + Stage Timeline (2col) — hidden when geo expanded */}
        {!geoExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-4"
          >
            <div className="lg:col-span-1 h-full">
              <SectorAlignment
                vcSectors={vcFirm?.sectors || effectiveInvestor.sector.split(", ").map((s: string) => s.trim())}
                primarySector={companyData?.sector}
                secondarySectors={(companyData as any)?.subsectors || []}
              />
            </div>
            <div className="lg:col-span-2 h-full">
              <StageTimeline />
            </div>
          </motion.div>
        )}

        {/* Row 2: Themes + Deal Dynamics + Geographic Focus — or just expanded globe */}
        {geoExpanded ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            <GeographicFocus
              isExpanded={true}
              onToggleExpand={() => setGeoExpanded(false)}
            />
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 h-full">
              <InvestorThemes
                currentThesis={enrichedData?.profile?.currentThesis}
                recentDeals={enrichedData?.profile?.recentDeals}
                firmName={displayName}
              />
            </div>
            <div className="lg:col-span-1 h-full">
              <DealDynamics />
            </div>
            <div className="lg:col-span-1 h-full">
              <GeographicFocus
                isExpanded={false}
                onToggleExpand={() => setGeoExpanded(true)}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
