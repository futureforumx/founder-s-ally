import { CircleDollarSign, FileText, UserPlus } from "lucide-react";

interface ActivityItem {
  icon: React.ElementType;
  text: string;
  time: string;
}

export function InvestorActivity({ firmName }: { firmName: string }) {
  const items: ActivityItem[] = [
    { icon: CircleDollarSign, text: `Led a $4M Seed round in NovaBuild`, time: "2h ago" },
    { icon: FileText, text: "Published a new thesis on Climate Tech", time: "1d ago" },
    { icon: UserPlus, text: "Added Jane Doe as a new General Partner", time: "3d ago" },
  ];

  return (
    <div>
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">Latest</h4>
      <div className="space-y-0">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 py-2 relative">
            {i < items.length - 1 && (
              <div className="absolute left-[11px] top-8 bottom-0 w-px bg-border" />
            )}
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary border border-border z-10">
              <item.icon className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground leading-snug">{item.text}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
