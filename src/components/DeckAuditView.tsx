import { useState, useCallback } from "react";
import { DeckUploader } from "./DeckUploader";
import { ProcessingStatus } from "./ProcessingStatus";
import { DiligenceScore } from "./DiligenceScore";
import { RedFlagCard } from "./RedFlagCard";

type AuditState = "upload" | "processing" | "report";

const mockFlags = [
  {
    severity: "high" as const,
    title: "Unrealistic CAC/LTV Ratio",
    body: "Associate Note: Your projected CAC ($4.20) is 60% below the industry average for Enterprise SaaS in Q3. This discrepancy will be flagged as 'Founder Optimism Bias' during diligence. The bottom-up model assumes viral adoption that contradicts the stated outbound GTM strategy.",
    requiredFix: "Reconcile unit economics with actual channel mix. Present CAC by channel with cohort data from the last 6 months.",
    slideRef: "Slide 04: Financials",
  },
  {
    severity: "high" as const,
    title: "Inflated TAM Logic",
    body: "Associate Note: The bottom-up TAM calculation includes non-serviceable markets (healthcare, government) that require FedRAMP and HIPAA compliance you don't currently hold. This inflates your addressable market by approximately 3.2x.",
    requiredFix: "Remove non-serviceable segments. Present SAM/SOM with regulatory requirements mapped to current certifications.",
    slideRef: "Slide 02: Market Size",
  },
  {
    severity: "medium" as const,
    title: "Missing Competitive Moat Analysis",
    body: "Associate Note: The competitive slide lists features but doesn't articulate switching costs or network effects. Three of your four listed differentiators are replicable within 6-12 months by well-funded incumbents.",
    requiredFix: "Add defensibility framework. Quantify switching costs and identify at least one non-replicable advantage (data, network, regulatory).",
    slideRef: "Slide 07: Competition",
  },
  {
    severity: "medium" as const,
    title: "Weak Team Narrative for Enterprise Sale",
    body: "Associate Note: No team member has enterprise sales experience above $100K ACV. The GTM slide projects 40% revenue from enterprise, creating a credibility gap that will surface in partner reference checks.",
    requiredFix: "Either hire a VP Sales with enterprise track record or adjust revenue mix to reflect current team capabilities.",
    slideRef: "Slide 09: Team",
  },
  {
    severity: "low" as const,
    title: "Inconsistent Financial Projections",
    body: "Associate Note: Revenue projections on Slide 4 ($2.1M ARR by Q4) conflict with the pipeline data on Slide 11 ($890K in weighted pipeline). The implied close rate exceeds 200%.",
    requiredFix: "Align financial model with pipeline data. Present scenario analysis (base, bull, bear) with clearly stated assumptions.",
    slideRef: "Slide 04 / Slide 11",
  },
];

export function DeckAuditView() {
  const [state, setState] = useState<AuditState>("upload");

  const handleUpload = useCallback(() => setState("processing"), []);
  const handleComplete = useCallback(() => setState("report"), []);

  if (state === "upload") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-xl">
          <DeckUploader onUpload={handleUpload} />
        </div>
      </div>
    );
  }

  if (state === "processing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <ProcessingStatus onComplete={handleComplete} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DiligenceScore score={42} redFlagCount={5} companyName="Acme AI, Inc." />

      <div className="grid grid-cols-5 gap-4">
        {/* Deck preview (left 60%) */}
        <div className="col-span-3 surface-card overflow-hidden">
          <div className="relative aspect-[4/3] bg-muted/30 flex items-center justify-center">
            <div className="scanning-line absolute inset-0 pointer-events-none" />
            <div className="text-center px-8">
              <div className="text-6xl font-semibold tracking-tight text-foreground/10 mb-2">ACME AI</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40">
                Series A Pitch Deck · 14 Slides
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <button
                key={i}
                className={`h-8 w-12 rounded border text-[9px] font-mono transition-colors ${
                  i === 0
                    ? "border-accent bg-accent/5 text-accent"
                    : "border-border text-muted-foreground hover:border-accent/30"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </button>
            ))}
            <span className="ml-1 text-[10px] text-muted-foreground">+9 more</span>
          </div>
        </div>

        {/* Diligence feed (right 40%) */}
        <div className="col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Associate Notes</h3>
            <span className="font-mono text-[10px] text-muted-foreground">{mockFlags.length} findings</span>
          </div>
          <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {mockFlags.map((flag, i) => (
              <RedFlagCard key={i} {...flag} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
