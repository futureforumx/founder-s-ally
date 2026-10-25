import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatsCardProps {
  title: string;
  value: string;
  icon: ReactNode;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  description: string;
  className?: string;
  style?: CSSProperties;
  onClick: () => void;
}

const CHANGE_COLOR = {
  positive: "text-emerald-500",
  negative: "text-destructive",
  neutral: "text-neutral-400",
} as const;

export function StatsCard({
  title,
  value,
  icon,
  change,
  changeType,
  description,
  className,
  style,
  onClick,
}: StatsCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      style={style}
      className={cn(
        "group relative w-full cursor-pointer border-neutral-800 bg-neutral-900/40 text-neutral-100 transition-all hover:border-neutral-700 hover:bg-neutral-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500",
        className,
      )}
    >
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="font-sans text-sm font-medium text-neutral-400">
          {title}
        </CardTitle>
        <span className="flex items-center gap-2 text-neutral-400">
          {icon}
          <ArrowUpRight className="h-4 w-4 text-neutral-500 transition-colors group-hover:text-neutral-200" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="font-mono text-2xl font-bold tabular-nums text-neutral-100">
          {value}
        </div>
        <p className={cn("mt-1 text-xs font-medium", CHANGE_COLOR[changeType])}>
          {change}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
