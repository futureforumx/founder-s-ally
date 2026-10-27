import { useMemo } from "react";
import { Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useCompanyMetrics } from "@/hooks/useCompanyMetrics";
import { FounderMetricsSetup } from "./FounderMetricsSetup";
import { readMetricAttributions } from "./deckMetricsExtraction";

export interface DeckMetricsConfirmationProps {
  onReupload?: () => void;
  onSkip?: () => void;
  onConfirm?: () => void;
}

export function DeckMetricsConfirmation({ onReupload, onSkip, onConfirm }: DeckMetricsConfirmationProps) {
  const { metrics, update, saveState, retry } = useCompanyMetrics();
  const attributions = useMemo(() => readMetricAttributions(), []);

  const handleConfirm = () => {
    toast({
      title: "Metrics saved to your data room",
      description: "Your latest founder metrics are ready for investors.",
    });
    onConfirm?.();
  };

  return (
    <div className="relative w-full bg-neutral-950 pb-24">
      <FounderMetricsSetup
        metrics={metrics}
        update={update}
        saveState={saveState}
        retry={retry}
        attributions={attributions}
      />
      <footer className="sticky bottom-0 z-20 mt-10 flex flex-col gap-3 border-t border-neutral-800 bg-neutral-950/95 px-1 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onReupload} className="text-sm text-neutral-400 hover:text-neutral-200">
          <Upload className="mr-1.5 inline h-4 w-4" />Re-upload Deck
        </button>
        <div className="flex items-center justify-end">
          <button type="button" onClick={onSkip} className="mr-4 text-sm text-neutral-400 hover:text-neutral-200">Skip for now</button>
          <button type="button" onClick={handleConfirm} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500">Confirm &amp; Save to Data Room</button>
        </div>
      </footer>
    </div>
  );
}

export default DeckMetricsConfirmation;
