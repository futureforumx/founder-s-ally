import type React from "react";

interface QuickFactProps {
  icon: React.ElementType;
  label: string;
  value: string;
}

export function QuickFact({ icon: Icon, label, value }: QuickFactProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-secondary/40 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background border border-border">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}
