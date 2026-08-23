import { useId } from "react";
import { cn } from "@/lib/utils";

export function VelocitySparkline({
  values,
  className,
  accent = false,
}: {
  values: number[];
  className?: string;
  accent?: boolean;
}) {
  const gradId = useId();
  if (values.length < 2) {
    return <div className={cn("h-8 w-20", className)} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 88;
  const h = 28;
  const pts = values.map((value, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((value - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = values[values.length - 1] ?? 0;
  const first = values[0] ?? 0;
  const up = last >= first;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-7 w-[5.5rem]", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent || up ? "hsl(var(--success))" : "hsl(var(--primary))"} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent || up ? "hsl(var(--success))" : "hsl(var(--primary))"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill={`url(#${gradId})`}
        points={`0,${h} ${pts.join(" ")} ${w},${h}`}
      />
      <polyline
        fill="none"
        stroke={up ? "hsl(var(--success))" : "hsl(var(--primary))"}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.join(" ")}
      />
    </svg>
  );
}
