import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Loader2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserCredits, exportInvestorCSV } from "@/hooks/useContactReveal";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const INTENT_OPTIONS = [
  { value: "crm_import", label: "CRM Import" },
  { value: "offline_analysis", label: "Offline Analysis" },
  { value: "portfolio_review", label: "Portfolio Review" },
  { value: "other", label: "Other" },
];

interface ExportGateButtonProps {
  recordCount?: number;
}

export function ExportGateButton({ recordCount = 0 }: ExportGateButtonProps) {
  const { data: credits } = useUserCredits();
  const [modalOpen, setModalOpen] = useState(false);
  const [intent, setIntent] = useState("crm_import");
  const [exporting, setExporting] = useState(false);

  const tier = credits?.tier || "free";
  const isAllowed = tier === "pro" || tier === "admin";

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportInvestorCSV(intent);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `investor_directory_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export complete");
      setModalOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (!isAllowed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="opacity-50 cursor-not-allowed"
            disabled
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] text-center">
          <p className="text-xs">Upgrade required to export proprietary data.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setModalOpen(true)}
        className="gap-1.5"
      >
        <Download className="h-4 w-4" />
        Export CSV
      </Button>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !exporting && setModalOpen(false)}
            />
            <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                className="pointer-events-auto max-w-md w-full bg-card rounded-2xl shadow-2xl border border-border p-6"
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
              >
                <div className="flex items-start gap-3 mb-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 shrink-0">
                    <FileSpreadsheet className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">Export Investor Data</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      You are exporting <span className="font-semibold text-foreground">{recordCount}</span> records.
                      Please select your intent to comply with our Terms of Service.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Export Intent
                  </label>
                  <select
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {INTENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/60 mb-5 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-accent shrink-0" />
                  <span>This export will be logged for audit compliance.</span>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalOpen(false)}
                    disabled={exporting}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleExport}
                    disabled={exporting}
                    className="gap-1.5"
                  >
                    {exporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {exporting ? "Exporting…" : "Confirm Export"}
                  </Button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
