import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { CompanyData, AnalysisResult } from "./CompanyProfile";

interface AgentModeProps {
  companyData: CompanyData | null;
  onAgentData: (data: AnalysisResult["agentData"]) => void;
}

export function AgentMode({ companyData, onAgentData }: AgentModeProps) {
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!companyData?.name) {
      toast({ title: "Missing Info", description: "Run an analysis first to enable Agent Mode.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("agent-lookup", {
        body: { companyName: companyData.name, website: companyData.website },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      onAgentData({
        teamSize: data.teamSize || undefined,
        lastFunding: data.lastFunding || undefined,
        fundingAmount: data.fundingAmount || undefined,
        sources: data.sources || [],
      });

      toast({ title: "Agent Complete", description: "Company data verified from public sources." });
    } catch (e) {
      toast({
        title: "Agent Failed",
        description: e instanceof Error ? e.message : "Could not verify company data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleRun}
      disabled={loading || !companyData?.name}
      className="flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
      {loading ? "Searching..." : "Agent Mode"}
    </button>
  );
}
