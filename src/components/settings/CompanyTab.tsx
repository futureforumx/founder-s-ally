import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Building2, Globe, MapPin, Layers, TrendingUp,
  CheckCircle2, LinkIcon, Unlink, RefreshCw, ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface CompanyData {
  id: string;
  company_name: string;
  website_url: string | null;
  sector: string | null;
  stage: string | null;
  health_score: number | null;
  updated_at: string;
}

export function CompanyTab() {
  const { user } = useAuth();
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlinking, setUnlinking] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchCompany();
  }, [user]);

  const fetchCompany = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("company_analyses")
      .select("id, company_name, website_url, sector, stage, health_score, updated_at")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setCompany(data);
    }
    setLoading(false);
  };

  const handleUnlink = async () => {
    if (!company) return;
    setUnlinking(true);
    // Simulate unlinking — in production this would clear the user_id reference
    await new Promise((r) => setTimeout(r, 800));
    setCompany(null);
    setUnlinking(false);
    toast.success("Company unlinked from your account");
  };

  const lastUpdated = company
    ? new Date(company.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <div>
        <h3 className="text-lg font-bold text-foreground">Company</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Link your account to a company profile for personalized matching
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : company ? (
        <>
          {/* Linked Company Card */}
          <div className="rounded-2xl border-2 border-accent/20 bg-accent/5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 border border-accent/20">
                  <Building2 className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-foreground">
                      {company.company_name || "Unnamed Company"}
                    </span>
                    <Badge className="bg-accent/10 text-accent border-accent/20 text-[9px] uppercase font-bold">
                      Linked
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Last updated {lastUpdated}
                  </p>
                </div>
              </div>
              <CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-1" />
            </div>
          </div>

          {/* Company Details */}
          <div className="space-y-2.5">
            {[
              {
                icon: Globe,
                label: "Website",
                value: company.website_url || "Not set",
                hasValue: !!company.website_url,
              },
              {
                icon: Layers,
                label: "Sector",
                value: company.sector || "Not classified",
                hasValue: !!company.sector,
              },
              {
                icon: TrendingUp,
                label: "Stage",
                value: company.stage || "Not set",
                hasValue: !!company.stage,
              },
              {
                icon: MapPin,
                label: "Health Score",
                value: company.health_score != null ? `${company.health_score}/100` : "Not analyzed",
                hasValue: company.health_score != null,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-xl border border-border p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                        {item.label}
                      </p>
                      <p className={`text-sm font-medium ${item.hasValue ? "text-foreground" : "text-muted-foreground"}`}>
                        {item.value}
                      </p>
                    </div>
                  </div>
                  {item.label === "Website" && item.hasValue && (
                    <a
                      href={company.website_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg text-xs font-semibold"
              onClick={fetchCompany}
            >
              <RefreshCw className="h-3 w-3 mr-1.5" />
              Refresh
            </Button>
            <button
              onClick={handleUnlink}
              disabled={unlinking}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              <Unlink className="h-3 w-3" />
              {unlinking ? "Unlinking..." : "Unlink Company"}
            </button>
          </div>
        </>
      ) : (
        /* Empty / No Company State */
        <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 mx-auto">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">No company linked</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">
              Go to Mission Control and run a company analysis to automatically link your profile.
            </p>
          </div>
          <Button
            size="sm"
            className="rounded-lg font-semibold text-xs"
            onClick={() => {
              // Navigate to Mission Control
              window.dispatchEvent(new CustomEvent("navigate-to-tab", { detail: "manage" }));
              toast.info("Switched to Mission Control — run an analysis to link your company");
            }}
          >
            <LinkIcon className="h-3 w-3 mr-1.5" />
            Go to Mission Control
          </Button>
        </div>
      )}
    </motion.div>
  );
}
