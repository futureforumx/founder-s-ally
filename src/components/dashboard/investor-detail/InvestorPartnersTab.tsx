import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowUpRight, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { VCPerson, VCFirm } from "@/hooks/useVCDirectory";

interface InvestorPartnersTabProps {
  firmId: string;
  firmName: string;
  partners: VCPerson[];
  onSelectPerson?: (person: VCPerson) => void;
}

export function InvestorPartnersTab({ firmId, firmName, partners, onSelectPerson }: InvestorPartnersTabProps) {
  const displayPartners = partners.length > 0 ? partners : [];

  if (displayPartners.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No partner data available for {firmName}.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
          Team at {firmName} ({displayPartners.length})
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayPartners.map((p) => (
            <div
              key={p.id}
              onClick={() => onSelectPerson?.(p)}
              className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 cursor-pointer hover:border-accent/40 hover:shadow-sm transition-all group"
            >
              <Avatar className="h-12 w-12 border border-border shrink-0">
                <AvatarFallback className="text-sm font-bold bg-secondary text-muted-foreground">
                  {p.full_name.split(" ").map(n => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors truncate">
                    {p.full_name}
                  </span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent fill-accent/20 shrink-0" />
                </div>
                <span className="text-xs text-muted-foreground">{p.title || "Team Member"}</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
