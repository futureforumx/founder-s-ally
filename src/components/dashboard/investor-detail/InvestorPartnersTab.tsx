import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowUpRight } from "lucide-react";

interface Partner {
  name: string;
  title: string;
  focus: string[];
  bestFor: string;
}

const MOCK_PARTNERS: Partner[] = [
  { name: "Alfred Lin", title: "Partner", focus: ["B2B SaaS", "Enterprise"], bestFor: "Your sector aligns with his recent deals in vertical SaaS" },
  { name: "Jess Lee", title: "Partner", focus: ["Consumer", "Marketplace"], bestFor: "Strong overlap with marketplace-adjacent models" },
  { name: "Pat Grady", title: "Partner", focus: ["Cloud Infrastructure", "DevTools"], bestFor: "Relevant if your product has a platform/infra angle" },
];

export function InvestorPartnersTab({ firmName }: { firmName: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
          Recommended Contacts at {firmName}
        </h4>
        <div className="space-y-2">
          {MOCK_PARTNERS.map((p) => (
            <div
              key={p.name}
              className="rounded-xl border border-border bg-card p-4 hover:border-accent/20 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary border border-border text-sm font-bold text-muted-foreground">
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                      <CheckCircle2 className="h-3.5 w-3.5 text-accent fill-accent/20" />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{p.title}</span>
                  </div>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex gap-1.5 mb-2">
                {p.focus.map((f) => (
                  <Badge key={f} variant="secondary" className="text-[9px] px-2 py-0.5">{f}</Badge>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                "{p.bestFor}"
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
