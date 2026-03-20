import { RefreshCw, Globe, FileText } from "lucide-react";

interface ActivityItem {
  icon: React.ElementType;
  text: string;
  time: string;
}

export function LatestActivity({ companyName }: { companyName: string }) {
  const items: ActivityItem[] = [
    { icon: RefreshCw, text: `${companyName} profile updated`, time: "2h ago" },
    { icon: Globe, text: "New product documentation detected on website", time: "1d ago" },
    { icon: FileText, text: "Pitch deck refreshed with Q1 metrics", time: "3d ago" },
  ];

  return (
    <div>
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2.5">Latest</h4>
      <div className="space-y-0">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 py-2 relative">
            {/* Timeline line */}
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
