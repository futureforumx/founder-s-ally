import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { AnalysisResult, CompanyData } from "./CompanyProfile";

interface InvestorExportProps {
  companyData: CompanyData | null;
  analysisResult: AnalysisResult | null;
}

export function InvestorExport({ companyData, analysisResult }: InvestorExportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!analysisResult) return;
    setExporting(true);

    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = doc.internal.pageSize.getWidth();
      let y = 20;

      // Header
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text(companyData?.name || "Company", 15, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      const meta = [companyData?.stage, companyData?.sector].filter(Boolean).join(" · ");
      if (meta) { doc.text(meta, 15, y); y += 5; }
      if (companyData?.website) { doc.text(companyData.website, 15, y); y += 5; }

      // Divider
      y += 3;
      doc.setDrawColor(220);
      doc.line(15, y, w - 15, y);
      y += 8;

      // Health Score
      doc.setTextColor(40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Health Score", 15, y);
      doc.setFontSize(28);
      const scoreColor = analysisResult.healthScore >= 70 ? [34, 139, 34] : analysisResult.healthScore >= 40 ? [200, 150, 0] : [200, 50, 50];
      doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
      doc.text(`${analysisResult.healthScore}/100`, w - 15, y, { align: "right" });
      y += 12;

      // Executive Summary
      doc.setTextColor(40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Executive Summary", 15, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80);
      const summaryLines = doc.splitTextToSize(analysisResult.executiveSummary, w - 30);
      doc.text(summaryLines, 15, y);
      y += summaryLines.length * 4.5 + 6;

      // Key Metrics
      doc.setTextColor(40);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Key Metrics", 15, y);
      y += 7;

      const metrics = analysisResult.metrics;
      const metricRows = [
        { label: "MRR", data: metrics.mrr },
        { label: "Burn Rate", data: metrics.burnRate },
        { label: "CAC", data: metrics.cac },
        { label: "LTV", data: metrics.ltv },
        { label: "Runway", data: metrics.runway },
      ];

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100);
      doc.text("METRIC", 15, y);
      doc.text("VALUE", 70, y);
      doc.text("CONFIDENCE", 120, y);
      y += 5;
      doc.setDrawColor(230);
      doc.line(15, y, w - 15, y);
      y += 4;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(60);
      metricRows.forEach((row) => {
        doc.text(row.label, 15, y);
        doc.text(row.data.value || "—", 70, y);
        const confLabel = row.data.confidence.charAt(0).toUpperCase() + row.data.confidence.slice(1);
        doc.text(confLabel, 120, y);
        y += 5.5;
      });

      y += 4;

      // Metric Table
      if (analysisResult.metricTable && analysisResult.metricTable.length > 0) {
        doc.setTextColor(40);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Benchmark Comparison", 15, y);
        y += 7;

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100);
        doc.text("METRIC", 15, y);
        doc.text("VALUE", 70, y);
        doc.text("BENCHMARK", 110, y);
        doc.text("STATUS", 155, y);
        y += 5;
        doc.line(15, y, w - 15, y);
        y += 4;

        doc.setFont("helvetica", "normal");
        analysisResult.metricTable.forEach((row) => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.setTextColor(60);
          doc.text(row.metric, 15, y);
          doc.text(row.value, 70, y);
          doc.text(row.benchmark, 110, y);
          const statusColors: Record<string, number[]> = {
            healthy: [34, 139, 34], warning: [200, 150, 0], critical: [200, 50, 50],
          };
          const sc = statusColors[row.status] || [100, 100, 100];
          doc.setTextColor(sc[0], sc[1], sc[2]);
          doc.text(row.status.charAt(0).toUpperCase() + row.status.slice(1), 155, y);
          y += 5.5;
        });
      }

      // Agent Data
      if (analysisResult.agentData) {
        y += 6;
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setTextColor(40);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Verified Company Data", 15, y);
        y += 7;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60);
        if (analysisResult.agentData.teamSize) {
          doc.text(`Team Size: ${analysisResult.agentData.teamSize}`, 15, y); y += 5;
        }
        if (analysisResult.agentData.lastFunding) {
          doc.text(`Latest Round: ${analysisResult.agentData.lastFunding}`, 15, y); y += 5;
        }
        if (analysisResult.agentData.fundingAmount) {
          doc.text(`Amount: ${analysisResult.agentData.fundingAmount}`, 15, y); y += 5;
        }
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(160);
        doc.text(`Generated by Founder Copilot · ${new Date().toLocaleDateString()}`, 15, 288);
        doc.text(`Page ${i} of ${pageCount}`, w - 15, 288, { align: "right" });
      }

      doc.save(`${(companyData?.name || "company").replace(/\s+/g, "-").toLowerCase()}-investor-summary.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  if (!analysisResult) return null;

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
    >
      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {exporting ? "Generating..." : "Investor Export"}
    </button>
  );
}
