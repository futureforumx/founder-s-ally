import { useState } from "react";
import { motion } from "framer-motion";
import { SectorAlignment } from "./SectorAlignment";
import { StageTimeline } from "./StageTimeline";
import { InvestorThemes } from "./InvestorThemes";
import { DealDynamics } from "./DealDynamics";
import { AverageDealSizeCard } from "./AverageDealSizeCard";
import { GeographicFocus } from "./GeographicFocus";
import { FirmFundsSection } from "./FirmFundsSection";
import type { FirmDeal, InvestorPartner } from "@/hooks/useInvestorProfile";

type ExpandedPanel = "sector" | "stage" | "themes" | "geo" | null;

interface ThesisTabContentProps {
  vcFirm: any;
  effectiveInvestor: any;
  companyData: any;
  enrichedData: any;
  displayName: string;
  minCheckUsd?: number | null;
  maxCheckUsd?: number | null;
  firmDeals?: FirmDeal[] | null;
  dealSizePartners?: InvestorPartner[] | null;
  typicalCheckHint?: string | null;
  directorySweetSpot?: string | null;
  /** `firm_records.id` UUID — loads `fund_records` from the Supabase DB */
  firmRecordsId?: string | null;
  /** Firm display name — fallback resolver when firmRecordsId is unavailable */
  firmDisplayName?: string | null;
  /** Whether the firm is currently deploying (`firm_records.is_actively_deploying`) — used as fallback. */
  isActivelyDeploying?: boolean | null;
  /** AUM string from `firm_records` or static JSON — used as fallback fund display. */
  firmAum?: string | null;
}

export function ThesisTabContent({
  vcFirm,
  effectiveInvestor,
  companyData,
  enrichedData,
  displayName,
  minCheckUsd,
  maxCheckUsd,
  firmDeals,
  dealSizePartners,
  typicalCheckHint,
  directorySweetSpot,
  firmRecordsId,
  firmDisplayName,
  isActivelyDeploying,
  firmAum,
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
          <div className="lg:col-span-1 flex h-full flex-col gap-3">
            <AverageDealSizeCard
              minCheckUsd={minCheckUsd}
              maxCheckUsd={maxCheckUsd}
              deals={firmDeals}
              partners={dealSizePartners ?? null}
              typicalCheckHint={typicalCheckHint ?? null}
              directorySweetSpot={directorySweetSpot ?? null}
            />
            <DealDynamics />
          </div>
          <div className="lg:col-span-1 h-full">
            <GeographicFocus
              isExpanded={false}
              onToggleExpand={() => toggle("geo")}
            />
          </div>
        </div>

        <FirmFundsSection
          firmRecordsId={firmRecordsId?.trim() || null}
          firmName={firmDisplayName?.trim() || null}
          isActivelyDeploying={isActivelyDeploying ?? null}
          firmAum={firmAum ?? null}
        />
      </div>
    </motion.div>
  );
}
