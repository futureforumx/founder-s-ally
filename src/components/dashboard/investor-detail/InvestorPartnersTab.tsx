import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowUpRight, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getPartnersForFirm, type PartnerPerson } from "./types";

interface InvestorPartnersTabProps {
  firmName: string;
  onSelectPartner?: (partner: PartnerPerson) => void;
}

export function InvestorPartnersTab({ firmName, onSelectPartner }: InvestorPartnersTabProps) {
  const partners = getPartnersForFirm(firmName);

  // Fallback to generic if no relational data
  const fallbackPartners: PartnerPerson[] = partners.length > 0 ? partners : [
    { id: "generic-1", name: "Partner 1", title: "Partner", focus: ["Multi-stage"], boardSeats: [], linkedIn: "" },
    { id: "generic-2", name: "Partner 2", title: "Partner", focus: ["Multi-stage"], boardSeats: [], linkedIn: "" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
          Recommended Contacts at {firmName}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fallbackPartners.map((p) => (
            <div
              key={p.id}
              onClick={() => onSelectPartner?.(p)}
              className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 cursor-pointer hover:border-accent/40 hover:shadow-sm transition-all group"
            >
              {/* Circular Avatar */}
              <Avatar className="h-12 w-12 border border-border shrink-0">
                <AvatarFallback className="text-sm font-bold bg-secondary text-muted-foreground">
                  {p.name.split(" ").map(n => n[0]).join("")}
                </AvatarFallback>
              </Avatar>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground group-hover:text-accent transition-colors truncate">
                    {p.name}
                  </span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent fill-accent/20 shrink-0" />
                </div>
                <span className="text-xs text-muted-foreground">{p.title}</span>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {p.focus.slice(0, 2).map((f) => (
                    <Badge key={f} variant="secondary" className="text-[9px] px-1.5 py-0">{f}</Badge>
                  ))}
                </div>
              </div>

              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
